export type AdviceMatch = 'si' | 'cosi_cosi' | 'no'

export interface SessionFeedback {
  id: string
  createdAt: string
  fished: boolean
  species?: string
  coords?: [number, number]
  caught: boolean | null
  matchedAdvice: AdviceMatch | null
  note?: string
}
