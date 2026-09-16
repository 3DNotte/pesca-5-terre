// Stime approssimative di alba/tramonto per la costa ligure (~44°N), mese per mese.
// Non e' un calcolo astronomico preciso al minuto: serve solo a dare un default
// sensato al wizard ("Quanto tempo hai oggi?" — sezione 7b del progetto).
const SUN_TIMES_BY_MONTH: { sunrise: [number, number]; sunset: [number, number] }[] = [
  { sunrise: [7, 40], sunset: [17, 5] }, // gen
  { sunrise: [7, 15], sunset: [17, 50] }, // feb
  { sunrise: [6, 30], sunset: [18, 30] }, // mar
  { sunrise: [6, 30], sunset: [20, 15] }, // apr
  { sunrise: [5, 50], sunset: [20, 50] }, // mag
  { sunrise: [5, 35], sunset: [21, 15] }, // giu
  { sunrise: [5, 50], sunset: [21, 5] }, // lug
  { sunrise: [6, 20], sunset: [20, 30] }, // ago
  { sunrise: [6, 50], sunset: [19, 35] }, // set
  { sunrise: [7, 20], sunset: [18, 40] }, // ott
  { sunrise: [7, 0], sunset: [17, 0] }, // nov
  { sunrise: [7, 35], sunset: [16, 50] }, // dic
]

function atTime(reference: Date, [h, m]: [number, number]): Date {
  const d = new Date(reference)
  d.setHours(h, m, 0, 0)
  return d
}

export function sunriseSunset(date: Date): { sunrise: Date; sunset: Date } {
  const entry = SUN_TIMES_BY_MONTH[date.getMonth()]
  return { sunrise: atTime(date, entry.sunrise), sunset: atTime(date, entry.sunset) }
}

/**
 * Finestra di default per il wizard: ora corrente -> +3h, a meno che non si sia
 * entro 1h da alba o tramonto, nel qual caso la finestra si sposta su quella
 * fascia (+-90 min), coerente con la sezione 7b del progetto.
 */
export function defaultTimeWindow(now: Date): { start: Date; end: Date } {
  const { sunrise, sunset } = sunriseSunset(now)
  const HOUR = 60 * 60 * 1000

  for (const golden of [sunrise, sunset]) {
    if (Math.abs(now.getTime() - golden.getTime()) <= HOUR) {
      return {
        start: new Date(golden.getTime() - 90 * 60 * 1000),
        end: new Date(golden.getTime() + 90 * 60 * 1000),
      }
    }
  }

  return { start: now, end: new Date(now.getTime() + 3 * HOUR) }
}
