import type { Feature, Polygon } from 'geojson'

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
