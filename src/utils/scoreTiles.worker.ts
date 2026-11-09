/// <reference lib="webworker" />
import type { ScoreResponse } from '../api/scoring'
import { computeScoreTilePixels } from './heatmap'

// Calcolo delle tessere colore del punteggio FUORI dal thread principale:
// sono milioni di pixel (sfumatura fine, vedi heatmap.ts) e sul telefono
// bloccherebbero l'app per qualche secondo. Qui gira in sottofondo: la mappa
// resta fluida e i pesci compaiono subito, il colore appena pronto.
self.onmessage = async (e: MessageEvent<{ id: number; grid: ScoreResponse['grid'] }>) => {
  const { id, grid } = e.data
  const tiles = await Promise.all(
    computeScoreTilePixels(grid).map(async (tile) => {
      const canvas = new OffscreenCanvas(tile.width, tile.height)
      canvas.getContext('2d')!.putImageData(new ImageData(tile.data, tile.width, tile.height), 0, 0)
      return { bounds: tile.bounds, blob: await canvas.convertToBlob({ type: 'image/png' }) }
    }),
  )
  self.postMessage({ id, tiles })
}
