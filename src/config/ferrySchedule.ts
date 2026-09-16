// Orari traghetti di linea "Golfo dei Poeti" (Linea 02 Cinque Terre).
// Corniglia non e' servita da traghetto (nessun accesso diretto al mare).
//
// I dati sotto sono trascritti da orari stagionali PUBBLICATI e SCARICATI
// direttamente dal sito ufficiale (non stimati). Ogni FerrySeason riporta la
// finestra di validita' dichiarata sul volantino e la fonte. Il servizio e'
// stagionale e gli orari cambiano piu' volte l'anno: prima di uscire in
// barca verificare sempre navigazionegolfodeipoeti.it — nessuna stagione
// qui sotto copre automaticamente la data odierna.

export type FerryStop =
  | 'levanto'
  | 'monterosso'
  | 'vernazza'
  | 'corniglia'
  | 'manarola'
  | 'riomaggiore'
  | 'portoVenere'
  | 'laSpezia'

// Coordinate verificate sui moli/pontili reali via OpenStreetMap
// (amenity=ferry_terminal / man_made=pier), non stimate: differivano dalle
// coordinate precedenti di 140-220m in tutti i casi.
export const FERRY_STOP_COORDS: Record<FerryStop, [number, number] | null> = {
  levanto: [9.60889, 44.16614],
  monterosso: [9.65448, 44.1446],
  vernazza: [9.68176, 44.13518], // "Porticciolo di Vernazza"
  corniglia: null, // nessun approdo: la linea passa al largo senza fermata
  manarola: [9.72657, 44.10579],
  riomaggiore: [9.73776, 44.09776], // nodo OSM taggato "Riomaggiore"
  portoVenere: [9.8398, 44.0503],
  laSpezia: [9.8241, 44.1024],
}

export const FERRY_STOP_LABELS: Record<FerryStop, string> = {
  levanto: 'Levanto',
  monterosso: 'Monterosso al Mare',
  vernazza: 'Vernazza',
  corniglia: 'Corniglia (nessuna fermata)',
  manarola: 'Manarola',
  riomaggiore: 'Riomaggiore',
  portoVenere: 'Porto Venere',
  laSpezia: 'La Spezia',
}

export interface FerryRun {
  /** Fermate servite da questa corsa, in ordine, con orario "HH:MM". Le fermate saltate non compaiono. */
  stops: Partial<Record<FerryStop, string>>
}

export interface FerrySeason {
  id: string
  label: string
  /** Validita' dichiarata sul volantino ufficiale, formato "MM-DD" (anno corrente). */
  validFrom: string
  validTo: string
  direction: 'verso_levanto' | 'verso_la_spezia'
  source: string
  sourceUrl: string
  fetchedOn: string
  runs: FerryRun[]
}

