import { useState } from 'react'
import type { FeedbackReason, FollowedSpot } from '../types/sessionFeedback'
import { REASON_LABELS } from '../types/sessionFeedback'
import type { SpeciesInfo } from '../api/scoring'
import { getConsent, setConsent, type Consent } from '../utils/feedbackSync'
import './AddPoiForm.css'
import './SessionFeedbackForm.css'

export interface RecommendedSpot {
  rank: 1 | 2 | 3
  sectorId: string | null
}

interface Props {
  speciesList: SpeciesInfo[]
  /** Spot consigliati dal wizard di oggi (vuoto se non l'hai usato). */
  recommendedSpots: RecommendedSpot[]
  /** Settori scelti col cerchio sulla mappa. */
  pickedSectors: string[]
  onPickZone: () => void
  hidden: boolean
  onCancel: () => void
  onSave: (data: {
    species: string
    followed: FollowedSpot
    sectors: string[]
    reasons: FeedbackReason[]
    note?: string
  }) => void
}

export default function SessionFeedbackForm({
  speciesList,
  recommendedSpots,
  pickedSectors,
  onPickZone,
  hidden,
  onCancel,
  onSave,
}: Props) {
  const [consent, setConsentState] = useState<Consent>(() => getConsent())
  const [species, setSpecies] = useState('')
  const [where, setWhere] = useState<FollowedSpot | null>(null)
  const [reasons, setReasons] = useState<FeedbackReason[]>([])
  const [note, setNote] = useState('')

  const chooseConsent = (v: 'yes' | 'no') => {
    setConsent(v)
    setConsentState(v)
  }

  const toggleReason = (r: FeedbackReason) =>
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))

  const spotFor = (w: FollowedSpot) => recommendedSpots.find((s) => `spot${s.rank}` === w)
  const sectors =
    where === 'other' ? pickedSectors : where ? [spotFor(where)?.sectorId].filter((s): s is string => !!s) : []
  const canSend = !!species && !!where && sectors.length > 0

  const handleSave = () => {
    if (!canSend || !where) return
    onSave({ species, followed: where, sectors, reasons, note: note.trim() || undefined })
  }

  return (
    <div className={`poi-form session-feedback-form${hidden ? ' session-feedback-form--hidden' : ''}`}>
      <div className="poi-form-title">Giornata storta?</div>
      <div className="poi-form-coords">
        Raccontaci dove e cosa non ha funzionato: i giorni senza pesce servono all'app quanto quelli buoni.
      </div>

      {consent === null && (
        <div className="sf-consent">
          Vuoi aiutare l'app a migliorare per tutti? I dati sono <strong>anonimi</strong>: nessun nome né account, solo
          zona (quadrati di ~500 m), specie e motivi.
          <div className="sf-consent-actions">
            <button type="button" className="primary" onClick={() => chooseConsent('yes')}>
              Sì, aiuto l'app
            </button>
            <button type="button" onClick={() => chooseConsent('no')}>
              No, solo sul telefono
            </button>
          </div>
        </div>
      )}
      {consent === 'yes' && (
        <div className="sf-hint">
          ✔ Condivisione anonima attiva.{' '}
          <button type="button" className="sf-chip" onClick={() => chooseConsent('no')}>
            Disattiva
          </button>
        </div>
      )}
      {consent === 'no' && (
        <div className="sf-hint">
          I dati restano solo sul tuo telefono.{' '}
          <button type="button" className="sf-chip" onClick={() => chooseConsent('yes')}>
            Attiva condivisione
          </button>
        </div>
      )}

      <label>
        Che specie insidiavi?
        <select value={species} onChange={(e) => setSpecies(e.target.value)}>
          <option value="">Scegli…</option>
          {speciesList.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        Dove?
        <div className="sf-chips" style={{ marginTop: 4 }}>
          {recommendedSpots.map((s) => (
            <button
              key={s.rank}
              type="button"
              className={`sf-chip${where === `spot${s.rank}` ? ' active' : ''}`}
              onClick={() => setWhere(`spot${s.rank}` as FollowedSpot)}
              disabled={!s.sectorId}
            >
              Spot {s.rank} consigliato
            </button>
          ))}
          <button
            type="button"
            className={`sf-chip${where === 'other' ? ' active' : ''}`}
            onClick={() => {
              setWhere('other')
              if (pickedSectors.length === 0) onPickZone()
            }}
          >
            🖍️ Cerchia sulla mappa
          </button>
        </div>
        {where === 'other' && pickedSectors.length > 0 && (
          <button type="button" style={{ marginTop: 6 }} onClick={onPickZone}>
            {pickedSectors.length} settori selezionati — modifica
          </button>
        )}
        {recommendedSpots.length === 0 && (
          <div className="sf-hint">Gli spot consigliati compaiono se usi prima "Peschiamo!".</div>
        )}
      </div>

      <div>
        Cosa è andato storto? (facoltativo)
        <div className="sf-chips" style={{ marginTop: 4 }}>
          {(Object.keys(REASON_LABELS) as FeedbackReason[]).map((r) => (
            <button
              key={r}
              type="button"
              className={`sf-chip${reasons.includes(r) ? ' active' : ''}`}
              onClick={() => toggleReason(r)}
            >
              {REASON_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <label>
        Altro da dirci (facoltativo, max 300 caratteri)
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} />
        <span className="sf-hint">Lo leggo io: l'app non lo interpreta da sola.</span>
      </label>

      <div className="poi-form-actions">
        <button type="button" onClick={onCancel}>
          Annulla
        </button>
        <button type="button" className="primary" onClick={handleSave} disabled={!canSend || consent === null}>
          Invia
        </button>
      </div>
    </div>
  )
}
