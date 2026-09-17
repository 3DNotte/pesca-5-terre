/** Icona scoglio/secca stilizzata — due picchi rocciosi che affiorano
 * dall'acqua, invece di un triangolo singolo troppo esile per distinguersi
 * dal rilievo del fondale quando il layer "Dettaglio fondali" e' attivo. */
export function reefIconSvg(color: string, size: number): string {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 9 L15 22 L3 22 Z" fill="${color}" stroke="white" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M21 3 L30 22 L12 22 Z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round" />
      <path d="M21 3 L25 12 L17 12 Z" fill="rgba(255,255,255,0.45)" />
      <line x1="1" y1="25.5" x2="35" y2="25.5" stroke="${color}" stroke-width="3" stroke-linecap="round" />
      <path d="M1 25.5 Q5.5 22.5 10 25.5 T19 25.5 T28 25.5 T35 25.5" fill="none" stroke="white" stroke-width="1.3" opacity="0.75" />
    </svg>
  `
}
