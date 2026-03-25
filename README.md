# virtual-drone-creator

A minimal service that renders **5 PNG aerial snapshots** of a property boundary using Cesium + Google Photorealistic 3D Tiles, driven by Puppeteer, and served via Next.js.

**What it does:**
- Accepts a GeoJSON polygon boundary and centroid
- Renders nadir (top-down) and 4 cardinal (N/E/S/W) shots with a yellow boundary overlay
- Returns PNG file paths and URLs for each shot

**What it does NOT do:** no PSD output, no road overlays, no push notifications, no external uploads.

---

## Quick Start (Docker)

```bash
# 1. Copy environment file
cp .env.local.example .env.local
# Edit .env.local and set NEXT_PUBLIC_GOOGLE_API_KEY

# 2. Start the service
docker-compose up
```

The API is available at `http://localhost:3000`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_API_KEY` | Yes | Google Maps / Photorealistic 3D Tiles API key |

Create a `.env.local` file at the project root:

```
NEXT_PUBLIC_GOOGLE_API_KEY=your_key_here
```

---

## API

### `POST /api/render`

Renders 5 PNG shots for a property boundary and returns their paths.

#### Request Body (JSON)

```json
{
  "order_id": "job-001",
  "centroid": [-105.0, 40.0],
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

| Field | Type | Required | Description |
|---|---|---|---|
| `order_id` | string | Yes | Unique job identifier; used as the snapshot folder name |
| `centroid` | `[lon, lat]` | Yes | WGS84 centre point of the property |
| `geometry` | GeoJSON Polygon | Yes | Boundary polygon (outer ring required) |

#### Successful Response (200)

```json
{
  "status": "success",
  "order_id": "job-001",
  "shots": {
    "nadir":    { "png_path": "/abs/path/nadir.png",    "png_url": "/snapshots/job-001/nadir.png" },
    "cardinal": { "png_path": "/abs/path/cardinal.png", "png_url": "/snapshots/job-001/cardinal.png" },
    "east":     { "png_path": "/abs/path/east.png",     "png_url": "/snapshots/job-001/east.png" },
    "south":    { "png_path": "/abs/path/south.png",    "png_url": "/snapshots/job-001/south.png" },
    "west":     { "png_path": "/abs/path/west.png",     "png_url": "/snapshots/job-001/west.png" }
  },
  "timestamp": "2026-03-25T11:00:00.000Z"
}
```

#### Error Responses

| Status | Meaning |
|---|---|
| `400` | Missing required fields (`order_id`, `centroid`, or `geometry`) |
| `405` | Method not allowed (only POST is accepted) |
| `500` | Render failure (browser-side error or timeout) |

---

## Shot Definitions

| Shot name | Heading | Pitch | Description |
|---|---|---|---|
| `nadir` | 0° | −89.9° | Straight down (top-down view) |
| `cardinal` | 0° | −35° | North-facing oblique |
| `east` | 90° | −35° | East-facing oblique |
| `south` | 180° | −35° | South-facing oblique |
| `west` | 270° | −35° | West-facing oblique |

---

## Local Development (without Docker)

```bash
npm install
npm run dev
```

Then POST to `http://localhost:3000/api/render`.

---

## Tech Stack

- **Next.js** — API routes + static file serving
- **Cesium** — 3D globe rendering (via `public/render.html`)
- **Puppeteer** — Headless Chromium screenshot capture
- **Sharp** — Image processing / black-frame detection
