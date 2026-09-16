/** Icona ancora stilizzata per i marker dei relitti, al posto del rombo pieno. */
export function anchorIconSvg(color: string, size: number): string {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="7" r="3.2" fill="none" stroke="${color}" stroke-width="2.2" />
      <line x1="16" y1="10" x2="16" y2="26" stroke="${color}" stroke-width="2.2" />
      <line x1="9" y1="14" x2="23" y2="14" stroke="${color}" stroke-width="2.2" />
      <path d="M6 17 A10 10 0 0 0 15 26" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" />
      <path d="M26 17 A10 10 0 0 1 17 26" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  `
}
