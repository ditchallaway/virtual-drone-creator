import express from 'express';
import { rateLimit } from 'express-rate-limit';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Single-job mutex ──────────────────────────────────────────────────────────
let busy = false;

// ── Rate limiter: max 20 render requests per 10 minutes per IP ────────────────
const renderLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
});

// ── POST /api/render ──────────────────────────────────────────────────────────
app.post('/api/render', renderLimiter, async (req, res) => {
    if (busy) {
        return res.status(503).json({ error: 'A render job is already in progress. Please retry shortly.' });
    }

    const { job_id, centroid, geometry, centroid_elevation } = req.body;
    if (!job_id || !centroid || !geometry) {
        return res.status(400).json({ error: 'Missing required fields: job_id, centroid, geometry' });
    }

    busy = true;
    const jobDir = path.join('/data/jobs', job_id);
    const manifestPath = path.join(jobDir, 'manifest.json');
    const logPath = path.join(jobDir, 'job.log');
    const createdAt = new Date().toISOString();

    const shots = ['north', 'east', 'south', 'west', 'nadir'];

    async function appendLog(msg) {
        const line = `[${new Date().toISOString()}] ${msg}\n`;
        process.stdout.write(line);
        await fs.appendFile(logPath, line).catch(() => {});
    }

    async function writeManifest(status, extra = {}) {
        const manifest = {
            job_id,
            status,
            created_at: createdAt,
            updated_at: new Date().toISOString(),
            inputs: {
                centroid,
                centroid_elevation: centroid_elevation ?? 0,
                geometry_type: geometry.type
            },
            outputs: status === 'complete'
                ? Object.fromEntries(shots.map(s => [s, `${s}.png`]))
                : {},
            validation: {
                black_frame_threshold_pct: 95,
                tile_settle_ticks: 3,
                tile_settle_interval_ms: 300,
                tile_settle_timeout_ms: 120000
            },
            render: {
                resolution: { width: 2048, height: 1536 },
                fov_degrees: 100,
                shots: [
                    { name: 'north', heading_degrees: 0,   pitch_degrees: -35   },
                    { name: 'east',  heading_degrees: 90,  pitch_degrees: -35   },
                    { name: 'south', heading_degrees: 180, pitch_degrees: -35   },
                    { name: 'west',  heading_degrees: 270, pitch_degrees: -35   },
                    { name: 'nadir', heading_degrees: 0,   pitch_degrees: -89.9 }
                ]
            },
            errors: [],
            ...extra
        };
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        return manifest;
    }

    let browser;
    try {
        await fs.mkdir(jobDir, { recursive: true });
        await writeManifest('running');
        await appendLog(`Job started: ${job_id}`);

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--ignore-gpu-blocklist',
                '--use-gl=angle',
                '--use-angle=swiftshader'
            ]
        });

        const page = await browser.newPage();
        await page.setCacheEnabled(false);
        await page.setViewport({ width: 2048, height: 1536 });
        await page.evaluateOnNewDocument((data) => {
            window.__MISSION_DATA__ = data;
        }, {
            job_id,
            centroid,
            geometry,
            google_api_key: (process.env.GOOGLE_API_KEY || '').trim(),
            shots
        });

        const capturedFiles = {};
        await page.exposeFunction('capturePass', async (shotName) => {
            try {
                const pngPath = path.join(jobDir, `${shotName}.png`);
                await page.screenshot({ path: pngPath, type: 'png' });
                capturedFiles[shotName] = pngPath;
                await appendLog(`Captured: ${shotName}`);
                return true;
            } catch (err) {
                await appendLog(`Capture error (${shotName}): ${err.message}`);
                return false;
            }
        });

        const port = process.env.PORT || 3000;
        await appendLog(`Navigating to http://localhost:${port}/render.html`);
        await page.goto(`http://localhost:${port}/render.html`, { waitUntil: 'load', timeout: 150000 });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Render timeout (10 minutes exceeded)'));
            }, 600000);
            page.on('console', (msg) => {
                const text = msg.text();
                if (text === 'MISSION_COMPLETE') {
                    clearTimeout(timeout);
                    resolve();
                } else if (text === 'MISSION_ERROR') {
                    clearTimeout(timeout);
                    reject(new Error('Browser-side mission failed. Check job.log for details.'));
                }
            });
        });

        const manifest = await writeManifest('complete');
        await appendLog(`Job complete: ${job_id}`);
        res.status(200).json(manifest);
    } catch (err) {
        await appendLog(`Fatal error: ${err.message}`);
        const manifest = await writeManifest('error', { errors: [err.message] }).catch(() => null);
        res.status(500).json(manifest ?? { status: 'error', job_id, message: err.message });
    } finally {
        busy = false;
        if (browser) await browser.close();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`virtual-drone-creator listening on port ${PORT}`);
});
