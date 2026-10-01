import type { ScoreResponse } from '../api/scoring'

/** Fasce colore coerenti con la classificazione del backend (classify_score). */
function colorForScore(score: number): [number, number, number, number] {
  // Stesse soglie di classify_score (backend, 55/40/25 dopo la riscrittura della formula
  // (il rosso e' selettivo)): qui cambia solo la resa grafica, non il punteggio.
  // Zona "molto probabile" piu' satura/opaca delle altre cosi' risalta a
  // colpo d'occhio invece di essere un rosso tenue come le fasce sotto — la
  // sostanza del dato non cambia.
  if (score >= 55) return [211, 24, 24, 215] // molto probabile — rosso vivo, ben rimarcato
  if (score >= 40) return [239, 108, 0, 130] // buono — arancio
  if (score >= 25) return [251, 192, 45, 95] // da provare — giallo tenue
  return [0, 0, 0, 0] // sconsigliato — trasparente, non copre la mappa
}

/** Converte la griglia di score in una data URL PNG da usare come raster image source. */
export function scoreGridToDataUrl(grid: ScoreResponse['grid']): string {
  const canvas = document.createElement('canvas')
  canvas.width = grid.width
  canvas.height = grid.height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(grid.width, grid.height)

  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const value = grid.values[row][col]
      const idx = (row * grid.width + col) * 4
      const [r, g, b, a] = value == null ? [0, 0, 0, 0] : colorForScore(value)
      imageData.data[idx] = r
      imageData.data[idx + 1] = g
      imageData.data[idx + 2] = b
      imageData.data[idx + 3] = a
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

// Quante tessere per lato: un compromesso tra granularita' (ogni tessera copre
// un'area piu' piccola, meno soggetta all'errore di proiezione di MapLibre a
// zoom estremo) e numero di sorgenti/layer da gestire.
const SCORE_TILE_COLS = 10
const SCORE_TILE_ROWS = 8
export const SCORE_TILE_COUNT = SCORE_TILE_COLS * SCORE_TILE_ROWS

export interface ScoreTile {
  bounds: [number, number, number, number] // west, south, east, north
  url: string
}

/** Divide la griglia di score in SCORE_TILE_COUNT tessere piccole invece di
 * un'unica immagine enorme (tutta l'area operativa, ~29x21 km). Verificato
 * con test diretti: a zoom molto alto sotto costa, un'unica immagine di
 * quell'estensione viene disegnata da MapLibre con un errore di proiezione
 * di decine/centinaia di metri (il colore appare spostato rispetto al punto
 * vero) — un limite della libreria nel riproiettare un'immagine cosi' grande
 * su un'area di schermo cosi' piccola, non un errore nei dati (verificato:
 * i valori della griglia e il canvas generato sono corretti pixel per
 * pixel). Tessere piu' piccole, come gia' per il dettaglio fondali
 * (hillshade_detail_tiles.json), non soffrono di questo problema. */
export function scoreGridToTiles(grid: ScoreResponse['grid']): ScoreTile[] {
  const [west, south, east, north] = grid.bounds
  const colStep = Math.ceil(grid.width / SCORE_TILE_COLS)
  const rowStep = Math.ceil(grid.height / SCORE_TILE_ROWS)
  const tiles: ScoreTile[] = []

  for (let tileRow = 0; tileRow < SCORE_TILE_ROWS; tileRow++) {
    const rowStart = tileRow * rowStep
    const rowEnd = Math.min(rowStart + rowStep, grid.height)
    if (rowStart >= rowEnd) continue
    for (let tileCol = 0; tileCol < SCORE_TILE_COLS; tileCol++) {
      const colStart = tileCol * colStep
      const colEnd = Math.min(colStart + colStep, grid.width)
      if (colStart >= colEnd) continue

      const w = colEnd - colStart
      const h = rowEnd - rowStart
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      const imageData = ctx.createImageData(w, h)

      for (let row = rowStart; row < rowEnd; row++) {
        for (let col = colStart; col < colEnd; col++) {
          const value = grid.values[row][col]
          const idx = ((row - rowStart) * w + (col - colStart)) * 4
          const [r, g, b, a] = value == null ? [0, 0, 0, 0] : colorForScore(value)
          imageData.data[idx] = r
          imageData.data[idx + 1] = g
          imageData.data[idx + 2] = b
          imageData.data[idx + 3] = a
        }
      }
      ctx.putImageData(imageData, 0, 0)

      const tileWest = west + (colStart / grid.width) * (east - west)
      const tileEast = west + (colEnd / grid.width) * (east - west)
      const tileNorth = north - (rowStart / grid.height) * (north - south)
      const tileSouth = north - (rowEnd / grid.height) * (north - south)

      tiles.push({ bounds: [tileWest, tileSouth, tileEast, tileNorth], url: canvas.toDataURL('image/png') })
    }
  }
  return tiles
}

/** Angoli dell'immagine per una maplibregl ImageSource: alto-sx, alto-dx, basso-dx, basso-sx. */
export function imageCoordinates(bounds: [number, number, number, number]): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  const [west, south, east, north] = bounds
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]
}
