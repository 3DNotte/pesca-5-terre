export interface RealShoalProperties {
  depth_m: number
  source: 'regione_liguria_isobate' | 'emodnet'
}

export interface RealShoalFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: RealShoalProperties
}

export interface RealShoalCollection {
  type: 'FeatureCollection'
  features: RealShoalFeature[]
}
