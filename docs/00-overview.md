# Overview

This document provides an overview of the atomic boundary renderer service implementation, detailing the API, rendering processes, storage handoff, and other essential information.

## Key Points:
- Implements a mutex to handle one-job-at-a-time processing.
- Each rendering job produces five PNG outputs (north, east, south, west, nadir) and a manifest.json file saved in `/data/jobs/<job_id>/`.
- The rendering process uses `Cesium render.html` with `camera.setView` having FOV of 100, with fixed headings at 0, 90, 180, and 270 degrees, and nadir pitch set to -89.9 degrees, cardinal pitch at -35 degrees.
- The renderer will wait for tiles, requiring 3 stable ticks (at 300ms each, totaling 900ms) with a timeout set at 120 seconds.
- Black frame detection is implemented, triggering if more than 95% of pixels are detected as dark using the `sharp` module.