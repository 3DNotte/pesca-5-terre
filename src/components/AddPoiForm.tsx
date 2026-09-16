import { useState } from 'react'
import type { PoiType } from '../types/poi'
import { POI_TYPE_LABELS } from '../types/poi'
import './AddPoiForm.css'

interface Props {
  coords: [number, number]
  onCancel: () => void
  onSave: (data: {
    type: PoiType
    name: string
    capturedAt: string
    depthMeters?: number
    note?: string
  }) => void
}

function nowForInput(): string {
  // "YYYY-MM-DDTHH:mm" nel fuso orario locale, formato richiesto da
  // <input type="datetime-local">.
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function AddPoiForm({ coords, onCancel, onSave }: Props) {
  const [type, setType] = useState<PoiType>('secca')
  const [when, setWhen] = useState(nowForInput())
  const [name, setName] = useState('')
  const [depth, setDepth] = useState('')
  const [note, setNote] = useState('')

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      type,
      name: name.trim(),
      capturedAt: new Date(when).toISOString(),
      depthMeters: depth ? Number(depth) : undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <div className="poi-form">
      <div className="poi-form-title">Nuovo punto</div>

      <label>
        1. Cosa?
        <select value={type} onChange={(e) => setType(e.target.value as PoiType)}>
          {Object.entries(POI_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label>
        2. Dove?
        <div className="poi-form-coords">
          {coords[1].toFixed(5)}, {coords[0].toFixed(5)}
        </div>
      </label>

      <label>
        3. Quando?
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>

      <label>
        Nome
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="es. Secca del Corvo"
          autoFocus
        />
      </label>

      <label>
        Profondita' (m)
        <input
          type="number"
          value={depth}
          onChange={(e) => setDepth(e.target.value)}
          placeholder="es. 35"
        />
      </label>

      <label>
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>

      <div className="poi-form-actions">
        <button type="button" onClick={onCancel}>
          Annulla
        </button>
        <button type="button" className="primary" onClick={handleSave} disabled={!name.trim()}>
          Salva
        </button>
      </div>
    </div>
  )
}
