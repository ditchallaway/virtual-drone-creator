/**
 * Test 1 — Environment check
 *
 * Steps:
 *  1. Confirm Docker CLI is installed (error → "start Docker Desktop")
 *  2. Confirm Docker daemon is running
 *  3. Read the Cesium host port from docker-compose.yml (default 3000)
 *  4. If the container is not running, start it with docker-compose
 *  5. Use Puppeteer to confirm the port responds in a browser
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function run(cmd, cwd = ROOT) {
    return execSync(cmd, { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function pass(msg) { console.log(`  ✅  ${msg}`); }
function fail(msg) { console.error(`  ❌  ${msg}`); process.exit(1); }
function info(msg) { console.log(`  ℹ️   ${msg}`); }

async function test1() {
    console.log('\n[Test 1] Environment check\n');

    // ── Step 1: Docker CLI present ────────────────────────────────────────────
    info('Checking for Docker CLI...');
    try {
        const ver = run('docker --version');
        pass(`Docker found: ${ver}`);
    } catch {
        fail('Docker CLI not found. Please start Docker Desktop and try again.');
    }

    // ── Step 2: Docker daemon running ─────────────────────────────────────────
    info('Checking if Docker daemon is running...');
    try {
        run('docker info');
        pass('Docker daemon is running.');
    } catch {
        fail('Docker daemon is not responding. Please start Docker Desktop and try again.');
    }

    // ── Step 3: Read host port from docker-compose.yml ────────────────────────
    let hostPort = 3000;
    try {
        const compose = readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
        // Look specifically inside the ports: block for HOST:CONTAINER mappings.
        // Supports both quoted ("3000:3000") and unquoted (3000:3000) forms.
        const portsBlock = compose.match(/^\s+ports:\s*\n((?:\s+-\s+["']?\d+:\d+["']?\s*\n)+)/m);
        if (portsBlock) {
            const m = portsBlock[1].match(/["']?(\d+):\d+["']?/);
            if (m) hostPort = parseInt(m[1], 10);
        }
    } catch {
        info('Could not read docker-compose.yml — assuming port 3000.');
    }
    info(`Cesium host port: ${hostPort}`);

    // ── Step 4: Check / start container ──────────────────────────────────────
    info('Checking if container is running...');
    let containerUp = false;
    try {
        // docker-compose ps lists running services; filter blank lines
        const ps = run('docker-compose ps --services --filter status=running');
        containerUp = ps.split('\n').filter(Boolean).length > 0;
    } catch {
        containerUp = false;
    }

    if (!containerUp) {
        info('Container is not running — starting with docker-compose up -d...');
        const result = spawnSync('docker-compose', ['up', '-d', '--build'], {
            cwd: ROOT,
            stdio: 'inherit',
            encoding: 'utf8'
        });
        if (result.status !== 0) {
            fail('docker-compose up failed. Check the output above for details.');
        }
        pass('Container started.');
        // Poll until the port responds (up to 60 s, checking every 2 s)
        info('Waiting for service to become ready...');
        const deadline = Date.now() + 60000;
        let ready = false;
        while (Date.now() < deadline) {
            try {
                run(`docker-compose ps --services --filter status=running`);
                // Simple TCP check via curl (lightweight, no Puppeteer overhead here)
                run(`curl -sf --max-time 2 http://localhost:${hostPort}`);
                ready = true;
                break;
            } catch {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        if (!ready) fail('Service did not become ready within 60 s.');
        pass('Service is ready.');
    } else {
        pass('Container is already running.');
    }

    // ── Step 5: Browser confirmation ──────────────────────────────────────────
    info(`Opening browser → http://localhost:${hostPort} ...`);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        const response = await page.goto(`http://localhost:${hostPort}`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        const status = response ? response.status() : null;
        if (status && status < 500) {
            pass(`Browser confirmed: http://localhost:${hostPort} responded with HTTP ${status}.`);
        } else {
            fail(`Browser received HTTP ${status} — service may not be healthy.`);
        }
    } catch (err) {
        fail(`Browser check failed: ${err.message}`);
    } finally {
        if (browser) await browser.close();
    }

    console.log('\n[Test 1] ✅  All checks passed.\n');
}

test1().catch(err => {
    console.error('[Test 1] Unexpected error:', err.message);
    process.exit(1);
});
