/**
 * Test 1 — Cesium viewer initialisation check
 *
 * Confirms that render.html loads and the Cesium <canvas> is present in the
 * DOM, without taking a screenshot.
 *
 * Prerequisites:
 *   npm run dev   (Next.js dev server must be running on port 3000)
 *
 * Run:
 *   npm run test1
 */

import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:3000';

/** Minimal mission data — uses an invalid API key so tiles will not load,
 *  but the Cesium Viewer itself still initialises. */
const TEST_MISSION = {
    order_id: 'test1',
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
    console.log('[test1] Launching browser…');
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

        console.log(`[test1] Navigating to ${BASE_URL}/render.html…`);
        await page.goto(`${BASE_URL}/render.html`, { waitUntil: 'load', timeout: 30000 });

        // Wait for the Cesium canvas element to appear in the DOM
        await page.waitForSelector('#cesiumContainer canvas', { timeout: 15000 });

        console.log('[test1] ✅ PASS — Cesium canvas found. Globe viewer initialised.');
    } catch (err) {
        console.error('[test1] ❌ FAIL —', err.message);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

run();
