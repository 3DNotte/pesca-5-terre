import type { Feature, Polygon } from 'geojson'

const EARTH_RADIUS_M = 6371000
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']

/** Distanza in metri tra due punti [lon, lat] (formula haversine). */
export function distanceMeters(from: [number, number], to: [number, number]): number {
  const [lon1, lat1] = from
  const [lon2, lat2] = to
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

/** Rotta iniziale in gradi (0-360, 0=Nord) da un punto [lon, lat] all'altro. */
export function bearingDegrees(from: [number, number], to: [number, number]): number {
  const [lon1, lat1] = from
  const [lon2, lat2] = to
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export function compassLabel(deg: number): string {
  return COMPASS_POINTS[Math.round(deg / 45) % 8]
}

/** Genera un poligono GeoJSON che approssima un cerchio geodesico. */
export function circlePolygon(
  center: [number, number],
  radiusMeters: number,
  points = 64,
): Feature<Polygon> {
  const [lng, lat] = center
  const earthRadius = 6371000
  const latRad = (lat * Math.PI) / 180
  const coords: [number, number][] = []

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI
    const dLat = (radiusMeters * Math.cos(angle)) / earthRadius
    const dLng = (radiusMeters * Math.sin(angle)) / (earthRadius * Math.cos(latRad))
    coords.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI])
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  }
}
