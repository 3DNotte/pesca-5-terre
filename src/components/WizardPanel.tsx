import { useState } from 'react'
import type { SpeciesInfo, WizardResponse } from '../api/scoring'
import { defaultTimeWindow } from '../utils/sunTimes'
import './WizardPanel.css'

const BAIT_OPTIONS = ['Sugherello', 'Aguglia', 'Occhiata', 'Altro vivo', 'Artificiale']

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface Props {
  open: boolean
  onToggleOpen: () => void
  speciesList: SpeciesInfo[]
  loading: boolean
  error: string | null
  result: WizardResponse | null
  onSubmit: (params: {
    start: Date
    end: Date
    species: string[]
    bottomFishing: boolean
  }) => void
}

export default function WizardPanel({
  open,
  onToggleOpen,
  speciesList,
  loading,
  error,
  result,
  onSubmit,
}: Props) {
  const initialWindow = defaultTimeWindow(new Date())
  const [start, setStart] = useState(initialWindow.start)
  const [end, setEnd] = useState(initialWindow.end)
  const [surprise, setSurprise] = useState(true)
  const [selectedSpecies, setSelectedSpecies] = useState<string[]>([])
  const [bottomFishing, setBottomFishing] = useState(true)
  const [baits, setBaits] = useState<string[]>([])
  const [luckyCharm, setLuckyCharm] = useState<boolean | null>(null)

  const toggleSpecies = (key: string) => {
    setSelectedSpecies((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    )
  }

  const toggleBait = (bait: string) => {
    setBaits((prev) => (prev.includes(bait) ? prev.filter((b) => b !== bait) : [...prev, bait]))
  }

  const handleSubmit = () => {
    onSubmit({
      start,
      end,
      species: surprise ? [] : selectedSpecies,
      bottomFishing,
    })
  }

  if (!open) {
    return (
      <button type="button" className="wizard-fab" onClick={onToggleOpen} aria-label="Apri wizard">
        <span className="wizard-fab-icon">☰</span> Trova dove pescare
      </button>
    )
  }

  return (
    <div className="wizard-panel">
      <div className="wizard-header">
        <span>Dove pesco oggi?</span>
        <button type="button" className="wizard-close" onClick={onToggleOpen}>
          ×
        </button>
      </div>

      <div className="wizard-question">
        <div className="wizard-question-label">1. Quanto tempo hai?</div>
        <div className="wizard-time-row">
          <input
            type="datetime-local"
            value={toLocalInputValue(start)}
            onChange={(e) => e.target.value && setStart(new Date(e.target.value))}
          />
          <span>→</span>
          <input
            type="datetime-local"
            value={toLocalInputValue(end)}
            onChange={(e) => e.target.value && setEnd(new Date(e.target.value))}
          />
        </div>
      </div>

      <div className="wizard-question">
        <div className="wizard-question-label">2. Cosa vuoi insidiare?</div>
        <label className="wizard-checkbox">
          <input type="checkbox" checked={surprise} onChange={(e) => setSurprise(e.target.checked)} />
          Sorprendimi (scegli tu la specie migliore ora)
        </label>
        {!surprise && (
          <div className="wizard-chip-row">
            {speciesList.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`wizard-chip${selectedSpecies.includes(s.key) ? ' active' : ''}`}
                onClick={() => toggleSpecies(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="wizard-question">
        <div className="wizard-question-label">3. Puoi pescare al fondo?</div>
        <div className="wizard-toggle-row">
          <button
            type="button"
            className={`wizard-toggle${bottomFishing ? ' active' : ''}`}
            onClick={() => setBottomFishing(true)}
          >
            Sì
          </button>
          <button
            type="button"
            className={`wizard-toggle${!bottomFishing ? ' active' : ''}`}
            onClick={() => setBottomFishing(false)}
          >
            No, solo a mezz'acqua
          </button>
        </div>
      </div>

      <div className="wizard-question">
        <div className="wizard-question-label">4. Che esche hai?</div>
        <div className="wizard-chip-row">
          {BAIT_OPTIONS.map((bait) => (
            <button
              key={bait}
              type="button"
              className={`wizard-chip${baits.includes(bait) ? ' active' : ''}`}
              onClick={() => toggleBait(bait)}
            >
              {bait}
            </button>
          ))}
        </div>
      </div>

      <div className="wizard-question">
        <div className="wizard-question-label">5. Hai un portafortuna a bordo?</div>
        <div className="wizard-toggle-row">
          <button
            type="button"
            className={`wizard-toggle${luckyCharm === true ? ' active' : ''}`}
            onClick={() => setLuckyCharm(true)}
          >
            Sì
          </button>
          <button
            type="button"
            className={`wizard-toggle${luckyCharm === false ? ' active' : ''}`}
            onClick={() => setLuckyCharm(false)}
          >
            No
          </button>
        </div>
      </div>

      <button
        type="button"
        className="wizard-submit"
        onClick={handleSubmit}
        disabled={loading || (!surprise && selectedSpecies.length === 0)}
      >
        {loading ? 'Calcolo…' : 'Trova il posto giusto'}
      </button>

      {error && (
        <div className="wizard-error">
          Backend non raggiungibile ({error}). Avvialo con <code>backend/run.cmd</code>.
        </div>
      )}

      {result && (
        <div className="wizard-result">
          <div className="wizard-result-species">{result.species_label}</div>
          <p>{result.motivation}</p>
          {luckyCharm === true && (
            <p className="wizard-lucky">
              🍀 Portafortuna a bordo — non cambia il calcolo, ma male non fa.
            </p>
          )}
          {result.ferry_warnings.length > 0 && (
            <div className="wizard-ferry-warning">
              ⚠️ {result.ferry_warnings.join(' ')}
            </div>
          )}
          {baits.length > 0 && (
            <p className="wizard-baits-note">Con {baits.join(', ').toLowerCase()} sei coperto.</p>
          )}
        </div>
      )}
    </div>
  )
}
