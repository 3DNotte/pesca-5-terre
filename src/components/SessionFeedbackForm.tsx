import { useState } from 'react'
import type { AdviceMatch } from '../types/sessionFeedback'
import type { SpeciesInfo } from '../api/scoring'
import './AddPoiForm.css'
import './SessionFeedbackForm.css'

interface Props {
  speciesList: SpeciesInfo[]
  onCancel: () => void
  onSave: (data: {
    fished: boolean
    species?: string
    coords?: [number, number]
    caught: boolean | null
    matchedAdvice: AdviceMatch | null
    note?: string
  }) => void
}

export default function SessionFeedbackForm({ speciesList, onCancel, onSave }: Props) {
  const [fished, setFished] = useState<boolean | null>(null)
  const [species, setSpecies] = useState('')
  const [caught, setCaught] = useState<boolean | null>(null)
  const [matchedAdvice, setMatchedAdvice] = useState<AdviceMatch | null>(null)
  const [note, setNote] = useState('')
  const [coords, setCoords] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)

  const useCurrentPosition = () => {
    if (!('geolocation' in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.longitude, pos.coords.latitude])
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleSaveNo = () => {
    onSave({ fished: false, caught: null, matchedAdvice: null })
  }

  const handleSaveYes = () => {
    onSave({
      fished: true,
      species: species || undefined,
      coords: coords ?? undefined,
      caught,
      matchedAdvice,
      note: note.trim() || undefined,
    })
  }

  return (
    <div className="poi-form session-feedback-form">
      <div className="poi-form-title">Aiuta l'app a dare consigli migliori</div>
      <div className="poi-form-coords">
        Due domande veloci: servono a capire quando il consiglio ha funzionato e quando no —
        anche le uscite senza pesce sono utili quanto quelle con pesce.
      </div>

      <label>
        Hai pescato oggi?
        <div className="poi-form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className={fished === true ? 'primary' : ''} onClick={() => setFished(true)}>
            Sì
          </button>
          <button type="button" className={fished === false ? 'primary' : ''} onClick={() => setFished(false)}>
            No
          </button>
        </div>
      </label>

      {fished === true && (
        <>
          <label>
            Che specie cercavi?
            <select value={species} onChange={(e) => setSpecies(e.target.value)}>
              <option value="">Non ricordo / varie</option>
              {speciesList.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Hai preso qualcosa?
            <div className="poi-form-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className={caught === true ? 'primary' : ''} onClick={() => setCaught(true)}>
                Sì
              </button>
              <button type="button" className={caught === false ? 'primary' : ''} onClick={() => setCaught(false)}>
                No
              </button>
            </div>
          </label>

          <label>
            Il consiglio dell'app corrispondeva a quello che hai trovato in mare?
            <div className="poi-form-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={matchedAdvice === 'si' ? 'primary' : ''}
                onClick={() => setMatchedAdvice('si')}
              >
                Sì
              </button>
              <button
                type="button"
                className={matchedAdvice === 'cosi_cosi' ? 'primary' : ''}
                onClick={() => setMatchedAdvice('cosi_cosi')}
              >
                Così così
              </button>
              <button
                type="button"
                className={matchedAdvice === 'no' ? 'primary' : ''}
                onClick={() => setMatchedAdvice('no')}
              >
                No
              </button>
            </div>
          </label>

          <label>
            Dove, all'incirca? (opzionale)
            <button type="button" onClick={useCurrentPosition} disabled={locating}>
              {locating ? 'Rilevo posizione…' : coords ? '📍 Posizione rilevata' : '📍 Usa posizione attuale'}
            </button>
          </label>

          <label>
            Note (corrente, orario, cosa non ha funzionato…)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </label>
        </>
      )}

      <div className="poi-form-actions">
        <button type="button" onClick={onCancel}>
          Annulla
        </button>
        {fished === true && (
          <button type="button" className="primary" onClick={handleSaveYes}>
            Invia
          </button>
        )}
        {fished === false && (
          <button type="button" className="primary" onClick={handleSaveNo}>
            Invia
          </button>
        )}
      </div>
    </div>
  )
}
