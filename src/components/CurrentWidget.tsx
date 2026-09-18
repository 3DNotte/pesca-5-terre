import { useEffect, useState } from 'react'
import { compassLabel } from '../utils/geo'
import { fetchCurrent, type CurrentInfo } from '../api/scoring'
import './CurrentWidget.css'

interface Props {
  at?: Date
}

export default function CurrentWidget({ at }: Props) {
  const [info, setInfo] = useState<CurrentInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const atKey = at ? at.getTime() : 0

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    fetchCurrent(at)
      .then((r) => !cancelled && setInfo(r))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atKey])

  if (failed || (info && !info.available)) {
    return <div className="current-widget current-widget-off">Corrente non disponibile al momento</div>
  }
  if (!info) return <div className="current-widget current-widget-off">Carico la corrente…</div>

  const now = info.points[0]
  const max = Math.max(0.3, ...info.points.map((p) => p.speed_kn))

  return (
    <div className="current-widget">
      <div className="current-widget-main">
        <svg
          className="current-arrow"
          viewBox="-20 -20 40 40"
          style={{ transform: `rotate(${now.direction_deg}deg)` }}
          aria-label={`Corrente verso ${compassLabel(now.direction_deg)}`}
        >
          <path d="M0 -16 L9 2 L3 0 L3 15 L-3 15 L-3 0 L-9 2 Z" fill="#0b6bcb" />
        </svg>
        <div>
          <div className="current-widget-speed">{now.speed_kn.toFixed(2)} nodi</div>
          <div className="current-widget-dir">
            verso {compassLabel(now.direction_deg)} ({now.direction_deg}°)
          </div>
        </div>
      </div>
      <div className="current-spark" title="Velocità nelle prossime ore">
        {info.points.map((p) => (
          <div key={p.time} className="current-spark-bar" style={{ height: `${(p.speed_kn / max) * 100}%` }} />
        ))}
      </div>
      <div className="current-widget-note">Prossime 12 h · stima da modello (~8 km), indicativa sotto costa</div>
    </div>
  )
}
