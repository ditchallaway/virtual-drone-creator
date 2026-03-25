# Handoff Contract — Atomic Boundary Renderer

## Purpose
This service performs exactly one job: **render 5 PNG snapshots of a single property boundary** (North, East, South, West, Nadir) and **persist them locally** for downstream pickup. No notifications, no uploads, no extra enrichment.

Downstream systems MUST treat the job folder as the handoff interface.

---

## API

### `POST /render`
Creates a render job and writes artifacts to local disk.

#### Request JSON (minimum)
```json
{
  "job_id": "string",
  "centroid": [-105.0, 40.0],
  "centroid_elevation": 1600,
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [-105.001, 40.001],
        [-104.999, 40.001],
        [-104.999, 39.999],
        [-105.001, 39.999],
        [-105.001, 40.001]
      ]
    ]
  }
}
```

#### Field rules
- `job_id` (**required**): caller-provided identifier. Used as the job folder name.
- `centroid`: `[lon, lat]` (WGS84).
- `centroid_elevation`: meters. If unknown, send `0`.
- `geometry`: GeoJSON Polygon (outer ring required). Holes optional.

#### Successful response (200)
Returns the job manifest JSON (same as written to disk). See **Manifest Schema**.

#### Error responses
- `400`: invalid JSON or missing/invalid required fields.
- `500`: render failure (also reflected on disk in `manifest.json` with `status: "error"` if possible).

---

## Filesystem Handoff

### Output root
The renderer writes to a single root directory:

- **`/data/jobs/<job_id>/`**

`/data` must be a persistent volume mount in Docker.

### Files written
Each successful job produces exactly:

- `north.png`
- `east.png`
- `south.png`
- `west.png`
- `nadir.png`
- `manifest.json`
- `job.log` (append-only text log; optional but recommended)

### Atomicity / “done” signal
Downstream must treat **`manifest.json` with `status: "complete"`** as the sole “handoff complete” signal.

Recommended write order:
1. Create job dir
2. Write `manifest.json` with `status: "running"`
3. Write PNGs (temporary filenames allowed)
4. Validate PNGs (tile settle + black-frame checks)
5. Write final PNG filenames
6. Write `manifest.json` with `status: "complete"`

If a job fails:
- Write/update `manifest.json` with `status: "error"` and an error message.

---

## Manifest Schema

### `manifest.json` (example)
```json
{
  "job_id": "2026-03-25_000123",
  "status": "complete",
  "created_at": "2026-03-25T07:12:33.120Z",
  "updated_at": "2026-03-25T07:14:10.004Z",
  "inputs": {
    "centroid": [-105.0, 40.0],
    "centroid_elevation": 1600,
    "geometry_type": "Polygon"
  },
  "outputs": {
    "north": "north.png",
    "east": "east.png",
    "south": "south.png",
    "west": "west.png",
    "nadir": "nadir.png"
  },
  "validation": {
    "black_frame_threshold_pct": 95,
    "tile_settle_ticks": 3,
    "tile_settle_interval_ms": 300,
    "tile_settle_timeout_ms": 120000
  },
  "render": {
    "resolution": { "width": 2048, "height": 1536 },
    "fov_degrees": 100,
    "shots": [
      { "name": "north", "heading_degrees": 0, "pitch_degrees": -35 },
      { "name": "east",  "heading_degrees": 90, "pitch_degrees": -35 },
      { "name": "south", "heading_degrees": 180, "pitch_degrees": -35 },
      { "name": "west",  "heading_degrees": 270, "pitch_degrees": -35 },
      { "name": "nadir", "heading_degrees": 0, "pitch_degrees": -89.9 }
    ]
  },
  "errors": []
}
```

### `status` values
- `running`: job started; outputs may be incomplete.
- `complete`: all 5 PNGs written and validated.
- `error`: job failed; outputs may be missing or partial.

---

## Concurrency Contract
The renderer processes **exactly one job at a time** to reduce WebGL instability and ensure tiles fully settle before capture.

---

## Validation Contract
The renderer must apply:
1. **Tile settle**: require *stable loaded* state for 3 ticks at 300ms (900ms stable) with a 120s timeout.
2. **Black-frame detection**: treat image as failed if **>95%** of pixels are “dark” (exact definition belongs to implementation; threshold is contractual).

If validation fails for any shot:
- mark job `error`
- include details in `manifest.json.errors`
- do not mark `complete`

---

## Downstream Pickup Guidance
A downstream consumer should:

1. Watch `/data/jobs/*/manifest.json`
2. Read manifest
3. If `status !== "complete"`, do nothing
4. If `status === "complete"`, load the 5 PNGs via relative paths in `outputs`
5. After successful pickup, optionally archive the folder or mark it as picked up (pipeline-specific).