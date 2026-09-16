/** Icona scoglio/secca stilizzata — richiama il simbolo di roccia affiorante
 * delle carte nautiche, invece di un semplice pallino colorato. */
export function reefIconSvg(color: string, size: number): string {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 4 L23 15 L27 22 L5 22 L9 15 Z" fill="${color}" stroke="white" stroke-width="1.4" stroke-linejoin="round" />
      <path d="M16 4 L19 12 L13 12 Z" fill="rgba(255,255,255,0.35)" />
      <line x1="5" y1="26" x2="27" y2="26" stroke="${color}" stroke-width="2.4" stroke-linecap="round" />
    </svg>
  `
}
