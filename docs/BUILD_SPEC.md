# Virtual Drone Creator — Build Specification

This document is the authoritative reference for future agents building this service. It consolidates all requirements, contracts, rendering parameters, and implementation gaps into one place.

---

## 1. What This Service Does

`virtual-drone-creator` is a **single-purpose aerial rendering microservice**. Given a property boundary (GeoJSON Polygon), it produces five deterministic PNG snapshots of that boundary from drone-like perspectives using the Cesium 3D geospatial engine running inside a headless browser (Puppeteer).

The service exposes one HTTP endpoint (`POST /render`). It processes exactly one job at a time. When a job is complete, it writes output files to a shared persistent volume and signals completion via `manifest.json`.

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 (Alpine) |
| Web framework | Next.js | ^12.0.7 |
| 3D rendering engine | Cesium | ^1.89.0 |
| Browser automation | Puppeteer | ^20.3.7 |
| Image validation | Sharp | ^0.30.8 |
| Container | Docker | — |

Environment variable required:
- `NEXT_PUBLIC_GOOGLE_API_KEY` — Google Maps API key (set in `.env.local`)

---

## 3. API Contract

### `POST /render`

#### Request body (JSON)

```json
{
  "job_id": "string",
  "centroid": [-105.0, 40.0],
  "centroid_elevation": 1600,
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [-105.001, 40.001],
      [-104.999, 40.001],
      [-104.999, 39.999],
      [-105.001, 39.999],
      [-105.001, 40.001]
    ]]
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `job_id` | string | ✅ | Caller-supplied unique identifier |
| `centroid` | [lon, lat] | ✅ | WGS84 decimal degrees |
| `centroid_elevation` | number | ✅ | Meters above sea level |
| `geometry` | GeoJSON Polygon | ✅ | Boundary to render |

#### Responses

| Status | Meaning |
|---|---|
| `200` | Render complete; body is the full `manifest.json` |
| `400` | Invalid JSON or missing required fields |
| `500` | Render failure |

---

## 4. Rendering Parameters (Fixed / Non-Negotiable)

| Parameter | Value |
|---|---|
| Output resolution | 2048 × 1536 px |
| Field of view (FOV) | 100° |
| Cardinal pitch | −35° |
| Nadir pitch | −89.9° |
| Tile settlement ticks | 3 |
| Tile settlement interval | 300 ms |
| Tile settlement total wait | 900 ms |
| Tile settlement timeout | 120 000 ms |
| Black-frame threshold | > 95 % dark pixels = failure |

### Shot list (5 images per job)

| Name | Heading | Pitch |
|---|---|---|
| `north` | 0° | −35° |
| `east` | 90° | −35° |
| `south` | 180° | −35° |
| `west` | 270° | −35° |
| `nadir` | 0° | −89.9° |

---

## 5. Filesystem Output Contract

All output is written to a **persistent volume** mounted at `/data/jobs/`.

### Directory layout per job

```
/data/jobs/<job_id>/
  north.png
  east.png
  south.png
  west.png
  nadir.png
  manifest.json
  job.log          ← optional append-only text log
```

### `manifest.json` schema

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
      { "name": "north",  "heading_degrees": 0,   "pitch_degrees": -35   },
      { "name": "east",   "heading_degrees": 90,  "pitch_degrees": -35   },
      { "name": "south",  "heading_degrees": 180, "pitch_degrees": -35   },
      { "name": "west",   "heading_degrees": 270, "pitch_degrees": -35   },
      { "name": "nadir",  "heading_degrees": 0,   "pitch_degrees": -89.9 }
    ]
  },
  "errors": []
}
```

`status` values: `"running"` → `"complete"` or `"error"`

### Downstream consumption flow

1. Downstream system polls `/data/jobs/*/manifest.json`.
2. If `status !== "complete"`, skip.
3. If `status === "complete"`, read the five PNGs via relative paths.
4. After pickup, optionally archive or mark the job as consumed.

The service **does not notify** downstream consumers — they must poll.

---

## 6. Concurrency Model

- **Single-job mutex:** Only one render job runs at a time to avoid WebGL instability.
- Incoming requests while a job is running must queue (or return `503 Busy`).
- This is intentional; do not parallelize rendering.

---

## 7. Puppeteer / Browser Configuration

```js
{
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
    '--use-angle=swiftshader'
  ]
}
```

- SwiftShader provides a software WebGL fallback for containerized/headless environments.
- The render page must signal completion by emitting `"MISSION_COMPLETE"` or `"MISSION_ERROR"` to the browser console.
- Global render timeout: 600 000 ms (10 minutes).

---

## 8. Implementation Status — What Is Built vs. What Is Missing

### ✅ Already exists

| Item | Location |
|---|---|
| Next.js API skeleton (`POST /render`) | `pages/api/render.js` |
| Puppeteer browser launch + screenshot wiring | `pages/api/render.js` |
| Docker build & compose files | `Dockerfile`, `docker-compose.yml` |
| `package.json` with correct dependencies | `package.json` |
| Full API + filesystem specification | `docs/10-handoff.md` |
| Cesium shot-runner skill notes | `.agent/skills/cesium-shot-runner/SKILL.md` |

### ❌ Not yet built (must be implemented)

| Item | Notes |
|---|---|
| **`public/render.html`** — Cesium rendering page | Core missing piece. Cesium scene, camera control, tile-wait loop, and `MISSION_COMPLETE`/`MISSION_ERROR` console signals all live here. |
| **Mutex / job queue** | Prevent concurrent renders. |
| **`/data/jobs/<job_id>/` output wiring** | Current code writes to `public/snapshots/<order_id>/`; must change to `/data/jobs/<job_id>/`. |
| **`manifest.json` writer** | Write manifest at job start (`status: "running"`), update on completion/error. |
| **Tile settlement loop** | 3 ticks × 300 ms, 120 s timeout, inside `render.html`. |
| **Black-frame detection** | Use Sharp; reject images where > 95 % pixels are dark. |
| **`job.log` writer** | Append-only text log per job (optional but in spec). |
| **Field name alignment** | API currently uses `order_id`; spec requires `job_id`. Fix in `pages/api/render.js`. |
| **`docker-compose.yml` finalisation** | Replace placeholder image name and volume path. Volume must map to `/data/jobs`. |

---

## 9. Key Constraints Summary

- Output resolution is always 2048 × 1536. Never change this.
- FOV is always 100°. Never change this.
- Exactly 5 shots per job, in the exact headings/pitches listed above.
- Job output path is always `/data/jobs/<job_id>/` on a persistent volume.
- `manifest.json` is the sole handoff signal — downstream consumers depend on it.
- No downstream notifications; filesystem polling only.
- One job at a time; no concurrent renders.
