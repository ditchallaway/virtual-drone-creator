# Virtual Drone Creator

Headless rendering service for property aerial photography.

---

## Quick Start

```bash
docker compose up --build
```

The service starts on **http://localhost:3000**.

---

## Configuration

Copy `.env.local` and fill in your Google Maps Platform API key (must have the **Map Tiles API** enabled):

```
NEXT_PUBLIC_GOOGLE_API_KEY=your_actual_google_api_key_here
```

---

## API

### `POST /api/render`

Renders five PNG aerial views of a property boundary and returns their paths.

#### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `order_id` | string | ✅ | Unique identifier for this render job |
| `centroid` | `[lon, lat]` | ✅ | Property centroid in WGS 84 |
| `geometry` | GeoJSON Polygon | ✅ | Outer ring of the property boundary |

**Example request:**

```json
{
  "order_id": "test_001",
  "centroid": [-116.4869, 48.3322],
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [-116.486, 48.331],
      [-116.487, 48.331],
      [-116.487, 48.332],
      [-116.486, 48.332],
      [-116.486, 48.331]
    ]]
  }
}
```

**Example success response:**

```json
{
  "status": "success",
  "order_id": "test_001",
  "shots": {
    "nadir":    { "png_path": "/app/public/snapshots/test_001/nadir.png",    "png_url": "/snapshots/test_001/nadir.png" },
    "cardinal": { "png_path": "/app/public/snapshots/test_001/cardinal.png", "png_url": "/snapshots/test_001/cardinal.png" },
    "east":     { "png_path": "/app/public/snapshots/test_001/east.png",     "png_url": "/snapshots/test_001/east.png" },
    "south":    { "png_path": "/app/public/snapshots/test_001/south.png",    "png_url": "/snapshots/test_001/south.png" },
    "west":     { "png_path": "/app/public/snapshots/test_001/west.png",     "png_url": "/snapshots/test_001/west.png" }
  },
  "timestamp": "2026-03-25T11:00:00.000Z"
}
```

**Example error response:**

```json
{
  "status": "error",
  "message": "Render timeout (10 minutes exceeded)",
  "order_id": "test_001"
}
```

**cURL example:**

```bash
curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "test_001",
    "centroid": [-116.4869, 48.3322],
    "geometry": {
      "type": "Polygon",
      "coordinates": [[
        [-116.486, 48.331],
        [-116.487, 48.331],
        [-116.487, 48.332],
        [-116.486, 48.332],
        [-116.486, 48.331]
      ]]
    }
  }'
```

---

## What It Does

- Renders **5 PNG views** per property:
  - `nadir` — straight-down view (heading 0°, pitch −89.9°)
  - `cardinal` — north oblique (heading 0°, pitch −35°)
  - `east` — east oblique (heading 90°, pitch −35°)
  - `south` — south oblique (heading 180°, pitch −35°)
  - `west` — west oblique (heading 270°, pitch −35°)
- Draws a **yellow boundary overlay** (polyline, width 8, clamped to ground)
- Runs **headless** via Puppeteer + Cesium + Google 3D Tiles
- Processes shots **sequentially** (one at a time)
- Outputs files to `public/snapshots/<order_id>/`


