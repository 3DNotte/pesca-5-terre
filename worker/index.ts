// Worker Cloudflare: riceve i feedback anonimi dell'app e li salva in D1.
// Tutto il resto (asset statici, SPA) e' servito da ASSETS.
interface Env {
  ASSETS: Fetcher
  DB: D1Database
}

const KINDS = new Set(['bad_day', 'catch'])
const FOLLOWED = new Set(['spot1', 'spot2', 'spot3', 'other'])
const REASONS = new Set([
  'mare_mosso',
  'corrente_forte',
  'vento',
  'troppe_barche',
  'pesce_assente',
  'acqua_torbida',
  'esche',
  'altro',
])
const SECTOR_RE = /^r\d{1,3}c\d{1,3}$/
const MAX_PER_DAY = 20 // per anon_id: freno agli abusi, non serve di piu' a un pescatore

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function handleFeedback(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'JSON non valido' }, 400)
  }

  const anonId = typeof body.anon_id === 'string' ? body.anon_id : ''
  if (!/^[0-9a-f-]{16,64}$/i.test(anonId)) return json({ error: 'anon_id non valido' }, 400)
  const kind = String(body.kind ?? '')
  if (!KINDS.has(kind)) return json({ error: 'kind non valido' }, 400)

  const species = typeof body.species === 'string' && /^[a-z_]{2,40}$/.test(body.species) ? body.species : null
  const sectors = Array.isArray(body.sectors)
    ? body.sectors.filter((s): s is string => typeof s === 'string' && SECTOR_RE.test(s)).slice(0, 40)
    : []
  const followed = typeof body.followed === 'string' && FOLLOWED.has(body.followed) ? body.followed : null
  const reasons = Array.isArray(body.reasons)
    ? body.reasons.filter((r): r is string => typeof r === 'string' && REASONS.has(r)).slice(0, 8)
    : []
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) || null : null
  const localTime = typeof body.local_time === 'string' ? body.local_time.slice(0, 32) : null
  const appVersion = typeof body.app_version === 'string' ? body.app_version.slice(0, 16) : null

  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM feedback WHERE anon_id = ? AND created_at > datetime('now', '-1 day')",
  )
    .bind(anonId)
    .first<{ n: number }>()
  if ((recent?.n ?? 0) >= MAX_PER_DAY) return json({ error: 'troppi invii' }, 429)

  await env.DB.prepare(
    'INSERT INTO feedback (anon_id, kind, species, sectors, followed, reasons, note, local_time, app_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(anonId, kind, species, JSON.stringify(sectors), followed, JSON.stringify(reasons), note, localTime, appVersion)
    .run()

  return json({ ok: true })
}

// Proxy con cache verso Open-Meteo, per il backend su Render: Open-Meteo limita
// le richieste per indirizzo IP e gli IP condivisi di Render gratuito ricevono
// 429. Da qui la chiamata parte da Cloudflare e la risposta e' in cache 30 minuti,
// quindi a Open-Meteo arriva al massimo una richiesta ogni 30 min per URL.
const OPEN_METEO_UPSTREAM: Record<string, string> = {
  '/api/om/marine': 'https://marine-api.open-meteo.com/v1/marine',
  '/api/om/forecast': 'https://api.open-meteo.com/v1/forecast',
}

async function handleOpenMeteo(url: URL): Promise<Response> {
  const upstream = OPEN_METEO_UPSTREAM[url.pathname]
  if (!upstream || url.search.length > 600) return json({ error: 'non consentito' }, 400)
  const res = await fetch(`${upstream}${url.search}`, { cf: { cacheTtl: 1800, cacheEverything: true } })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/feedback') {
      if (request.method !== 'POST') return json({ error: 'metodo non consentito' }, 405)
      return handleFeedback(request, env)
    }
    if (url.pathname.startsWith('/api/om/') && request.method === 'GET') return handleOpenMeteo(url)
    return env.ASSETS.fetch(request)
  },
}
