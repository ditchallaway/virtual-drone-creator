# Virtual Drone Creator

Headless rendering service that generates 5 aerial PNG screenshots of a property boundary — nadir + 4 cardinal directions (north, east, south, west) — using CesiumJS and Puppeteer.

## Quick Start

```bash
# 1. Copy and fill in your Google Maps API key
cp .env.local.example .env.local   # then edit with your key

# 2. Build and run
docker compose up --build
```

## API

### `POST /api/render`

Generate 5 PNG screenshots with yellow property boundary overlay.

**Request:**
```json
{
  "order_id": "order_12345",
  "centroid": [-116.4869, 48.3322],
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [[-116.486, 48.331], [-116.487, 48.331], [-116.487, 48.332], [-116.486, 48.332], [-116.486, 48.331]]
    ]
  }
}
```

**Response (200):**
```json
{
  "status": "success",
  "order_id": "order_12345",
  "shots": {
    "nadir":    { "png_path": "/app/public/snapshots/order_12345/nadir.png",    "png_url": "/snapshots/order_12345/nadir.png" },
    "cardinal": { "png_path": "/app/public/snapshots/order_12345/cardinal.png", "png_url": "/snapshots/order_12345/cardinal.png" },
    "east":     { "png_path": "/app/public/snapshots/order_12345/east.png",     "png_url": "/snapshots/order_12345/east.png" },
    "south":    { "png_path": "/app/public/snapshots/order_12345/south.png",    "png_url": "/snapshots/order_12345/south.png" },
    "west":     { "png_path": "/app/public/snapshots/order_12345/west.png",     "png_url": "/snapshots/order_12345/west.png" }
  },
  "timestamp": "2026-03-25T10:30:00.000Z"
}
```

**Error (400/500):**
```json
{ "status": "error", "message": "...", "order_id": "..." }
```

## Example

```bash
curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "test_001",
    "centroid": [-116.4869, 48.3322],
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [[-116.486, 48.331], [-116.487, 48.331], [-116.487, 48.332], [-116.486, 48.332], [-116.486, 48.331]]
      ]
    }
  }'
```

PNG files are written to `public/snapshots/<order_id>/` and served at `/snapshots/<order_id>/<shot>.png`.

## Configuration

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_GOOGLE_API_KEY` | Google Maps Platform API key (required for photorealistic tiles) |

Set in `.env.local` for local development or pass via Docker environment.

## Render Specifications

| Parameter | Value |
|---|---|
| Resolution | 2048 × 1536 px (4:3) |
| FOV | 100° |
| Nadir pitch | −89.9° |
| Cardinal pitch | −35° |
| Cardinal headings | 0° (N), 90° (E), 180° (S), 270° (W) |
| Boundary colour | Yellow (`#FFFF00`) |
| Boundary width | 4 px, clamped to ground |
| Tile settle | 3 × 300 ms stable ticks, 120 s timeout |
| Concurrency | 1 job at a time |

## What It Does

- ✅ 5 aerial views (nadir + north, east, south, west)
- ✅ Yellow boundary polyline, clamped to ground, all GeoJSON rings supported
- ✅ Google Photorealistic 3D Tiles
- ✅ Headless Chromium via Puppeteer (no display required)
- ✅ Sequential job queue (prevents WebGL memory crashes)
- ✅ PNG output, 2048 × 1536

## What It Does NOT Do

- ❌ PSD composition or text layers
- ❌ Road name or acreage fetching
- ❌ Cloud storage upload
- ❌ Push notifications
- ❌ React UI
