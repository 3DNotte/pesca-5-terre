import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// Senza questo, in produzione Rollup non include il worker di MapLibre (usa
// `new URL(...)` che non riesce ad analizzare staticamente) e la mappa resta
// bianca: qui lo importiamo esplicitamente con `?worker&url` cosi' viene
// emesso come asset con nome fisso, e lo passiamo a MapLibre.
setWorkerUrl(workerUrl)
