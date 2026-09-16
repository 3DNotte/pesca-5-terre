export interface WreckProperties {
  wreck_id: string
  name: string | null
  category: string | null
  vessel_type: string | null
  depth_m: number | null
  year_sunk: string | null
  removed: boolean
  circumstance: string | null
  source: string
}

export interface WreckFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: WreckProperties
}

export interface WreckCollection {
  type: 'FeatureCollection'
  features: WreckFeature[]
}
