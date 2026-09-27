// Strumento di sviluppo (nostro, non per chi usa l'app): permette di simulare
// la posizione GPS della barca cliccando sulla mappa, per testare "La mia
// posizione", la linea di rotta e "Ti porto lì" da un PC senza andare in mare.
//
// Attivo sempre in `npm run dev` (import.meta.env.DEV). Sul sito pubblicato
// resta spento a meno di aprire il link con `?dev=1` una volta: da li' in poi
// il browser se lo ricorda (localStorage) finche' non si passa `?dev=0`. Un
// amico che apre il link normale non lo vede mai.
const STORAGE_KEY = 'pesca5terre.dev_mode.v1'

export function isDevMode(): boolean {
  if (import.meta.env.DEV) return true
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('dev') === '1') {
      localStorage.setItem(STORAGE_KEY, '1')
      return true
    }
    if (params.get('dev') === '0') {
      localStorage.removeItem(STORAGE_KEY)
      return false
    }
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
