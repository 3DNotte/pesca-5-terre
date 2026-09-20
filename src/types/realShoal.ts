export interface RealShoalProperties {
  depth_m: number // profondita' della CIMA della secca (punto piu' alto)
  base_depth_m: number // profondita' del mare attorno (piede della secca)
  height_m: number // altezza: base - cima
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
