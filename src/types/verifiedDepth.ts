export type DepthSource = 'plotter' | 'ecoscandaglio' | 'esperienza' | 'altro'

export interface VerifiedDepth {
  id: string
  name: string
  coords: [number, number]
  depthMeters: number
  source: DepthSource
  note?: string
  createdAt: string
}

export const DEPTH_SOURCE_LABELS: Record<DepthSource, string> = {
  plotter: 'Plotter/chartplotter',
  ecoscandaglio: 'Ecoscandaglio',
  esperienza: 'Esperienza diretta',
  altro: 'Altro',
}
