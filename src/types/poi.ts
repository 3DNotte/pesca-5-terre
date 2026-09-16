export type PoiType = 'secca' | 'relitto' | 'mangiata'

export interface Poi {
  id: string
  type: PoiType
  name: string
  coords: [number, number]
  /** Quando e' successo/e' stato notato — impostabile dall'utente, non necessariamente il momento del salvataggio. */
  capturedAt: string
  depthMeters?: number
  note?: string
  createdAt: string
}

export const POI_TYPE_LABELS: Record<PoiType, string> = {
  secca: 'Secca',
  relitto: 'Relitto',
  mangiata: 'Mangiata (in profondità)',
}
