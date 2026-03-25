import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { order_id, centroid, geometry } = req.body;
    if (!order_id || !centroid || !geometry) {
        return res.status(400).json({ error: 'Missing required fields: order_id, centroid, geometry' });
    }

    const snapshotDir = path.join(process.cwd(), 'public/snapshots', order_id);
    await fs.mkdir(snapshotDir, { recursive: true });

    let browser;
    try {
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
            order_id,
            centroid,
            geometry,
            google_api_key: (process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim(),
            shots: ['nadir', 'cardinal', 'east', 'south', 'west']
        });

        const pngFiles = {};
        await page.exposeFunction('capturePass', async (shotName) => {
            try {
                const pngPath = path.join(snapshotDir, `${shotName}.png`);
                await page.screenshot({ path: pngPath, type: 'png' });
                pngFiles[shotName] = pngPath;
                console.log(`✅ Captured: ${shotName}`);
                return true;
            } catch (err) {
                console.error(`❌ Capture error (${shotName}):`, err.message);
                return false;
            }
        });

        console.log('[API] Launching Puppeteer to http://localhost:3000/render.html');
        await page.goto('http://localhost:3000/render.html', { waitUntil: 'load', timeout: 150000 });
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
                    reject(new Error('Browser-side mission failed. Check logs for details.'));
                }
            });
        });

        const shots = {};
        ['nadir', 'cardinal', 'east', 'south', 'west'].forEach((name) => {
            if (pngFiles[name]) {
                shots[name] = { png_path: pngFiles[name], png_url: `/snapshots/${order_id}/${name}.png` };
            }
        });

        res.status(200).json({ status: 'success', order_id, shots, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('[API] Fatal error:', err.message);
        res.status(500).json({ status: 'error', message: err.message, order_id });
    } finally {
        if (browser) await browser.close();
    }
}