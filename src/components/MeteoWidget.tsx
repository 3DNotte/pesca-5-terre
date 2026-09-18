import { useEffect, useState } from 'react'
import { fetchMeteo, fetchSeaDetails, type MeteoInfo, type SeaDetails } from '../api/scoring'
import './MeteoWidget.css'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']

function compassLabel(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8]
}

const hhmm = (iso: string) => iso.slice(11, 16)

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values)
  const range = Math.max(...values) - min || 1
  return (
    <div className="meteo-spark">
      {values.map((v, i) => (
        <div
          key={i}
          className={`meteo-spark-bar${i === 0 ? ' now' : ''}`}
          style={{ height: `${15 + ((v - min) / range) * 85}%` }}
        />
      ))}
    </div>
  )
}

export default function MeteoWidget() {
  const [meteo, setMeteo] = useState<MeteoInfo | null>(null)
  const [sea, setSea] = useState<SeaDetails | null>(null)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<'current' | 'tide' | null>(null)

  useEffect(() => {
    const load = () => {
      fetchMeteo()
        .then(setMeteo)
        .catch(() => setError(true))
      fetchSeaDetails()
        .then(setSea)
        .catch(() => setSea(null)) // corrente/marea sono accessori: la barra meteo resta
    }
    load()
    const interval = setInterval(load, 10 * 60 * 1000) // aggiorna ogni 10 minuti
    return () => clearInterval(interval)
  }, [])

  if (error) return null
  if (!meteo) return <div className="meteo-widget meteo-loading">Meteo/mare…</div>
  if (!meteo.available || !meteo.conditions) {
    return <div className="meteo-widget meteo-unavailable">Meteo/mare non disponibile ora</div>
  }

  const c = meteo.conditions
  const cur = sea?.available && sea.current.length ? sea.current[0] : null
  const tide = sea?.available ? sea.tide : null
  const tideNow = tide?.points[0]
  const toggle = (k: 'current' | 'tide') => setOpen((o) => (o === k ? null : k))
  const signed = (cm: number) => `${cm > 0 ? '+' : ''}${cm}`

  return (
    <div className="meteo-widget" title={`Fonte: ${c.source} · aggiornato per le ${c.time}`}>
      <div className="meteo-row">
        <span>
          🌊 {c.wave_height_m.toFixed(1)} m da {compassLabel(c.wave_direction_deg)}
        </span>
        <span>🌡️ {c.sea_surface_temp_c.toFixed(1)}°C</span>
        {c.wind_speed_kmh != null && (
          <span>
            💨 {Math.round(c.wind_speed_kmh)} km/h
            {c.wind_direction_deg != null ? ` ${compassLabel(c.wind_direction_deg)}` : ''}
          </span>
        )}
        {cur && (
          <button
            type="button"
            className={`meteo-chip${open === 'current' ? ' active' : ''}`}
            onClick={() => toggle('current')}
          >
            <svg viewBox="-12 -12 24 24" className="meteo-arrow" style={{ transform: `rotate(${cur.direction_deg}deg)` }}>
              <path d="M0 -10 L6 2 L2 0 L2 9 L-2 9 L-2 0 L-6 2 Z" fill="currentColor" />
            </svg>{' '}
            {cur.speed_kn.toFixed(1)} kn ▾
          </button>
        )}
        {tideNow && (
          <button
            type="button"
            className={`meteo-chip${open === 'tide' ? ' active' : ''}`}
            onClick={() => toggle('tide')}
          >
            🌗 {tide?.trend === 'in salita' ? '↑' : tide?.trend === 'in discesa' ? '↓' : '→'} {signed(tideNow.level_cm)} cm ▾
          </button>
        )}
      </div>

      {open === 'current' && cur && sea && (
        <div className="meteo-detail">
          <div>
            <strong>Corrente superficiale</strong>: {cur.speed_kn.toFixed(2)} nodi verso {compassLabel(cur.direction_deg)} (
            {cur.direction_deg}°)
          </div>
          <div className="meteo-detail-label">Velocità nelle prossime 12 h</div>
          <Sparkline values={sea.current.map((p) => p.speed_kn)} />
          <div className="meteo-detail-scale">
            <span>{hhmm(sea.current[0].time)}</span>
            <span>{hhmm(sea.current[sea.current.length - 1].time)}</span>
          </div>
          <div className="meteo-detail-note">
            Stima da modello (~8 km), indicativa sotto costa: la direzione cambia a scatti. Nel Mediterraneo la corrente è
            debole e dipende molto dal vento.
          </div>
        </div>
      )}

      {open === 'tide' && tide && tideNow && (
        <div className="meteo-detail">
          <div>
            <strong>Marea</strong>: {tide.trend ?? '—'}, livello {signed(tideNow.level_cm)} cm rispetto alla media
          </div>
          {tide.extrema.length > 0 && (
            <ul className="meteo-detail-list">
              {tide.extrema.slice(0, 4).map((e) => (
                <li key={e.time}>
                  {e.type === 'alta' ? '▲ alta' : '▼ bassa'} alle {hhmm(e.time)}
                  {e.time.slice(0, 10) !== tideNow.time.slice(0, 10) ? ' (domani)' : ''} · {signed(e.level_cm)} cm
                </li>
              ))}
            </ul>
          )}
          <div className="meteo-detail-label">Livello nelle prossime 30 h</div>
          <Sparkline values={tide.points.map((p) => p.level_cm)} />
          <div className="meteo-detail-note">
            Nel Mar Ligure la marea è piccola (escursione tipica sotto i 30–40 cm): incide poco sul fondale, contano di più
            vento e pressione, che il livello include. Stima da modello, non un almanacco delle maree.
          </div>
        </div>
      )}
    </div>
  )
}
