import { useState } from 'react'
import type { SpeciesInfo, WizardMode, WizardResponse } from '../api/scoring'
import { defaultTimeWindow } from '../utils/sunTimes'
import './WizardPanel.css'

const BAIT_OPTIONS = ['Sugherello', 'Aguglia', 'Occhiata', 'Cefalopodi', 'Altro vivo', 'Artificiale']

// Modalità esche: gli attrezzi classici per catturarle (chiave = quella del backend).
const GEAR_OPTIONS: { key: string; label: string }[] = [
  { key: 'sabiki', label: 'Sabiki' },
  { key: 'trainetta', label: 'Trainetta' },
  { key: 'bolentino', label: 'Bolentino' },
]

// Dall'esca trovata al chip "Che esche hai?" della modalità predatori.
const BAIT_KEY_TO_LABEL: Record<string, string> = {
  sugherello: 'Sugherello',
  aguglia: 'Aguglia',
  occhiata: 'Occhiata',
  cefalopodi: 'Cefalopodi',
}

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
    mode: WizardMode
    gear: string[]
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
  const [baits, setBaits] = useState<string[]>([])
  const [luckyCharm, setLuckyCharm] = useState<boolean | null>(null)
  const [mode, setMode] = useState<WizardMode>('predator')
  const [choosingMode, setChoosingMode] = useState(false)
  const [gear, setGear] = useState<string[]>([])
  const [resultMode, setResultMode] = useState<WizardMode>('predator')

  const isBait = mode === 'bait'
  const modeSpecies = speciesList.filter((s) => (s.kind ?? 'predator') === mode)

  const chooseMode = (m: WizardMode) => {
    setMode(m)
    setSelectedSpecies([])
    setSurprise(true)
    setChoosingMode(false)
    onToggleOpen()
  }

  const toggleSpecies = (key: string) => {
    setSelectedSpecies((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    )
  }

  const toggleBait = (bait: string) => {
    setBaits((prev) => (prev.includes(bait) ? prev.filter((b) => b !== bait) : [...prev, bait]))
  }

  const toggleGear = (key: string) => {
    setGear((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]))
  }

  // Trovata l'esca: si passa ai predatori con l'esca già segnata tra quelle a bordo.
  const goToPredator = () => {
    const label = result ? BAIT_KEY_TO_LABEL[result.species] : undefined
    setMode('predator')
    setSelectedSpecies([])
    setSurprise(true)
    if (label) setBaits((prev) => (prev.includes(label) ? prev : [...prev, label]))
  }

  const handleSubmit = () => {
    onSubmit({
      start,
      end,
      species: surprise ? [] : selectedSpecies,
      bottomFishing: true,
      mode,
      gear: isBait ? gear : [],
    })
    setResultMode(mode)
  }

  if (!open) {
    return (
      <>
        <button
          type="button"
          className="wizard-fab"
          onClick={() => setChoosingMode(true)}
          aria-label="Apri wizard"
        >
          <span className="wizard-fab-icon">☰</span> Peschiamo!
        </button>
        {choosingMode && (
          <div className="wizard-mode-backdrop" onClick={() => setChoosingMode(false)}>
            <div className="wizard-mode-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="wizard-mode-title">Sei già a pesca o cerchi le esche?</div>
              <button type="button" className="wizard-mode-btn" onClick={() => chooseMode('predator')}>
                🎣 Sono già a pesca
                <span>cerco dove pescare i predatori</span>
              </button>
              <button type="button" className="wizard-mode-btn" onClick={() => chooseMode('bait')}>
                🐟 Cerco le esche
                <span>sugherello, aguglia, occhiata, cefalopodi</span>
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="wizard-panel">
      <div className="wizard-header">
        <span>{isBait ? 'Dove cerco le esche?' : 'Dove pesco oggi?'}</span>
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
        <div className="wizard-question-label">2. {isBait ? 'Che esca cerchi?' : 'Cosa vuoi insidiare?'}</div>
        <label className="wizard-checkbox">
          <input type="checkbox" checked={surprise} onChange={(e) => setSurprise(e.target.checked)} />
          {isBait
            ? "Sorprendimi (scegli tu l'esca migliore ora)"
            : 'Sorprendimi (scegli tu la specie migliore ora)'}
        </label>
        {!surprise && (
          <div className="wizard-chip-row">
            {modeSpecies.map((s) => (
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
        <div className="wizard-question-label">
          {isBait ? '3. Che attrezzatura hai?' : '3. Che esche hai?'}
        </div>
        <div className="wizard-chip-row">
          {isBait
            ? GEAR_OPTIONS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`wizard-chip${gear.includes(g.key) ? ' active' : ''}`}
                  onClick={() => toggleGear(g.key)}
                >
                  {g.label}
                </button>
              ))
            : BAIT_OPTIONS.map((bait) => (
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
        <div className="wizard-question-label">4. Hai un portafortuna a bordo?</div>
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

      {result && resultMode === mode && (
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
          {!isBait && baits.length > 0 && (
            <p className="wizard-baits-note">Con {baits.join(', ').toLowerCase()} sei coperto.</p>
          )}
          {isBait && (
            <button type="button" className="wizard-submit" onClick={goToPredator}>
              Ora cerco il predatore →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
