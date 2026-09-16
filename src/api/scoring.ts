// In produzione (Cloudflare Pages) frontend e backend sono su domini diversi,
// quindi l'indirizzo del backend va passato a build-time (VITE_API_BASE).
// In locale/LAN, senza quella variabile, si torna a dedurlo dallo stesso host
// del frontend (funziona sia da 'localhost' sia dall'IP di rete del PC).
const API_BASE = import.meta.env.VITE_API_BASE ?? `http://${window.location.hostname}:8000`

export interface SpeciesInfo {
  key: string
  label: string
  disturbance_sensitivity: number
  structure_affinity: number
  notes: string
}

export interface TopSpot {
  lon: number
  lat: number
  score: number
  classification: string
  depth_m: number
}

export interface Weights {
  w1_morfologia: number
  w2_stagionale: number
  w3_orario: number
  w4_traffico: number
  w5_meteo_mare: number
}

export const WEIGHT_LABELS: Record<keyof Weights, string> = {
  w1_morfologia: 'Morfologia (scarpate, secche)',
  w2_stagionale: 'Stagionalita’',
  w3_orario: 'Fascia oraria',
  w4_traffico: 'Traffico marittimo',
  w5_meteo_mare: 'Meteo/mare (onda + esposizione)',
}

export interface MeteoConditions {
  wave_height_m: number
  wave_direction_deg: number
  wave_period_s: number
  sea_surface_temp_c: number
  wind_speed_kmh: number | null
  wind_direction_deg: number | null
  time: string
  source: string
}

export interface MeteoInfo {
  available: boolean
  conditions: MeteoConditions | null
}

export interface ScoreResponse {
  species: string
  datetime: string
  weights: Weights
  meteo: MeteoInfo
  grid: {
    width: number
    height: number
    bounds: [number, number, number, number] // west, south, east, north
    values: (number | null)[][]
  }
  top_spots: TopSpot[]
}

export async function fetchMeteo(at?: Date): Promise<MeteoInfo> {
  const params = new URLSearchParams()
  if (at) params.set('at', at.toISOString().slice(0, 19))
  const res = await fetch(`${API_BASE}/api/meteo?${params}`)
  if (!res.ok) throw new Error(`Errore backend: ${res.status}`)
  return res.json()
}

export async function fetchSpecies(): Promise<SpeciesInfo[]> {
  const res = await fetch(`${API_BASE}/api/species`)
  if (!res.ok) throw new Error(`Errore backend: ${res.status}`)
  return res.json()
}

export async function fetchWeights(): Promise<Weights> {
  const res = await fetch(`${API_BASE}/api/weights`)
  if (!res.ok) throw new Error(`Errore backend: ${res.status}`)
  return res.json()
}

export async function fetchScore(
  species: string,
  at?: Date,
  weights?: Partial<Weights>,
): Promise<ScoreResponse> {
  const params = new URLSearchParams({ species })
  if (at) params.set('at', at.toISOString().slice(0, 19))
  if (weights) {
    for (const [key, value] of Object.entries(weights)) {
      if (value != null) params.set(key, String(value))
    }
  }
  const res = await fetch(`${API_BASE}/api/score?${params}`)
  if (!res.ok) throw new Error(`Errore backend: ${res.status}`)
  return res.json()
}

export interface WizardResponse extends ScoreResponse {
  species_label: string
  time_window: { start: string; end: string }
  bottom_fishing: boolean
  motivation: string
  ferry_warnings: string[]
}

export async function fetchWizard(options: {
  start: Date
  end: Date
  species: string[] // vuoto = "sorprendimi"
  bottomFishing: boolean
}): Promise<WizardResponse> {
  const params = new URLSearchParams({
    start: options.start.toISOString().slice(0, 19),
    end: options.end.toISOString().slice(0, 19),
    bottom_fishing: String(options.bottomFishing),
  })
  for (const s of options.species) params.append('species', s)
  const res = await fetch(`${API_BASE}/api/wizard?${params}`)
  if (!res.ok) throw new Error(`Errore backend: ${res.status}`)
  return res.json()
}
