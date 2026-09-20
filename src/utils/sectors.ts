export interface SectorFeature {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: [number, number][][] }
  properties: { id: string; zone: string; band: string }
}

export interface SectorCollection {
  type: 'FeatureCollection'
  features: SectorFeature[]
}

function bounds(f: SectorFeature) {
  const ring = f.geometry.coordinates[0]
  const lons = ring.map((c) => c[0])
  const lats = ring.map((c) => c[1])
  return { w: Math.min(...lons), e: Math.max(...lons), s: Math.min(...lats), n: Math.max(...lats) }
}

export function sectorCenter(f: SectorFeature): [number, number] {
  const b = bounds(f)
  return [(b.w + b.e) / 2, (b.s + b.n) / 2]
}

/** Settore che contiene il punto (null se il punto e' fuori da tutti i settori). */
export function sectorIdAt(sectors: SectorFeature[], lon: number, lat: number): string | null {
  for (const f of sectors) {
    const b = bounds(f)
    if (lon >= b.w && lon < b.e && lat >= b.s && lat < b.n) return f.properties.id
  }
  return null
}

/** Ray casting: punto dentro poligono (lon/lat). */
export function pointInPolygon(pt: [number, number], poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
