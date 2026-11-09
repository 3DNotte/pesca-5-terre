import type { ScoreResponse } from '../api/scoring'

// Rampa di colore continua, non tre fasce piene: le soglie restano quelle di
// classify_score (backend) e della legenda — 25 giallo "da provare", 40
// arancio "buono", 55 rosso "molto probabile" — ma tra una e l'altra il
// colore si fonde, e oltre il 55 il rosso si scurisce verso il cremisi dove
// il punteggio e' altissimo. Anche l'opacita' cresce col punteggio: le zone
// deboli velano appena il mare, quelle forti risaltano. Cambia solo la resa
// grafica, non il dato.
const RAMP: [number, [number, number, number, number]][] = [
  [20, [245, 214, 80, 0]],
  [25, [245, 208, 74, 70]],
  [40, [239, 125, 26, 135]],
  [55, [211, 40, 36, 195]],
  [75, [178, 20, 40, 215]],
]

function colorForScore(score: number): [number, number, number, number] {
  if (score <= RAMP[0][0]) return [0, 0, 0, 0]
  for (let i = 1; i < RAMP.length; i++) {
    const [s1, c1] = RAMP[i]
    if (score <= s1) {
      const [s0, c0] = RAMP[i - 1]
      const t = (score - s0) / (s1 - s0)
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
        c0[3] + (c1[3] - c0[3]) * t,
      ]
    }
  }
  return RAMP[RAMP.length - 1][1]
}

// Ogni cella della griglia (~38 m) diventa UPSAMPLE x UPSAMPLE pixel, con il
// punteggio interpolato tra le celle vicine (bilineare): niente piu'
// "quadretti" a gradino, la sfumatura scorre come un campo continuo. 3 e' un
// compromesso tra morbidezza e tempo di calcolo sul telefono.
const UPSAMPLE = 3

// Colore gia' calcolato per ogni quarto di punto (0..100): nel ciclo sui
// pixel (milioni) si legge da qui invece di ricalcolare la rampa.
const LUT_STEPS = 4
const COLOR_LUT = (() => {
  const lut = new Uint8ClampedArray((100 * LUT_STEPS + 1) * 4)
  for (let i = 0; i <= 100 * LUT_STEPS; i++) lut.set(colorForScore(i / LUT_STEPS), i * 4)
  return lut
})()

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

/** Pixel RGBA gia' calcolati di una tessera: niente DOM, cosi' il calcolo
 * puo' girare anche in un Web Worker (vedi scoreTiles.worker.ts). */
export interface ScoreTilePixels {
  bounds: [number, number, number, number]
  width: number
  height: number
  data: Uint8ClampedArray<ArrayBuffer>
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
export function computeScoreTilePixels(grid: ScoreResponse['grid']): ScoreTilePixels[] {
  const [west, south, east, north] = grid.bounds
  const colStep = Math.ceil(grid.width / SCORE_TILE_COLS)
  const rowStep = Math.ceil(grid.height / SCORE_TILE_ROWS)
  const tiles: ScoreTilePixels[] = []

  // Griglia piatta, terra = NaN: letta milioni di volte nel ciclo sotto.
  const gw = grid.width
  const gh = grid.height
  const flat = new Float32Array(gw * gh)
  for (let r = 0; r < gh; r++) {
    const rowValues = grid.values[r]
    for (let c = 0; c < gw; c++) {
      const v = rowValues[c]
      flat[r * gw + c] = v == null ? NaN : v
    }
  }

  for (let tileRow = 0; tileRow < SCORE_TILE_ROWS; tileRow++) {
    const rowStart = tileRow * rowStep
    const rowEnd = Math.min(rowStart + rowStep, grid.height)
    if (rowStart >= rowEnd) continue
    for (let tileCol = 0; tileCol < SCORE_TILE_COLS; tileCol++) {
      const colStart = tileCol * colStep
      const colEnd = Math.min(colStart + colStep, grid.width)
      if (colStart >= colEnd) continue

      const w = (colEnd - colStart) * UPSAMPLE
      const h = (rowEnd - rowStart) * UPSAMPLE
      // Punteggio interpolato (bilineare) tra le 4 celle vicine; le celle di
      // terra (NaN) non entrano nella media. wsum = quota di vicini in mare:
      // sulla costa scende da 1 a 0 attraversando la riva e serve a sfumare
      // il colore li' (meta' strada = la riva) invece di chiuderlo a gradino.
      const data = new Uint8ClampedArray(w * h * 4) // parte tutta trasparente
      for (let py = 0; py < h; py++) {
        const gy = rowStart + (py + 0.5) / UPSAMPLE - 0.5
        const r0 = Math.floor(gy)
        const fy = gy - r0
        const ra = (r0 < 0 ? 0 : r0) * gw
        const rb = (r0 + 1 > gh - 1 ? gh - 1 : r0 + 1) * gw
        for (let px = 0; px < w; px++) {
          const gx = colStart + (px + 0.5) / UPSAMPLE - 0.5
          const c0 = Math.floor(gx)
          const fx = gx - c0
          const ca = c0 < 0 ? 0 : c0
          const cb = c0 + 1 > gw - 1 ? gw - 1 : c0 + 1
          let sum = 0
          let wsum = 0
          let v = flat[ra + ca]
          let wt = (1 - fx) * (1 - fy)
          if (v === v) { sum += v * wt; wsum += wt }
          v = flat[ra + cb]
          wt = fx * (1 - fy)
          if (v === v) { sum += v * wt; wsum += wt }
          v = flat[rb + ca]
          wt = (1 - fx) * fy
          if (v === v) { sum += v * wt; wsum += wt }
          v = flat[rb + cb]
          wt = fx * fy
          if (v === v) { sum += v * wt; wsum += wt }
          if (wsum <= 0.25) continue // terra o quasi: resta trasparente

          const score = sum / wsum
          const li = (score <= 0 ? 0 : score >= 100 ? 100 * LUT_STEPS : Math.round(score * LUT_STEPS)) * 4
          const alpha = COLOR_LUT[li + 3]
          if (alpha === 0) continue
          const coastFade = wsum >= 0.75 ? 1 : (wsum - 0.25) / 0.5
          const idx = (py * w + px) * 4
          data[idx] = COLOR_LUT[li]
          data[idx + 1] = COLOR_LUT[li + 1]
          data[idx + 2] = COLOR_LUT[li + 2]
          data[idx + 3] = alpha * coastFade
        }
      }
      const tileWest = west + (colStart / grid.width) * (east - west)
      const tileEast = west + (colEnd / grid.width) * (east - west)
      const tileNorth = north - (rowStart / grid.height) * (north - south)
      const tileSouth = north - (rowEnd / grid.height) * (north - south)

      tiles.push({ bounds: [tileWest, tileSouth, tileEast, tileNorth], width: w, height: h, data })
    }
  }
  return tiles
}

/** Ripiego sul thread principale (browser senza Worker/OffscreenCanvas):
 * stesso risultato di scoreTilesAsync, ma blocca l'app per il tempo del calcolo. */
export function scoreGridToTiles(grid: ScoreResponse['grid']): ScoreTile[] {
  return computeScoreTilePixels(grid).map((tile) => {
    const canvas = document.createElement('canvas')
    canvas.width = tile.width
    canvas.height = tile.height
    canvas.getContext('2d')!.putImageData(new ImageData(tile.data, tile.width, tile.height), 0, 0)
    return { bounds: tile.bounds, url: canvas.toDataURL('image/png') }
  })
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
