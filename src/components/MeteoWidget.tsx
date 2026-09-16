import { useEffect, useState } from 'react'
import { fetchMeteo, type MeteoInfo } from '../api/scoring'
import './MeteoWidget.css'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']

function compassLabel(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8]
}

export default function MeteoWidget() {
  const [meteo, setMeteo] = useState<MeteoInfo | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const load = () => {
      fetchMeteo()
        .then(setMeteo)
        .catch(() => setError(true))
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
  return (
    <div className="meteo-widget" title={`Fonte: ${c.source} · aggiornato per le ${c.time}`}>
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
    </div>
  )
}
