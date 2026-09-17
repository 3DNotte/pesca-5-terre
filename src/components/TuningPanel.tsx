import { useState } from 'react'
import type { ScoreResponse, SpeciesInfo, Weights } from '../api/scoring'
import { WEIGHT_LABELS } from '../api/scoring'
import './TuningPanel.css'

const TIME_PRESETS: { label: string; hour: number }[] = [
  { label: 'Alba', hour: 6 },
  { label: 'Mattina', hour: 9 },
  { label: 'Mezzogiorno', hour: 13 },
  { label: 'Pomeriggio', hour: 16 },
  { label: 'Tramonto', hour: 20 },
  { label: 'Notte', hour: 23 },
]

const DURATION_PRESETS: { label: string; hours: number }[] = [
  { label: '1 ora', hours: 1 },
  { label: '2 ore', hours: 2 },
  { label: '3 ore', hours: 3 },
  { label: '4+ ore', hours: 4 },
]

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface Props {
  open: boolean
  onToggleOpen: () => void
  speciesList: SpeciesInfo[]
  selectedSpecies: string
  onSelectSpecies: (key: string) => void
  dateTime: Date
  onChangeDateTime: (d: Date) => void
  durationHours: number
  onChangeDurationHours: (h: number) => void
  weights: Weights
  defaultWeights: Weights | null
  onChangeWeights: (w: Weights) => void
  onRun: () => void
  loading: boolean
  error: string | null
  result: ScoreResponse | null
}

export default function TuningPanel({
  open,
  onToggleOpen,
  speciesList,
  selectedSpecies,
  onSelectSpecies,
  dateTime,
  onChangeDateTime,
  durationHours,
  onChangeDurationHours,
  weights,
  defaultWeights,
  onChangeWeights,
  onRun,
  loading,
  error,
  result,
}: Props) {
  const [showWeights, setShowWeights] = useState(false)

  const applyPreset = (hour: number) => {
    const next = new Date(dateTime)
    next.setHours(hour, 0, 0, 0)
    onChangeDateTime(next)
  }

  const setWeight = (key: keyof Weights, value: number) => {
    onChangeWeights({ ...weights, [key]: value })
  }

  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0)

  if (!open) {
    return (
      <button type="button" className="tuning-fab" onClick={onToggleOpen}>
        Simulazione uscita
      </button>
    )
  }

  return (
    <div className="tuning-panel">
      <div className="tuning-header">
        <span>Simulazione uscita</span>
        <button type="button" className="tuning-close" onClick={onToggleOpen}>
          ×
        </button>
      </div>

      <label className="tuning-field">
        Specie target
        <select value={selectedSpecies} onChange={(e) => onSelectSpecies(e.target.value)}>
          {speciesList.length === 0 && <option value={selectedSpecies}>Caricamento…</option>}
          {speciesList.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="tuning-field">
        Data e ora dell'uscita
        <input
          type="datetime-local"
          value={toLocalInputValue(dateTime)}
          onChange={(e) => e.target.value && onChangeDateTime(new Date(e.target.value))}
        />
      </label>

      <div className="tuning-presets">
        {TIME_PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => applyPreset(p.hour)}>
            {p.label}
          </button>
        ))}
      </div>

      <label className="tuning-field">
        Tempo disponibile
        <span className="tuning-duration-hint">
          {durationHours > 0
            ? `il calcolo cerca il momento migliore entro ${durationHours}h da quell'orario`
            : "solo l'orario esatto scelto sopra"}
        </span>
      </label>
      <div className="tuning-presets">
        {DURATION_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={durationHours === p.hours ? 'active' : ''}
            onClick={() => onChangeDurationHours(p.hours)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={durationHours === 0 ? 'active' : ''}
          onClick={() => onChangeDurationHours(0)}
        >
          Solo quest'ora
        </button>
      </div>

      <button type="button" className="tuning-run" onClick={onRun} disabled={loading}>
        {loading ? 'Calcolo…' : 'Esegui simulazione'}
      </button>

      {error && (
        <div className="tuning-error">
          Backend non raggiungibile ({error}). Avvialo con <code>backend/run.cmd</code>.
        </div>
      )}

      {result && (
        <div className="tuning-result">
          <strong>{result.top_spots[0]?.classification ?? 'n/d'}</strong> nell'hot spot migliore —
          punteggio {result.top_spots[0]?.score ?? '–'}/100, profondita' stimata{' '}
          {result.top_spots[0]?.depth_m ?? '–'} m. {result.top_spots.length} hot spot 🐟 mostrati in
          mappa.
          {result.time_window && (
            <>
              {' '}
              Momento migliore nella finestra:{' '}
              {new Date(result.datetime).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </>
          )}
        </div>
      )}

      <button type="button" className="tuning-weights-toggle" onClick={() => setShowWeights((v) => !v)}>
        {showWeights ? '▾' : '▸'} Pesi della formula (tuning)
      </button>

      {showWeights && (
        <div className="tuning-weights">
          <p className="tuning-weights-hint">
            Confronta il consiglio con quello che ti aspetteresti dall'esperienza reale in barca, poi
            ritara i pesi finche' non coincidono. La somma non deve fare 100: conta il peso
            <em> relativo</em> tra i termini.
          </p>
          {(Object.keys(weights) as (keyof Weights)[]).map((key) => (
            <label key={key} className="tuning-weight-row">
              <span>
                {WEIGHT_LABELS[key]} <b>{weights[key].toFixed(2)}</b>
                <em>({weightSum > 0 ? Math.round((weights[key] / weightSum) * 100) : 0}%)</em>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[key]}
                onChange={(e) => setWeight(key, Number(e.target.value))}
              />
            </label>
          ))}
          <button
            type="button"
            className="tuning-reset"
            onClick={() => defaultWeights && onChangeWeights(defaultWeights)}
            disabled={!defaultWeights}
          >
            Ripristina pesi predefiniti
          </button>
        </div>
      )}
    </div>
  )
}
