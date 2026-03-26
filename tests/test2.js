/**
 * Test 2 — Cesium viewer screenshot confirmation
 *
 * Similar to test 1, but also takes a screenshot of the rendered globe and
 * saves it to public/snapshots/test/globe.png so you can view it in a browser.
 *
 * Prerequisites:
 *   npm run dev   (Next.js dev server must be running on port 3000)
 *
 * Run:
 *   npm run test2
 *
 * Then open in your browser:
 *   http://localhost:3000/snapshots/test/globe.png
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'public', 'snapshots', 'test');
const SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'globe.png');
const SCREENSHOT_URL = `${BASE_URL}/snapshots/test/globe.png`;

/** Minimal mission data — uses an invalid API key so tiles will not load,
 *  but the Cesium Viewer itself still initialises. */
const TEST_MISSION = {
    order_id: 'test2',
    centroid: [-105.0, 40.0],
    geometry: {
        type: 'Polygon',
        coordinates: [[
            [-105.001, 40.001],
            [-104.999, 40.001],
            [-104.999, 39.999],
            [-105.001, 39.999],
            [-105.001, 40.001],
        ]],
    },
    google_api_key: 'TEST_KEY',
    shots: ['nadir'],
};

async function run() {
    console.log('[test2] Launching browser…');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--ignore-gpu-blocklist',
            '--use-gl=angle',
            '--use-angle=swiftshader',
        ],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        // Inject mission data before the page script runs
        await page.evaluateOnNewDocument((data) => {
            window.__MISSION_DATA__ = data;
        }, TEST_MISSION);

        console.log(`[test2] Navigating to ${BASE_URL}/render.html…`);
        await page.goto(`${BASE_URL}/render.html`, { waitUntil: 'load', timeout: 30000 });

        // Wait for the Cesium canvas element to appear in the DOM
        await page.waitForSelector('#cesiumContainer canvas', { timeout: 15000 });

        console.log('[test2] ✅ Cesium canvas found. Globe viewer initialised.');

        // Give the globe a moment to render its initial frame
        await new Promise((r) => setTimeout(r, 2000));

        // Take screenshot and save to public directory
        await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: SCREENSHOT_PATH, type: 'png' });

        console.log(`[test2] ✅ PASS — Screenshot saved.`);
        console.log(`[test2] 👁  View in browser: ${SCREENSHOT_URL}`);
    } catch (err) {
        console.error('[test2] ❌ FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

run();