export const FERRY_SEASONS: FerrySeason[] = [
  {
    id: '2026-04-23_06-14_verso_levanto',
    label: 'Linea 02/C — Levanto → Cinque Terre → Porto Venere → La Spezia',
    validFrom: '04-23',
    validTo: '06-14',
    direction: 'verso_levanto',
    source: 'Navigazione Golfo dei Poeti — volantino ufficiale Linea 02/C',
    sourceUrl: 'https://www.navigazionegolfodeipoeti.it/pdf/orari-linea-02-levanto-b.pdf',
    fetchedOn: '2026-08-07',
    runs: [
      { stops: { levanto: '09:00', monterosso: '09:30', vernazza: '09:40', manarola: '10:00', riomaggiore: '10:15', portoVenere: '10:50' } },
      { stops: { portoVenere: '11:45', laSpezia: '12:15' } },
      { stops: { levanto: '10:00', monterosso: '10:30', vernazza: '10:40', manarola: '11:00', riomaggiore: '11:15', portoVenere: '11:50' } },
      { stops: { monterosso: '11:30', vernazza: '11:40', manarola: '12:00', riomaggiore: '12:15', portoVenere: '12:50' } },
      { stops: { monterosso: '12:30', vernazza: '12:40', manarola: '13:00', riomaggiore: '13:15', portoVenere: '13:50' } },
      { stops: { portoVenere: '14:45', laSpezia: '15:15' } },
      { stops: { levanto: '13:30', monterosso: '14:00', vernazza: '14:10', manarola: '14:30', riomaggiore: '14:45', portoVenere: '15:20' } },
      { stops: { monterosso: '15:00', vernazza: '15:10', manarola: '15:30', riomaggiore: '15:45', portoVenere: '16:20', laSpezia: '16:45' } },
      { stops: { monterosso: '16:00', vernazza: '16:10', manarola: '16:30', riomaggiore: '16:45', portoVenere: '17:20', laSpezia: '17:45' } },
      { stops: { monterosso: '17:00', vernazza: '17:10', manarola: '17:30', riomaggiore: '17:45', portoVenere: '18:20', laSpezia: '18:45' } },
    ],
  },
  {
    id: '2026-04-23_06-14_verso_la_spezia',
    label: 'Linea 02/C — La Spezia → Porto Venere → Cinque Terre → Levanto',
    validFrom: '04-23',
    validTo: '06-14',
    direction: 'verso_la_spezia',
    source: 'Navigazione Golfo dei Poeti — volantino ufficiale Linea 02/C',
    sourceUrl: 'https://www.navigazionegolfodeipoeti.it/pdf/orari-linea-02-levanto-b.pdf',
    fetchedOn: '2026-08-07',
    runs: [
      { stops: { laSpezia: '09:15', portoVenere: '10:00', riomaggiore: '10:35', manarola: '10:45', vernazza: '11:05', monterosso: '11:20' } },
      { stops: { laSpezia: '10:15', portoVenere: '11:00', riomaggiore: '11:35', manarola: '11:45', vernazza: '12:05', monterosso: '12:20' } },
      { stops: { laSpezia: '11:15', portoVenere: '12:00', riomaggiore: '12:35', manarola: '12:45', vernazza: '13:05', monterosso: '13:20' } },
      { stops: { portoVenere: '13:50', riomaggiore: '14:25', manarola: '14:35', vernazza: '14:55', monterosso: '15:10' } },
      { stops: { laSpezia: '14:05', portoVenere: '14:50', riomaggiore: '15:25', manarola: '15:35', vernazza: '15:55', monterosso: '16:10' } },
      { stops: { laSpezia: '15:20', portoVenere: '16:00', riomaggiore: '16:35', manarola: '16:45', vernazza: '17:05', monterosso: '17:20' } },
      { stops: { portoVenere: '17:00', riomaggiore: '17:35', manarola: '17:45', vernazza: '18:05', monterosso: '18:15', levanto: '18:50' } },
    ],
  },
]

const MS_PER_MIN = 60_000

function seasonCoversDate(season: FerrySeason, date: Date): boolean {
  const [fromM, fromD] = season.validFrom.split('-').map(Number)
  const [toM, toD] = season.validTo.split('-').map(Number)
  const from = new Date(date.getFullYear(), fromM - 1, fromD)
  const to = new Date(date.getFullYear(), toM - 1, toD, 23, 59)
  return date >= from && date <= to
}

export interface NextPassage {
  stop: FerryStop
  time: string
  minutesFromNow: number
  season: FerrySeason
}

/** Prossimo passaggio noto a una fermata, solo se la data corrente rientra in una stagione con dati caricati. */
export function nextPassageAt(stop: FerryStop, now: Date = new Date()): NextPassage | null {
  const activeSeasons = FERRY_SEASONS.filter((s) => seasonCoversDate(s, now))
  let best: NextPassage | null = null
  for (const season of activeSeasons) {
    for (const run of season.runs) {
      const time = run.stops[stop]
      if (!time) continue
      const [h, m] = time.split(':').map(Number)
      const passage = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
      const diffMin = Math.round((passage.getTime() - now.getTime()) / MS_PER_MIN)
      if (diffMin < -20) continue // passaggio gia' avvenuto da un pezzo
      if (!best || diffMin < best.minutesFromNow) {
        best = { stop, time, minutesFromNow: diffMin, season }
      }
    }
  }
  return best
}
