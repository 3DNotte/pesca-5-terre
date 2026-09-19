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
