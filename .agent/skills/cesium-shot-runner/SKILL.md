# Cesium Shot Runner Skill

This skill integrates with Cesium and ensures that:
1. Five deterministic boundary PNGs are provided.
2. Field of View (FOV) is set to 100 degrees.
3. Headings and pitches are fixed for consistency.
4. `waitForTiles` is set to 3x300ms for stable loading times.
5. Black-frame detection exceeds 95% for dark scenes.
6. Tasks are processed in a sequential queue.
7. Outputs are directed to `/data/jobs/<job_id>/` and a complete signal is provided by `manifest.json`.