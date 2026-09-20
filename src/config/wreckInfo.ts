// Informazioni aggiuntive sui relitti, per wreck_id UKHO. Il dataset UKHO non
// contiene dimensioni: qui ci sono SOLO i dati trovati in fonti verificabili
// (siti di immersione/storia navale). Per gli altri relitti la dimensione
// resta "non disponibile": non si stima a occhio.
import type { WreckFeature } from '../types/wreck'

export interface WreckExtra {
  lengthM?: number
  beamM?: number
  tonnage?: string
  note: string
  sources: string
}

export const WRECK_EXTRA: Record<string, WreckExtra> = {
  equa: {
    note: 'Affondata il 10 giugno 1944 a circa 2 miglia da Riomaggiore, tra 34 e 42 m: descritta in perfetto assetto di navigazione, col cannone puntato in avanti. Reti da pesca impigliate sulla struttura; cernie e aragoste tra le lamiere.',
    sources: 'dailynautica.com',
  },
  '36166': {
    lengthM: 87,
    beamM: 12.5,
    tonnage: '2.220 t',
    note: 'Piroscafo Bolzaneto, affondato nel 1943: spezzato in due tronconi a circa 150 m uno dall’altro; giace tra 40 e 55 m.',
    sources: 'relittiliguria.it, Diving Group Portofino',
  },
}

// Relitti NON presenti nel database UKHO, aggiunti a mano con posizione
// fornita dall'utente (39,6 m di fondale alla posizione sulla batimetria).
export const EXTRA_WRECKS: WreckFeature[] = [
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [9 + 45 / 60 + 3 / 3600, 44 + 3 / 60 + 40 / 3600] },
    properties: {
      wreck_id: 'equa',
      name: 'Equa',
      category: 'Non-dangerous wreck',
      vessel_type: 'motovedetta armata (ex cargo)',
      depth_m: 38,
      year_sunk: '1944',
      removed: false,
      circumstance: null,
      source: 'Posizione fornita dall’utente; dati: dailynautica.com',
    },
  },
]

// Relitti UKHO da NON mostrare perche' duplicati di un relitto gia' presente.
// 36169 "Zatterone 14": a 47 m dall'Equa, 34 m di fondo (Equa: 34-42 m) — e' con
// ogni probabilita' lo stesso relitto, registrato senza nome nel database UKHO.
export const EXCLUDED_WRECK_IDS = new Set(['36169'])

export type WreckInterest = { level: 'alto' | 'medio' | 'basso' | 'assente'; reason: string }

/** Interesse per la pesca — STIMA da regole semplici, non un dato misurato:
 * un relitto funziona da scogliera artificiale se sta alle quote in cui
 * vivono le specie target (dentice, ricciola, serranidi: ~15-90 m). */
export function wreckInterest(depthM: number | null, removed: boolean, extra?: WreckExtra): WreckInterest {
  if (removed) return { level: 'assente', reason: 'segnalato come rimosso' }
  if (depthM == null) return { level: 'medio', reason: 'profondità sconosciuta' }
  if (depthM < 15) return { level: 'basso', reason: 'troppo basso per le specie target' }
  if (depthM > 100) return { level: 'basso', reason: 'troppo profondo per la pesca praticabile' }
  const large = (extra?.lengthM ?? 0) >= 50
  if (depthM <= 70) {
    return { level: 'alto', reason: large ? 'grande struttura a quota di pesca' : 'struttura sul fondo a quota di pesca' }
  }
  return { level: large ? 'alto' : 'medio', reason: 'quota limite per le specie target' }
}

export const INTEREST_LABEL: Record<WreckInterest['level'], string> = {
  alto: 'Alto',
  medio: 'Medio',
  basso: 'Basso',
  assente: 'Non presente',
}
