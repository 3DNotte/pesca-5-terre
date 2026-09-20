// Invio ANONIMO dei feedback al database (Cloudflare D1), solo con consenso.
// Nessun nome, nessun account, nessuna coordinata precisa: solo id di settore
// (~500 m), specie, motivi e un id casuale generato sul telefono.
import type { FeedbackReason, FollowedSpot } from '../types/sessionFeedback'

const CONSENT_KEY = 'pesca5terre.share_consent.v1'
const ANON_KEY = 'pesca5terre.anon_id.v1'
const APP_VERSION = '1'

export type Consent = 'yes' | 'no' | null

export function getConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'yes' || v === 'no' ? v : null
  } catch {
    return null
  }
}

export function setConsent(value: 'yes' | 'no') {
  try {
    localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // ignora: senza storage il consenso vale solo per questa sessione
  }
}

function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(ANON_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

function localIso(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

export interface FeedbackPayload {
  kind: 'bad_day' | 'catch'
  species?: string
  sectors: string[]
  followed?: FollowedSpot | null
  reasons?: FeedbackReason[]
  note?: string
}

/** Invia in background; non blocca ne' rompe l'app se la rete manca. */
export async function sendFeedback(payload: FeedbackPayload): Promise<boolean> {
  if (getConsent() !== 'yes') return false
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, anon_id: anonId(), local_time: localIso(), app_version: APP_VERSION }),
    })
    return res.ok
  } catch {
    return false
  }
}
