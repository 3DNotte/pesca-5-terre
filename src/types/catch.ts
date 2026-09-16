export interface Catch {
  id: string
  coords: [number, number]
  /** Posizione GPS del telefono al momento della cattura, non un punto scelto sulla mappa. */
  capturedAt: string
  /** Foto opzionale, salvata come data URL (nessun backend per l'upload). */
  photoDataUrl?: string
  note?: string
  createdAt: string
}
