export type FollowedSpot = 'spot1' | 'spot2' | 'spot3' | 'other'

export type FeedbackReason =
  | 'mare_mosso'
  | 'corrente_forte'
  | 'vento'
  | 'troppe_barche'
  | 'pesce_assente'
  | 'acqua_torbida'
  | 'esche'
  | 'altro'

export const REASON_LABELS: Record<FeedbackReason, string> = {
  mare_mosso: 'Mare mosso',
  corrente_forte: 'Corrente forte',
  vento: 'Vento',
  troppe_barche: 'Troppe barche',
  pesce_assente: 'Pesce assente',
  acqua_torbida: 'Acqua torbida',
  esche: 'Esche',
  altro: 'Altro',
}

/** Giornata storta: dove (settori ~500 m), quale specie, perche'. */
export interface SessionFeedback {
  id: string
  createdAt: string
  species: string
  followed: FollowedSpot
  sectors: string[]
  reasons: FeedbackReason[]
  note?: string
}
