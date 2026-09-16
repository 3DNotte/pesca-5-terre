/** Icona pesce stilizzata per i marker degli hot spot, colorata per fascia di punteggio. */
export function fishIconSvg(color: string, size: number): string {
  return `
    <svg width="${size}" height="${size * 0.6}" viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
      <polygon points="42,20 62,6 62,34" fill="${color}" />
      <ellipse cx="24" cy="20" rx="20" ry="13" fill="${color}" />
      <polygon points="22,7 30,1 33,10" fill="${color}" />
      <circle cx="14" cy="16" r="3.4" fill="white" />
      <circle cx="13" cy="16" r="1.5" fill="#111" />
    </svg>
  `
}

/** Colore coerente con le fasce del backend (classify_score) e la legenda in mappa. */
export function colorForClassification(classification: string): string {
  switch (classification) {
    case 'molto probabile':
      return '#c62828'
    case 'buono':
      return '#ef6c00'
    case 'da provare':
      return '#fbc02d'
    default:
      return '#757575'
  }
}
