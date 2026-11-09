import type { ScoreResponse } from '../api/scoring'
import { scoreGridToTiles, type ScoreTile } from './heatmap'

// Interfaccia verso scoreTiles.worker.ts. Le immagini tornano come Blob e
// diventano URL "blob:" (piu' leggeri delle data URL in base64); quelli del
// calcolo precedente vengono liberati a ogni nuovo risultato.
let worker: Worker | null = null
let nextId = 0
let previousUrls: string[] = []
const pending = new Map<number, (tiles: ScoreTile[]) => void>()

function getWorker(): Worker | null {
  if (worker) return worker
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  try {
    worker = new Worker(new URL('./scoreTiles.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
  worker.onmessage = (e: MessageEvent<{ id: number; tiles: { bounds: ScoreTile['bounds']; blob: Blob }[] }>) => {
    const resolve = pending.get(e.data.id)
    if (!resolve) return // gia' risolto dal ripiego (vedi scoreTilesAsync)
    pending.delete(e.data.id)
    for (const url of previousUrls) URL.revokeObjectURL(url)
    const tiles = e.data.tiles.map((t) => ({ bounds: t.bounds, url: URL.createObjectURL(t.blob) }))
    previousUrls = tiles.map((t) => t.url)
    resolve(tiles)
  }
  // Worker rotto: da qui in poi tutto sul thread principale.
  worker.onerror = () => {
    workerBroken = true
    worker?.terminate()
    worker = null
  }
  return worker
}

// Se il worker non risponde in tempo (errore, o browser che lo congela —
// visto una volta con la pagina nascosta) il colore si calcola comunque nel
// modo vecchio: meglio un attimo di blocco che una mappa senza sfumatura.
const WORKER_TIMEOUT_MS = 10_000
let workerBroken = false

export function scoreTilesAsync(grid: ScoreResponse['grid']): Promise<ScoreTile[]> {
  const w = workerBroken ? null : getWorker()
  if (!w) return Promise.resolve(scoreGridToTiles(grid))
  const id = ++nextId
  return new Promise((resolve) => {
    const fallback = () => {
      if (!pending.has(id)) return
      pending.delete(id)
      resolve(scoreGridToTiles(grid))
    }
    const timer = setTimeout(fallback, WORKER_TIMEOUT_MS)
    pending.set(id, (tiles) => {
      clearTimeout(timer)
      resolve(tiles)
    })
    w.addEventListener('error', fallback, { once: true })
    w.postMessage({ id, grid })
  })
}
