import './DevSimPanel.css'

interface Props {
  active: boolean
  placing: boolean
  onTogglePlacing: () => void
  onStop: () => void
}

// Pannello di SVILUPPO (non per l'utente finale): simula SOLO la posizione
// della barca, per testare da PC quello che altrimenti si prova solo in mare.
// Si apre "Simula", si tocca la mappa nel punto della barca e basta: il
// pannello si chiude e l'app funziona esattamente come con il GPS vero.
// Visibile solo con devMode attivo (vedi utils/devMode.ts).
export default function DevSimPanel({ active, placing, onTogglePlacing, onStop }: Props) {
  return (
    <div className="dev-sim-panel">
      <button
        type="button"
        className={`dev-sim-fab${active ? ' active' : ''}`}
        onClick={onTogglePlacing}
      >
        🛠 Simula {active ? '●' : ''}
      </button>
      {placing && (
        <div className="dev-sim-body">
          <div className="dev-sim-title">Simulazione posizione (dev)</div>
          <div className="dev-sim-note">Tocca la mappa nel punto della barca.</div>
          {active && (
            <button type="button" className="dev-sim-stop" onClick={onStop}>
              Torna al GPS reale
            </button>
          )}
        </div>
      )}
    </div>
  )
}
