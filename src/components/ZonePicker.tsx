import { useEffect, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { pointInPolygon, sectorCenter, sectorIdAt, type SectorFeature } from '../utils/sectors'
import './ZonePicker.css'

const SOURCE_ID = 'zone-picker-sectors'
const FILL_ID = 'zone-picker-fill'
const LINE_ID = 'zone-picker-line'

interface Props {
  map: maplibregl.Map
  sectors: SectorFeature[]
  selected: string[]
  onChange: (ids: string[]) => void
  onDone: () => void
  onCancel: () => void
}

/** Cerchia col dito (o tocca) i settori dove hai pescato. Il cerchio diventa
 * un elenco di id di settore (~500 m): nessuna coordinata precisa dell'utente. */
export default function ZonePicker({ map, sectors, selected, onChange, onDone, onCancel }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pathRef = useRef<[number, number][]>([])
  const drawingRef = useRef(false)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const [moveMode, setMoveMode] = useState(false)

  // Layer dei settori sulla mappa (creato all'apertura, rimosso alla chiusura).
  useEffect(() => {
    const data = {
      type: 'FeatureCollection' as const,
      features: sectors.map((f) => ({ ...f, properties: { ...f.properties, selected: false } })),
    }
    map.addSource(SOURCE_ID, { type: 'geojson', data })
    map.addLayer({
      id: FILL_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': ['case', ['get', 'selected'], '#e53935', '#1e6fd9'],
        'fill-opacity': ['case', ['get', 'selected'], 0.5, 0.07],
      },
    })
    map.addLayer({
      id: LINE_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': '#1e6fd9', 'line-width': 0.6, 'line-opacity': 0.5 },
    })
    return () => {
      if (map.getLayer(LINE_ID)) map.removeLayer(LINE_ID)
      if (map.getLayer(FILL_ID)) map.removeLayer(FILL_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
  }, [map, sectors])

  useEffect(() => {
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    const set = new Set(selected)
    src.setData({
      type: 'FeatureCollection',
      features: sectors.map((f) => ({ ...f, properties: { ...f.properties, selected: set.has(f.properties.id) } })),
    })
  }, [map, sectors, selected])

  const toLngLat = (x: number, y: number): [number, number] => {
    const p = map.unproject([x, y])
    return [p.lng, p.lat]
  }

  const drawPath = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const pts = pathRef.current
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (const p of pts) ctx.lineTo(p[0], p[1])
    ctx.strokeStyle = '#e53935'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  const localPoint = (e: React.PointerEvent): [number, number] => {
    const rect = overlayRef.current!.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return
    canvas.width = overlay.clientWidth
    canvas.height = overlay.clientHeight
    overlay.setPointerCapture(e.pointerId)
    drawingRef.current = true
    pathRef.current = [localPoint(e)]
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return
    pathRef.current.push(localPoint(e))
    drawPath()
  }

  const onPointerUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const pts = pathRef.current
    pathRef.current = []
    drawPath()
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    const current = new Set(selectedRef.current)

    if (extent < 14) {
      // tocco: alterna il singolo settore
      const [lon, lat] = toLngLat(pts[0][0], pts[0][1])
      const id = sectorIdAt(sectors, lon, lat)
      if (id) {
        if (current.has(id)) current.delete(id)
        else current.add(id)
        onChange([...current])
      }
      return
    }
    // cerchio a mano libera: tutti i settori con il centro dentro
    const poly = pts.map((p) => toLngLat(p[0], p[1]))
    for (const f of sectors) {
      if (pointInPolygon(sectorCenter(f), poly)) current.add(f.properties.id)
    }
    onChange([...current])
  }

  return (
    <>
      <div
        ref={overlayRef}
        className={`zone-picker-overlay${moveMode ? ' zone-picker-overlay--move' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="zone-picker-canvas" />
      </div>
      <div className="zone-picker-bar">
        <div className="zone-picker-hint">
          {moveMode
            ? 'Sposta/zooma la mappa, poi torna a cerchiare'
            : 'Cerchia col dito la zona dove hai pescato (o tocca un quadrato)'}
        </div>
        <div className="zone-picker-actions">
          <button type="button" onClick={() => setMoveMode((v) => !v)}>
            {moveMode ? '✏️ Cerchia' : '✋ Muovi mappa'}
          </button>
          <button type="button" onClick={() => onChange([])} disabled={selected.length === 0}>
            Cancella
          </button>
          <button type="button" onClick={onCancel}>
            Annulla
          </button>
          <button type="button" className="primary" onClick={onDone} disabled={selected.length === 0}>
            Fatto ({selected.length})
          </button>
        </div>
      </div>
    </>
  )
}
