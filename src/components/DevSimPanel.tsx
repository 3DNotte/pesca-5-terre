import { useState } from 'react'
import './DevSimPanel.css'

interface Props {
  active: boolean
  onToggleActive: () => void
  coords: [number, number] | null
  onNudge: (dLat: number, dLon: number) => void
}

// Pannello di SVILUPPO (non per l'utente finale): simula la posizione GPS
// della barca per testare in ufficio/PC quello che altrimenti si può provare
// solo in mare — "La mia posizione", la linea live, "Ti porto lì". Visibile
// solo con devMode attivo (vedi utils/devMode.ts).
export default function DevSimPanel({ active, onToggleActive, coords, onNudge }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="dev-sim-panel">
      <button
        type="button"
        className={`dev-sim-fab${active ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        🛠 Simula {active ? '●' : ''}
      </button>
      {open && (
        <div className="dev-sim-body">
          <div className="dev-sim-title">Simulazione posizione (dev)</div>
          <label className="dev-sim-toggle">
            <input type="checkbox" checked={active} onChange={onToggleActive} />
            {active ? 'Attiva — tocca la mappa per spostare la barca' : 'Disattivata (usa il GPS reale)'}
          </label>
          {active && (
            <>
              <div className="dev-sim-coords">
                {coords ? `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}` : 'clicca sulla mappa per iniziare'}
              </div>
              <div className="dev-sim-pad">
                <span />
                <button type="button" onClick={() => onNudge(50, 0)}>
                  ▲
                </button>
                <span />
                <button type="button" onClick={() => onNudge(0, -50)}>
                  ◀
                </button>
                <span className="dev-sim-pad-label">50 m</span>
                <button type="button" onClick={() => onNudge(0, 50)}>
                  ▶
                </button>
                <span />
                <button type="button" onClick={() => onNudge(-50, 0)}>
                  ▼
                </button>
                <span />
              </div>
              <div className="dev-sim-note">
                Un click imposta la barca; le frecce la spostano di 50 m. Il resto dell'app la tratta come GPS vero.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
