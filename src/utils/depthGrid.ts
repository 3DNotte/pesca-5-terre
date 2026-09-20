// Profondita' del mare in un punto, dalla batimetria fine (dati reali Regione
// Liguria sotto costa + EMODnet al largo): public/data/depth_grid.bin, generato
// da backend/scripts/export_depth_grid.py. E' una STIMA da rilievo, non una
// misura eseguita sul posto.
interface GridMeta {
  width: number
  height: number
  bounds: [number, number, number, number] // west, south, east, north
}

let gridPromise: Promise<{ meta: GridMeta; data: Int16Array } | null> | null = null

export function loadDepthGrid() {
  if (!gridPromise) {
    gridPromise = (async () => {
      try {
        const [metaRes, binRes] = await Promise.all([fetch('/data/depth_grid.json'), fetch('/data/depth_grid.bin')])
        if (!metaRes.ok || !binRes.ok) return null
        const meta = (await metaRes.json()) as GridMeta
        const data = new Int16Array(await binRes.arrayBuffer())
        return { meta, data }
      } catch {
        return null
      }
    })()
  }
  return gridPromise
}

/** Profondita' in metri (intera) o null se fuori griglia / su terra. */
export function depthAt(grid: { meta: GridMeta; data: Int16Array } | null, lon: number, lat: number): number | null {
  if (!grid) return null
  const { width, height, bounds } = grid.meta
  const [west, south, east, north] = bounds
  if (lon < west || lon > east || lat < south || lat > north) return null
  const col = Math.min(Math.floor(((lon - west) / (east - west)) * width), width - 1)
  const row = Math.min(Math.floor(((north - lat) / (north - south)) * height), height - 1)
  const v = grid.data[row * width + col]
  return v === -32768 ? null : Math.round(v / 10)
}
