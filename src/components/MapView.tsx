import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../utils/maplibreWorker'
import { AREA_BOUNDS, AREA_CENTER, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../config/area'
import { EXTRA_WRECKS, INTEREST_LABEL, WRECK_EXTRA, wreckInterest } from '../config/wreckInfo'
import { bearingDegrees, compassLabel, distanceMeters } from '../utils/geo'
import { usePois } from '../hooks/usePois'
import type { PoiType } from '../types/poi'
import { POI_TYPE_LABELS } from '../types/poi'
import { useVerifiedDepths } from '../hooks/useVerifiedDepths'
import { useCatches } from '../hooks/useCatches'
import { DEPTH_SOURCE_LABELS } from '../types/verifiedDepth'
import type { WreckCollection, WreckFeature } from '../types/wreck'
import type { RealShoalCollection, RealShoalFeature } from '../types/realShoal'
import { useWreckNotes } from '../hooks/useWreckNotes'
import { anchorIconSvg } from '../utils/wreckIcon'
import { reefIconSvg } from '../utils/reefIcon'
import AddPoiForm from './AddPoiForm'
import SessionFeedbackForm from './SessionFeedbackForm'
import { useSessionFeedback } from '../hooks/useSessionFeedback'
import {
  fetchSpecies,
  fetchWizard,
  type ScoreResponse,
  type SpeciesInfo,
  type WizardResponse,
} from '../api/scoring'
import { imageCoordinates, scoreGridToDataUrl } from '../utils/heatmap'
import { colorForClassification, fishIconSvg } from '../utils/fishIcon'
import WizardPanel from './WizardPanel'
import MeteoWidget from './MeteoWidget'
import './MapView.css'

const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

const BATHYMETRY_SOURCE_ID = 'emodnet-bathymetry'
const BATHYMETRY_LAYER_ID = 'emodnet-bathymetry-layer'
const BATHYMETRY_TILE_URL =
  'https://tiles.emodnet-bathymetry.eu/latest/mean_atlas_land/web_mercator/{z}/{x}/{y}.png'
const BATHYMETRY_MAX_ZOOM = 15

const AMP_SOURCE_ID = 'amp-zone-a'
const AMP_FILL_LAYER_ID = 'amp-zone-a-fill'
const AMP_LINE_LAYER_ID = 'amp-zone-a-line'

const FERRY_ROUTE_SOURCE_ID = 'ferry-route'
const FERRY_ROUTE_LAYER_ID = 'ferry-route-line'

const POI_TYPE_COLOR: Record<PoiType, string> = {
  secca: '#e8620c',
  relitto: '#8a1f1f',
  mangiata: '#1a5d1a',
}

// Secche rilevate: colore per altezza (m). <= LOW_MAX verde, >= HIGH_MIN rosso, in mezzo giallo.
const SHOAL_LOW_MAX_M = 1
const SHOAL_HIGH_MIN_M = 5
const SHOAL_COLORS = { low: '#2e9b3a', mid: '#f2b705', high: '#c62828' }

const SCORE_SOURCE_ID = 'predictive-score'
const SCORE_LAYER_ID = 'predictive-score-layer'

const ISOBATHS_SOURCE_ID = 'isobaths'
const ISOBATHS_LINE_LAYER_ID = 'isobaths-line'
const ISOBATHS_LABEL_LAYER_ID = 'isobaths-label'

// Dati reali Regione Liguria (SICOAST), digitalizzati da carte nautiche, CC BY —
// molto piu' precisi della griglia EMODnet a 115m per quest'area. Diventano il
// layer batimetrico/isobate primario; EMODnet resta come opzione secondaria.
const LIGURIA_ISOBATHS_SOURCE_ID = 'liguria-isobaths'
const LIGURIA_ISOBATHS_LINE_LAYER_ID = 'liguria-isobaths-line'
const LIGURIA_ISOBATHS_LABEL_LAYER_ID = 'liguria-isobaths-label'

// Texture di rilievo ombreggiato del fondale (hillshade), stile Google Maps —
// generata da backend/scripts/generate_hillshade.py dallo stesso raster
// EMODnet gia' usato per le isobate. E' una texture decorativa (profondita'
// percettiva), non un riferimento di precisione: quello restano le isobate
// vettoriali reali di Regione Liguria disegnate sopra.
const HILLSHADE_SOURCE_ID = 'bathymetry-hillshade'
const HILLSHADE_LAYER_ID = 'bathymetry-hillshade-layer'

// Overlay ad alta risoluzione (2m/pixel, generato dallo stesso script) sopra
// il rilievo principale, a tessere: solo dove il dato reale Regione Liguria
// esiste davvero. Numero e nomi delle tessere variano ad ogni rigenerazione,
// quindi vengono aggiunte dinamicamente da un manifest invece che elencate qui.
const HILLSHADE_DETAIL_SOURCE_PREFIX = 'bathymetry-hillshade-detail-'
const HILLSHADE_DETAIL_LAYER_PREFIX = 'bathymetry-hillshade-detail-layer-'

// I file in public/data/ vengono rigenerati periodicamente dagli script
// backend. Senza un parametro che cambi, il browser puo' continuare a
// servire una copia in cache anche dopo un refresh (specialmente con
// versioni gia' visitate in precedenza nella stessa sessione) — un nuovo
// valore ad ogni caricamento della pagina forza sempre un fetch fresco.
const DATA_CACHE_BUST = Date.now()
function withCacheBust(path: string): string {
  return `${path}?v=${DATA_CACHE_BUST}`
}

// Distanza e rotta live per i popup, calcolate in JS dal GPS del telefono
// senza uscire dall'app (vedi useEffect "Distanza/rotta live" piu' sotto, che
// aggiorna periodicamente ogni elemento .nav-live presente nel DOM). Il link
// a Google Maps resta come opzione secondaria per la navigazione vera e propria.
function navigateLinkHtml(lat: number, lon: number): string {
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
  return `
    <div class="poi-popup-navlive nav-live" data-lat="${lat}" data-lon="${lon}">📍 in attesa GPS…</div>
    <a class="poi-popup-navigate" href="${url}" target="_blank" rel="noopener noreferrer">Apri in Google Maps</a>
  `
}

function blankTransparentPixel(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  // ctx non disegna nulla: il canvas resta trasparente di default.
  canvas.getContext('2d')
  return canvas.toDataURL('image/png')
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const poiMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const addPoiModeRef = useRef(false)
  const depthMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map())


  // Non piu' selezionabile dal pannello "Mappa" (era "+ dett fondali"): resta
  // spento di default. Layer e dati (isobate stimate EMODnet) non sono stati
  // eliminati, solo resi irraggiungibili dall'interfaccia.
  const [isobathsVisible] = useState(false)
  const [liguriaIsobathsVisible, setLiguriaIsobathsVisible] = useState(true)
  const [hillshadeVisible, setHillshadeVisible] = useState(true)
  const [ampVisible, setAmpVisible] = useState(true)
  const [poiVisible] = useState(true)
  const [ferryVisible, setFerryVisible] = useState(true)
  const [addPoiMode, setAddPoiMode] = useState(false)
  const [pendingCoords, setPendingCoords] = useState<[number, number] | null>(null)
  const [sessionFeedbackOpen, setSessionFeedbackOpen] = useState(false)
  const { addFeedback } = useSessionFeedback()

  const { depths: verifiedDepths, removeDepth } = useVerifiedDepths()

  const catchMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const [catchesVisible, setCatchesVisible] = useState(true)
  const [capturingCatch, setCapturingCatch] = useState(false)
  const [catchError, setCatchError] = useState<string | null>(null)
  const { catches, addCatch, updateCatch, removeCatch } = useCatches()

  const [wrecks, setWrecks] = useState<WreckFeature[]>([])
  const [wrecksVisible, setWrecksVisible] = useState(true)
  const wreckMarkersRef = useRef<maplibregl.Marker[]>([])
  const { notes: wreckNotes, setNote: setWreckNote } = useWreckNotes()

  const [realShoals, setRealShoals] = useState<RealShoalFeature[]>([])
  const [realShoalsVisible, setRealShoalsVisible] = useState(true)
  const realShoalMarkersRef = useRef<maplibregl.Marker[]>([])

  const [speciesList, setSpeciesList] = useState<SpeciesInfo[]>([])
  const [scoreResult, setScoreResult] = useState<ScoreResponse | null>(null)
  const [scoreVisible, setScoreVisible] = useState(true)
  const topSpotMarkersRef = useRef<maplibregl.Marker[]>([])

  const hillshadeDetailLayerIdsRef = useRef<string[]>([])

  const [legendCollapsed, setLegendCollapsed] = useState(false)
  const [otherOpen, setOtherOpen] = useState(false)

  const { pois, addPoi, removePoi } = usePois()

  useEffect(() => {
    fetchSpecies()
      .then(setSpeciesList)
      .catch(() => setSpeciesList([]))
    fetch(withCacheBust('/data/relitti_ukho.geojson'))
      .then((r) => r.json())
      .then((data: WreckCollection) => setWrecks([...data.features, ...EXTRA_WRECKS]))
      .catch(() => setWrecks([...EXTRA_WRECKS]))
    fetch(withCacheBust('/data/real_shoals.geojson'))
      .then((r) => r.json())
      .then((data: RealShoalCollection) => setRealShoals(data.features))
      .catch(() => setRealShoals([]))
  }, [])

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardResult, setWizardResult] = useState<WizardResponse | null>(null)
  const [wizardLoading, setWizardLoading] = useState(false)
  const [wizardError, setWizardError] = useState<string | null>(null)

  const handleWizardSubmit = (params: {
    start: Date
    end: Date
    species: string[]
    bottomFishing: boolean
  }) => {
    setWizardLoading(true)
    setWizardError(null)
    fetchWizard(params)
      .then((result) => {
        setWizardResult(result)
        setScoreResult(result)
        setScoreVisible(true)
        const map = mapRef.current
        if (map && result.top_spots.length > 0) {
          const bounds = new maplibregl.LngLatBounds()
          for (const spot of result.top_spots) bounds.extend([spot.lon, spot.lat])
          map.fitBounds(bounds, { padding: 100, maxZoom: 14, duration: 800 })
        }
      })
      .catch((err) => setWizardError(err instanceof Error ? err.message : 'Errore sconosciuto'))
      .finally(() => setWizardLoading(false))
  }

  useEffect(() => {
    addPoiModeRef.current = addPoiMode
    if (containerRef.current) {
      containerRef.current.style.cursor = addPoiMode ? 'crosshair' : ''
    }
  }, [addPoiMode])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: AREA_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: AREA_BOUNDS,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'Batimetria: Regione Liguria (SICOAST, CC BY) · EMODnet Bathymetry',
      }),
    )

    map.on('click', (e) => {
      if (addPoiModeRef.current) {
        setPendingCoords([e.lngLat.lng, e.lngLat.lat])
      }
    })

    map.on('load', () => {
      // --- Batimetria EMODnet ---
      map.addSource(BATHYMETRY_SOURCE_ID, {
        type: 'raster',
        tiles: [BATHYMETRY_TILE_URL],
        tileSize: 256,
        maxzoom: BATHYMETRY_MAX_ZOOM,
        attribution: 'EMODnet Bathymetry Consortium',
      })

      const firstSymbolLayer = map
        .getStyle()
        .layers?.find((layer) => layer.type === 'symbol')?.id

      map.addLayer(
        {
          id: BATHYMETRY_LAYER_ID,
          type: 'raster',
          source: BATHYMETRY_SOURCE_ID,
          // Sempre visibile, opacita' fissa: niente piu' interruttore/regolatore in "Mappa".
          paint: { 'raster-opacity': 0.75 },
        },
        firstSymbolLayer,
      )

      // --- Isobate (linee di profondita' vettoriali, generate da dati EMODnet reali) ---
      map.addSource(ISOBATHS_SOURCE_ID, {
        type: 'geojson',
        data: withCacheBust('/data/isobaths.geojson'),
      })
      map.addLayer(
        {
          id: ISOBATHS_LINE_LAYER_ID,
          type: 'line',
          source: ISOBATHS_SOURCE_ID,
          paint: {
            'line-color': [
              'interpolate',
              ['linear'],
              ['get', 'depth'],
              0, '#9ecae1',
              50, '#4292c6',
              150, '#2166ac',
              500, '#08306b',
            ],
            'line-width': ['case', ['in', ['get', 'depth'], ['literal', [50, 100, 200, 500]]], 1.3, 0.8],
            'line-opacity': 0.7,
            // Tratteggiata come le zone AMP: comunica "andamento generale", non una misura precisa.
            'line-dasharray': [3, 2],
          },
        },
        firstSymbolLayer,
      )
      map.addLayer(
        {
          id: ISOBATHS_LABEL_LAYER_ID,
          type: 'symbol',
          source: ISOBATHS_SOURCE_ID,
          minzoom: 11,
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 220,
            'text-field': ['concat', ['get', 'depth'], ' m'],
            'text-size': 10,
            'text-font': ['Noto Sans Regular'],
          },
          paint: {
            'text-color': '#2166ac',
            'text-halo-color': '#fff',
            'text-halo-width': 1.2,
          },
        },
        firstSymbolLayer,
      )

      // --- Rilievo ombreggiato del fondale (hillshade, stile Google Maps) ---
      map.addSource(HILLSHADE_SOURCE_ID, {
        type: 'image',
        url: withCacheBust('/data/bathymetry_hillshade.png'),
        coordinates: imageCoordinates(AREA_BOUNDS.flat() as [number, number, number, number]),
      })
      map.addLayer(
        {
          id: HILLSHADE_LAYER_ID,
          type: 'raster',
          source: HILLSHADE_SOURCE_ID,
          paint: {
            // Oltre lo zoom 16 il pixel del rilievo (dato reale, ~6m) diventa piu' grande dello schermo:
            // sfuma leggermente cosi' le isobate (vettoriali, sempre nitide) restano il riferimento principale.
            'raster-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.9, 17, 0.62],
            'raster-fade-duration': 0,
          },
        },
        firstSymbolLayer,
      )

      // --- Overlay di dettaglio (2m/pixel, solo dato reale, a tessere) ---
      // Sopra il rilievo principale: stessa fonte Regione Liguria, ma senza
      // il ricampionamento a 6m, quindi molto piu' nitido da vicino. Fuori
      // dalla fascia coperta le tessere non esistono proprio.
      fetch(withCacheBust('/data/hillshade_detail_tiles.json'))
        .then((res) => (res.ok ? res.json() : { tiles: [] }))
        .then((manifest: { tiles: { file: string; coordinates: [number, number][] }[] }) => {
          manifest.tiles.forEach((tile, i) => {
            const sourceId = `${HILLSHADE_DETAIL_SOURCE_PREFIX}${i}`
            const layerId = `${HILLSHADE_DETAIL_LAYER_PREFIX}${i}`
            map.addSource(sourceId, {
              type: 'image',
              url: withCacheBust(`/data/hillshade_detail/${tile.file}`),
              coordinates: tile.coordinates as [
                [number, number],
                [number, number],
                [number, number],
                [number, number],
              ],
            })
            map.addLayer(
              {
                id: layerId,
                type: 'raster',
                source: sourceId,
                minzoom: 13,
                paint: { 'raster-opacity': 0.92, 'raster-fade-duration': 0 },
              },
              firstSymbolLayer,
            )
            hillshadeDetailLayerIdsRef.current.push(layerId)
          })
        })
        .catch(() => {})

      // --- Isobate REALI (Regione Liguria/SICOAST, da carte nautiche, CC BY) ---
      map.addSource(LIGURIA_ISOBATHS_SOURCE_ID, {
        type: 'geojson',
        data: withCacheBust('/data/liguria_isobaths.geojson'),
      })
      map.addLayer(
        {
          id: LIGURIA_ISOBATHS_LINE_LAYER_ID,
          type: 'line',
          source: LIGURIA_ISOBATHS_SOURCE_ID,
          paint: {
            'line-color': '#0b3d6b',
            // 75/80m: +45% di spessore (1.45 invece di 1) per farle risaltare
            // — l'opacita' e' gia' al tetto (1.0), non puo' salire oltre.
            'line-width': [
              'case',
              ['in', ['get', 'depth'], ['literal', [50, 100, 200, 500]]], 1.6,
              ['in', ['get', 'depth'], ['literal', [75, 80]]], 1.45,
              1,
            ],
            'line-opacity': 1,
            // Solida = dato reale (Regione Liguria). Alcuni livelli (es. 40m)
            // il rilievo di dettaglio li copre solo a tratti: dove manca, il
            // tratto e' completato con il contorno EMODnet (meno preciso) e
            // marcato "source":"emodnet" — qui diventa tratteggiato, stessa
            // convenzione del layer isobate stimate.
            'line-dasharray': ['case', ['==', ['get', 'source'], 'emodnet'], ['literal', [3, 2]], ['literal', [1, 0]]],
          },
        },
        firstSymbolLayer,
      )
      map.addLayer(
        {
          id: LIGURIA_ISOBATHS_LABEL_LAYER_ID,
          type: 'symbol',
          source: LIGURIA_ISOBATHS_SOURCE_ID,
          minzoom: 11,
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 220,
            'text-field': ['concat', ['get', 'depth'], ' m'],
            'text-size': 10,
            'text-font': ['Noto Sans Regular'],
          },
          paint: {
            'text-color': '#0b3d6b',
            'text-halo-color': '#fff',
            'text-halo-width': 1.2,
          },
        },
        firstSymbolLayer,
      )

      // --- Punteggio predittivo (heatmap dal motore di scoring) ---
      map.addSource(SCORE_SOURCE_ID, {
        type: 'image',
        url: blankTransparentPixel(),
        coordinates: imageCoordinates(AREA_BOUNDS.flat() as [number, number, number, number]),
      })
      map.addLayer(
        {
          id: SCORE_LAYER_ID,
          type: 'raster',
          source: SCORE_SOURCE_ID,
          paint: { 'raster-opacity': 0.75, 'raster-fade-duration': 0 },
        },
        firstSymbolLayer,
      )

      // --- Zone AMP Cinque Terre — poligoni ESATTI di Zona A e Zona B dal
      // Decreto Ministeriale 20 luglio 2011, n. 189 (Gazzetta Ufficiale),
      // non i vecchi cerchi indicativi. Zona C non è inclusa: il decreto la
      // definisce per esclusione rispetto a un perimetro esterno complessivo
      // il cui elenco di coordinate non è stato reperito da fonte primaria
      // verificabile (rimanda al decreto istitutivo del 1997).
      map.addSource(AMP_SOURCE_ID, {
        type: 'geojson',
        data: withCacheBust('/data/amp_zones.geojson'),
      })
      map.addLayer({
        id: AMP_FILL_LAYER_ID,
        type: 'fill',
        source: AMP_SOURCE_ID,
        paint: {
          'fill-color': ['match', ['get', 'zone'], 'A', '#d32f2f', 'B', '#fbc02d', '#d32f2f'],
          'fill-opacity': ['match', ['get', 'zone'], 'A', 0.22, 'B', 0.15, 0.18],
        },
      })
      map.addLayer({
        id: AMP_LINE_LAYER_ID,
        type: 'line',
        source: AMP_SOURCE_ID,
        paint: {
          'line-color': ['match', ['get', 'zone'], 'A', '#d32f2f', 'B', '#c9a227', '#d32f2f'],
          'line-width': 1.5,
          'line-dasharray': [2, 1],
        },
      })

      // --- Rotta traghetti (traccia lungo la costa vera — Regione Liguria —
      // non una linea retta fra i moli, che taglierebbe sopra i promontori
      // come Punta Mesco fra Levanto e Monterosso) ---
      map.addSource(FERRY_ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: withCacheBust('/data/ferry_route.geojson'),
      })
      map.addLayer({
        id: FERRY_ROUTE_LAYER_ID,
        type: 'line',
        source: FERRY_ROUTE_SOURCE_ID,
        paint: { 'line-color': '#e60000', 'line-width': 3 },
      })

      // Niente piu' marker puntiformi per fermate traghetto e borghi: la
      // basemap mostra gia' i nomi dei paesi come etichette di testo (vedi
      // sotto, ingrandite leggermente) — il pallino blu e il quadratino
      // verde erano ridondanti e affollavano la mappa.
      for (const id of ['place_villages', 'place_hamlet', 'place_town', 'place_suburbs']) {
        const layer = map.getStyle().layers?.find((l) => l.id === id)
        const currentSize = layer && 'layout' in layer ? (layer.layout as { 'text-size'?: unknown })?.['text-size'] : undefined
        if (!currentSize) continue
        const scaled =
          typeof currentSize === 'number'
            ? currentSize * 1.25
            : typeof currentSize === 'object' && currentSize !== null && 'stops' in currentSize
              ? {
                  stops: (currentSize as { stops: [number, number][] }).stops.map(([z, v]) => [z, v * 1.25]),
                }
              : currentSize
        // 'scaled' rispecchia qualunque forma avesse gia' 'text-size' nello
        // stile CARTO (numero fisso o stops legacy): non vale la pena
        // tipizzarlo a fondo per una regolazione cosmetica di uno stile
        // di terze parti introspezionato a runtime.
        map.setLayoutProperty(id, 'text-size', scaled as maplibregl.DataDrivenPropertyValueSpecification<number>)
      }
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(ISOBATHS_LINE_LAYER_ID)) return
    const visibility = isobathsVisible ? 'visible' : 'none'
    map.setLayoutProperty(ISOBATHS_LINE_LAYER_ID, 'visibility', visibility)
    map.setLayoutProperty(ISOBATHS_LABEL_LAYER_ID, 'visibility', visibility)
  }, [isobathsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(LIGURIA_ISOBATHS_LINE_LAYER_ID)) return
    const visibility = liguriaIsobathsVisible ? 'visible' : 'none'
    map.setLayoutProperty(LIGURIA_ISOBATHS_LINE_LAYER_ID, 'visibility', visibility)
    map.setLayoutProperty(LIGURIA_ISOBATHS_LABEL_LAYER_ID, 'visibility', visibility)
  }, [liguriaIsobathsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(HILLSHADE_LAYER_ID)) return
    const visibility = hillshadeVisible ? 'visible' : 'none'
    map.setLayoutProperty(HILLSHADE_LAYER_ID, 'visibility', visibility)
    for (const layerId of hillshadeDetailLayerIdsRef.current) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
    }
  }, [hillshadeVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(AMP_FILL_LAYER_ID)) return
    const visibility = ampVisible ? 'visible' : 'none'
    map.setLayoutProperty(AMP_FILL_LAYER_ID, 'visibility', visibility)
    map.setLayoutProperty(AMP_LINE_LAYER_ID, 'visibility', visibility)
  }, [ampVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(FERRY_ROUTE_LAYER_ID)) return
    map.setLayoutProperty(FERRY_ROUTE_LAYER_ID, 'visibility', ferryVisible ? 'visible' : 'none')
  }, [ferryVisible])

  // --- Aggiorna l'immagine heatmap e i marker dei top spot quando arriva un nuovo risultato ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !scoreResult) return

    const source = map.getSource(SCORE_SOURCE_ID) as maplibregl.ImageSource | undefined
    if (source) {
      source.updateImage({
        url: scoreGridToDataUrl(scoreResult.grid),
        coordinates: imageCoordinates(scoreResult.grid.bounds),
      })
    }

    for (const marker of topSpotMarkersRef.current) marker.remove()
    topSpotMarkersRef.current = []

    const maxScore = Math.max(...scoreResult.top_spots.map((s) => s.score), 1)

    scoreResult.top_spots.forEach((spot, i) => {
      const isTop = i === 0
      const el = document.createElement('div')
      // Il migliore non e' solo leggermente piu' grande: ha anche un alone
      // pulsante e un badge, cosi' si riconosce a colpo d'occhio tra gli altri.
      el.className = isTop ? 'top-spot-fish-marker top-spot-fish-marker-best' : 'top-spot-fish-marker'
      const size = isTop ? 46 : 30 + (spot.score / maxScore) * 10
      el.innerHTML =
        (isTop ? '<div class="top-spot-halo"></div><div class="top-spot-badge">TOP</div>' : '') +
        fishIconSvg(colorForClassification(spot.classification), size)
      const popupHtml = `
        <strong>Hot spot #${i + 1} — ${spot.classification}</strong><br/>
        Punteggio: ${spot.score}/100<br/>
        Profondita' stimata: ${spot.depth_m} m
      `
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([spot.lon, spot.lat])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(popupHtml))
        .addTo(map)
      topSpotMarkersRef.current.push(marker)
    })
  }, [scoreResult])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(SCORE_LAYER_ID)) return
    map.setLayoutProperty(SCORE_LAYER_ID, 'visibility', scoreVisible ? 'visible' : 'none')
    for (const marker of topSpotMarkersRef.current) {
      marker.getElement().style.display = scoreVisible ? '' : 'none'
    }
  }, [scoreVisible])

  // --- Relitti reali (UKHO Worldwide Wrecks, via EMODnet Human Activities) ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const marker of wreckMarkersRef.current) marker.remove()
    wreckMarkersRef.current = []

    if (!wrecksVisible) return

    for (const wreck of wrecks) {
      const p = wreck.properties
      // La maggior parte dei relitti UKHO non ha un nome (16 su 18 in
      // quest'area): "Relitto non identificato" uguale per tutti non li
      // distingue. Il wreck_id e' unico per ciascuno, usarlo nel nome di
      // fallback li rende riconoscibili singolarmente.
      const title = p.name ?? `Relitto UKHO #${p.wreck_id}`
      const [lon, lat] = wreck.geometry.coordinates

      const el = document.createElement('div')
      el.className = 'wreck-marker'
      el.title = title
      el.innerHTML = anchorIconSvg('white', 14)

      // "Non-dangerous wreck" e' il valore quasi sempre presente (15 relitti
      // su 18) e non dice nulla di utile — solo "Dangerous wreck" (3 casi)
      // e' un'informazione di sicurezza da mostrare subito.
      const mainDetails = [
        p.category === 'Dangerous wreck' ? p.category : null,
        p.depth_m != null ? `${p.depth_m} m` : null,
      ]
        .filter(Boolean)
        .join(' · ')

      const existingNote = wreckNotes[p.wreck_id] ?? ''

      const popupContainer = document.createElement('div')
      popupContainer.className = 'poi-popup'
      const extraInfo = WRECK_EXTRA[p.wreck_id]
      const interest = wreckInterest(p.depth_m, p.removed, extraInfo)
      popupContainer.innerHTML = `
        <strong>${title}</strong><br/>
        ${mainDetails || 'Dettagli non disponibili'}
        <br/>Interesse pesca: <strong>${INTEREST_LABEL[interest.level]}</strong> <span class="poi-popup-coords">(stima: ${interest.reason})</span>
        <br/><span class="poi-popup-coords">${lat.toFixed(5)}, ${lon.toFixed(5)}</span>
        <br/>${navigateLinkHtml(lat, lon)}
      `

      const toggleBtn = document.createElement('button')
      toggleBtn.textContent = 'Altro ▾'
      toggleBtn.className = 'poi-popup-toggle'
      popupContainer.appendChild(toggleBtn)

      const extra = document.createElement('div')
      extra.className = 'poi-popup-extra'
      extra.hidden = true

      const extraDetails = [p.vessel_type, p.year_sunk ? `affondato nel ${p.year_sunk}` : null]
        .filter(Boolean)
        .join(' · ')
      if (extraDetails) extra.innerHTML += `${extraDetails}<br/>`
      if (extraInfo) extra.innerHTML += `<span class="poi-popup-note">${extraInfo.note} Fonti: ${extraInfo.sources}.</span><br/>`
      if (p.removed) extra.innerHTML += `<span class="poi-popup-note">Segnalato come rimosso/non più presente</span><br/>`
      if (p.circumstance) extra.innerHTML += `<span class="poi-popup-note">${p.circumstance}</span><br/>`

      const noteInput = document.createElement('textarea')
      noteInput.className = 'poi-popup-note-input'
      noteInput.rows = 2
      noteInput.placeholder = 'Aggiungi una nota personale…'
      noteInput.value = existingNote
      extra.appendChild(noteInput)

      const saveNoteBtn = document.createElement('button')
      saveNoteBtn.textContent = 'Salva nota'
      saveNoteBtn.className = 'poi-popup-save'
      saveNoteBtn.onclick = () => setWreckNote(p.wreck_id, noteInput.value)
      extra.appendChild(saveNoteBtn)

      toggleBtn.onclick = () => {
        extra.hidden = !extra.hidden
        toggleBtn.textContent = extra.hidden ? 'Altro ▾' : 'Altro ▴'
      }

      popupContainer.appendChild(extra)

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(wreck.geometry.coordinates)
        .setPopup(new maplibregl.Popup({ offset: 10, maxWidth: '240px' }).setDOMContent(popupContainer))
        .addTo(map)
      wreckMarkersRef.current.push(marker)
    }
  }, [wrecks, wrecksVisible, wreckNotes, setWreckNote])

  // --- Marker dei POI (secche/relitti), ricreati quando cambia la lista ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const marker of poiMarkersRef.current.values()) marker.remove()
    poiMarkersRef.current.clear()

    if (!poiVisible) return

    for (const poi of pois) {
      const el = document.createElement('div')
      el.title = poi.name
      if (poi.type === 'secca') {
        // Icona dedicata (scoglio affiorante) invece del pallino generico:
        // le secche sono l'informazione di pesca piu' cercata, meritano di
        // risaltare piu' delle altre.
        el.className = 'poi-marker poi-marker-reef'
        el.innerHTML = reefIconSvg(POI_TYPE_COLOR[poi.type], 34)
      } else {
        el.className = 'poi-marker'
        el.style.background = POI_TYPE_COLOR[poi.type]
      }

      const [poiLon, poiLat] = poi.coords
      // I punti salvati prima che "quando" diventasse un campo esplicito non
      // hanno capturedAt: usiamo createdAt come ripiego, cosi' non si rompe
      // nulla sui dati gia' salvati.
      const capturedDate = new Date(poi.capturedAt ?? poi.createdAt)
      const whenStr = `${capturedDate.toLocaleDateString('it-IT')} ${capturedDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
      const popupContainer = document.createElement('div')
      popupContainer.className = 'poi-popup'
      popupContainer.innerHTML = `
        <strong>${poi.name}</strong><br/>
        ${POI_TYPE_LABELS[poi.type]}${poi.depthMeters ? ` · ${poi.depthMeters} m` : ''}<br/>
        ${whenStr}
        ${poi.note ? `<br/><span class="poi-popup-note">${poi.note}</span>` : ''}
        <br/><span class="poi-popup-coords">${poiLat.toFixed(5)}, ${poiLon.toFixed(5)}</span>
        <br/>${navigateLinkHtml(poiLat, poiLon)}
      `
      const deleteBtn = document.createElement('button')
      deleteBtn.textContent = 'Elimina'
      deleteBtn.className = 'poi-popup-delete'
      deleteBtn.onclick = () => removePoi(poi.id)
      popupContainer.appendChild(deleteBtn)

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(poi.coords)
        .setPopup(new maplibregl.Popup({ offset: 10 }).setDOMContent(popupContainer))
        .addTo(map)

      poiMarkersRef.current.set(poi.id, marker)
    }
  }, [pois, poiVisible])

  // --- Secche rilevate dai dati reali (isobate Regione Liguria sottocosta,
  // EMODnet al largo) — distinte dai punti "Secche" che l'utente aggiunge a
  // mano: qui nessun nome/nota personale, solo profondita' e fonte del dato. ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const marker of realShoalMarkersRef.current) marker.remove()
    realShoalMarkersRef.current = []

    if (!realShoalsVisible) return

    const SOURCE_LABEL: Record<RealShoalFeature['properties']['source'], string> = {
      regione_liguria_isobate: 'Isobate Regione Liguria (rilievo 2012)',
      emodnet: 'EMODnet Bathymetry (stima, ~115m/pixel)',
    }
    // Colore per ALTEZZA della secca (scelta dell'utente): quelle di 1 m o meno
    // sono poco interessanti (verde), le medie gialle, le alte rosse.
    const colorForShoalHeight = (heightM: number): string =>
      heightM <= SHOAL_LOW_MAX_M ? SHOAL_COLORS.low : heightM < SHOAL_HIGH_MIN_M ? SHOAL_COLORS.mid : SHOAL_COLORS.high
    for (const shoal of realShoals) {
      const [lon, lat] = shoal.geometry.coordinates
      const el = document.createElement('div')
      el.className = 'poi-marker poi-marker-reef poi-marker-reef-real'
      el.innerHTML = reefIconSvg(colorForShoalHeight(shoal.properties.height_m), 30)
      el.title = `Secca: cima a ${shoal.properties.depth_m} m, alta ${shoal.properties.height_m} m`

      const popupContainer = document.createElement('div')
      popupContainer.className = 'poi-popup'
      popupContainer.innerHTML = `
        <strong>Secca rilevata (dati reali)</strong><br/>
        Profondità del mare: ${shoal.properties.base_depth_m} m<br/>
        Altezza della secca: ${shoal.properties.height_m} m<br/>
        Cima a ${shoal.properties.depth_m} m<br/>
        Fonte: ${SOURCE_LABEL[shoal.properties.source]}
        <br/><span class="poi-popup-coords">${lat.toFixed(5)}, ${lon.toFixed(5)}</span>
        <br/>${navigateLinkHtml(lat, lon)}
      `

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lon, lat])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setDOMContent(popupContainer))
        .addTo(map)
      realShoalMarkersRef.current.push(marker)
    }
  }, [realShoals, realShoalsVisible])

  // --- Marker delle profondità verificate (dati reali inseriti dall'utente) ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const marker of depthMarkersRef.current.values()) marker.remove()
    depthMarkersRef.current.clear()

    for (const vd of verifiedDepths) {
      const el = document.createElement('div')
      el.className = 'depth-marker'
      el.textContent = String(vd.depthMeters)
      el.title = `${vd.name} — ${vd.depthMeters} m (${DEPTH_SOURCE_LABELS[vd.source]})`

      const popupContainer = document.createElement('div')
      popupContainer.className = 'poi-popup'
      popupContainer.innerHTML = `
        <strong>${vd.name}</strong><br/>
        ${vd.depthMeters} m — profondità verificata<br/>
        Fonte: ${DEPTH_SOURCE_LABELS[vd.source]}<br/>
        <span class="poi-popup-coords">${vd.coords[1].toFixed(5)}, ${vd.coords[0].toFixed(5)}</span>
        ${vd.note ? `<br/><span class="poi-popup-note">${vd.note}</span>` : ''}
        <br/>${navigateLinkHtml(vd.coords[1], vd.coords[0])}
      `
      const deleteBtn = document.createElement('button')
      deleteBtn.textContent = 'Elimina'
      deleteBtn.className = 'poi-popup-delete'
      deleteBtn.onclick = () => removeDepth(vd.id)
      popupContainer.appendChild(deleteBtn)

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(vd.coords)
        .setPopup(new maplibregl.Popup({ offset: 10 }).setDOMContent(popupContainer))
        .addTo(map)

      depthMarkersRef.current.set(vd.id, marker)
    }
  }, [verifiedDepths])

  // --- Marker delle catture (posizione GPS del telefono + data/ora, non un
  // punto scelto sulla mappa) ---
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const marker of catchMarkersRef.current.values()) marker.remove()
    catchMarkersRef.current.clear()

    if (!catchesVisible) return

    for (const c of catches) {
      const [lon, lat] = c.coords
      const captured = new Date(c.capturedAt)
      const dateStr = captured.toLocaleDateString('it-IT')
      const timeStr = captured.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

      const el = document.createElement('div')
      el.className = 'catch-marker'
      el.textContent = '🎣'
      el.title = `Cattura del ${dateStr} alle ${timeStr}`

      const popupContainer = document.createElement('div')
      popupContainer.className = 'poi-popup'
      popupContainer.innerHTML = `
        <strong>Cattura del ${dateStr}</strong><br/>
        ore ${timeStr}<br/>
        <span class="poi-popup-coords">${lat.toFixed(5)}, ${lon.toFixed(5)}</span>
        ${c.note ? `<br/><span class="poi-popup-note">${c.note}</span>` : ''}
      `

      if (c.photoDataUrl) {
        const img = document.createElement('img')
        img.className = 'poi-popup-photo'
        img.src = c.photoDataUrl
        popupContainer.appendChild(img)
      }

      const photoInput = document.createElement('input')
      photoInput.type = 'file'
      photoInput.accept = 'image/*'
      photoInput.className = 'poi-popup-photo-input'
      photoInput.id = `catch-photo-${c.id}`
      const photoLabel = document.createElement('label')
      photoLabel.htmlFor = photoInput.id
      photoLabel.className = 'poi-popup-toggle'
      photoLabel.textContent = c.photoDataUrl ? '📷 Cambia foto' : '📷 Aggiungi foto'
      photoInput.onchange = () => {
        const file = photoInput.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => updateCatch(c.id, { photoDataUrl: reader.result as string })
        reader.readAsDataURL(file)
      }
      popupContainer.appendChild(photoLabel)
      popupContainer.appendChild(photoInput)

      const noteInput = document.createElement('textarea')
      noteInput.className = 'poi-popup-note-input'
      noteInput.rows = 2
      noteInput.placeholder = 'Specie, esca, note…'
      noteInput.value = c.note ?? ''
      popupContainer.appendChild(noteInput)

      const saveNoteBtn = document.createElement('button')
      saveNoteBtn.textContent = 'Salva nota'
      saveNoteBtn.className = 'poi-popup-save'
      saveNoteBtn.onclick = () => updateCatch(c.id, { note: noteInput.value.trim() || undefined })
      popupContainer.appendChild(saveNoteBtn)

      const shareBtn = document.createElement('button')
      shareBtn.textContent = '📤 Condividi'
      shareBtn.className = 'poi-popup-save'
      shareBtn.onclick = () => {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
        const text = `Cattura del ${dateStr} alle ${timeStr}\n${mapsUrl}`
        const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
        if (nav.share) {
          nav.share({ title: 'Cattura', text, url: mapsUrl }).catch(() => {})
        } else {
          // Nessuna Web Share API (es. desktop): apriamo direttamente WhatsApp
          // con il testo pre-compilato, cosi' funziona comunque.
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
        }
      }
      popupContainer.appendChild(shareBtn)

      const navigateEl = document.createElement('div')
      navigateEl.innerHTML = navigateLinkHtml(lat, lon)
      popupContainer.appendChild(navigateEl)

      const deleteBtn = document.createElement('button')
      deleteBtn.textContent = 'Elimina'
      deleteBtn.className = 'poi-popup-delete'
      deleteBtn.onclick = () => removeCatch(c.id)
      popupContainer.appendChild(deleteBtn)

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(c.coords)
        .setPopup(new maplibregl.Popup({ offset: 10, maxWidth: '240px' }).setDOMContent(popupContainer))
        .addTo(map)

      catchMarkersRef.current.set(c.id, marker)
    }
  }, [catches, catchesVisible, updateCatch, removeCatch])

  // Distanza/rotta live nei popup ("Naviga qui" -> navigateLinkHtml): niente
  // bussola grafica (il magnetometro del telefono in barca, vicino a motore e
  // scafo metallico, e' inaffidabile) — solo distanza e rotta in gradi, come
  // il "vai al waypoint" di un GPS da barca. Il GPS parte solo alla prima
  // apertura di un popup con questo dato (non subito al caricamento pagina),
  // rilevato passivamente controllando se esiste gia' un elemento .nav-live
  // nel DOM: i popup di MapLibre esistono nel DOM solo mentre sono aperti.
  const liveNavWatchId = useRef<number | null>(null)
  const liveNavPosition = useRef<[number, number] | null>(null) // [lon, lat]

  useEffect(() => {
    const updateLiveNavElements = () => {
      const els = document.querySelectorAll<HTMLElement>('.nav-live')
      if (els.length === 0) return

      if (liveNavWatchId.current == null && 'geolocation' in navigator) {
        liveNavWatchId.current = navigator.geolocation.watchPosition(
          (pos) => {
            liveNavPosition.current = [pos.coords.longitude, pos.coords.latitude]
          },
          () => {
            liveNavPosition.current = null
          },
          { enableHighAccuracy: true, maximumAge: 5000 },
        )
      }

      const here = liveNavPosition.current
      for (const el of els) {
        const lat = Number(el.dataset.lat)
        const lon = Number(el.dataset.lon)
        if (!here) {
          el.textContent = '📍 in attesa GPS…'
          continue
        }
        const dist = distanceMeters(here, [lon, lat])
        const brg = bearingDegrees(here, [lon, lat])
        const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`
        el.textContent = `📍 ${distStr} · rotta ${Math.round(brg)}° (${compassLabel(brg)})`
      }
    }

    const interval = setInterval(updateLiveNavElements, 2000)
    return () => {
      clearInterval(interval)
      if (liveNavWatchId.current != null) {
        navigator.geolocation.clearWatch(liveNavWatchId.current)
        liveNavWatchId.current = null
      }
    }
  }, [])

  // Cattura al volo: posizione GPS del telefono in questo istante, non un
  // punto scelto sulla mappa — pensato per essere usato in un secondo con le
  // mani bagnate appena tirato su un pesce.
  const handleCaptureCatch = () => {
    if (!('geolocation' in navigator)) {
      setCatchError('GPS non disponibile su questo dispositivo/browser.')
      return
    }
    setCapturingCatch(true)
    setCatchError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        addCatch({
          coords: [pos.coords.longitude, pos.coords.latitude],
          capturedAt: new Date().toISOString(),
        })
        setCapturingCatch(false)
      },
      (err) => {
        setCatchError(
          err.code === err.PERMISSION_DENIED
            ? 'Permesso GPS negato — abilitalo nelle impostazioni del browser/telefono.'
            : 'Non riesco a leggere la posizione GPS. Riprova.',
        )
        setCapturingCatch(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleSavePoi = (data: {
    type: PoiType
    name: string
    capturedAt: string
    depthMeters?: number
    note?: string
  }) => {
    if (!pendingCoords) return
    addPoi({ ...data, coords: pendingCoords })
    setPendingCoords(null)
    setAddPoiMode(false)
  }

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-container" />

      {pendingCoords && (
        <AddPoiForm
          coords={pendingCoords}
          onCancel={() => {
            setPendingCoords(null)
            setAddPoiMode(false)
          }}
          onSave={handleSavePoi}
        />
      )}

      {sessionFeedbackOpen && (
        <SessionFeedbackForm
          speciesList={speciesList}
          onCancel={() => setSessionFeedbackOpen(false)}
          onSave={(data) => {
            addFeedback(data)
            setSessionFeedbackOpen(false)
          }}
        />
      )}

      <MeteoWidget />

      <WizardPanel
        open={wizardOpen}
        onToggleOpen={() => setWizardOpen((v) => !v)}
        speciesList={speciesList}
        loading={wizardLoading}
        error={wizardError}
        result={wizardResult}
        onSubmit={handleWizardSubmit}
      />

      <div className={`layer-panel${legendCollapsed ? ' layer-panel--collapsed' : ''}`}>
        <button
          type="button"
          className="layer-panel-header"
          onClick={() => setLegendCollapsed((v) => !v)}
          aria-expanded={!legendCollapsed}
        >
          Mappa
          <span className="layer-panel-toggle-icon">{legendCollapsed ? '▸' : '▾'}</span>
        </button>

        {!legendCollapsed && (
          <>
            {scoreResult && (
              <>
                <label className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={scoreVisible}
                    onChange={(e) => setScoreVisible(e.target.checked)}
                  />
                  Hot spot e punteggio predittivo
                </label>
                <div className="score-legend">
                  <span style={{ background: '#c62828' }} /> molto probabile
                  <span style={{ background: '#ef6c00' }} /> buono
                  <span style={{ background: '#fbc02d' }} /> da provare
                </div>
              </>
            )}

            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={hillshadeVisible}
                onChange={(e) => setHillshadeVisible(e.target.checked)}
              />
              Dettaglio fondali
            </label>

            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={liguriaIsobathsVisible}
                onChange={(e) => setLiguriaIsobathsVisible(e.target.checked)}
              />
              Linee di profondità
            </label>

            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={wrecksVisible}
                onChange={(e) => setWrecksVisible(e.target.checked)}
              />
              Relitti
            </label>

            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={realShoalsVisible}
                onChange={(e) => setRealShoalsVisible(e.target.checked)}
              />
              Secche
            </label>
            {realShoalsVisible && (
              <div className="score-legend">
                <span style={{ background: SHOAL_COLORS.high }} /> alta (5 m o più)
                <span style={{ background: SHOAL_COLORS.mid }} /> media
                <span style={{ background: SHOAL_COLORS.low }} /> bassa (1 m o meno)
              </div>
            )}

            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={catchesVisible}
                onChange={(e) => setCatchesVisible(e.target.checked)}
              />
              Catture
            </label>

            <button
              type="button"
              className="layer-other-toggle"
              onClick={() => setOtherOpen((v) => !v)}
              aria-expanded={otherOpen}
            >
              Altro {otherOpen ? '▴' : '▾'}
            </button>
            {otherOpen && (
              <div className="layer-other">
              <label className="layer-toggle">
                <input
                  type="checkbox"
                  checked={ampVisible}
                  onChange={(e) => setAmpVisible(e.target.checked)}
                />
                Zone AMP A/B
              </label>

              <label className="layer-toggle">
                <input
                  type="checkbox"
                  checked={ferryVisible}
                  onChange={(e) => setFerryVisible(e.target.checked)}
                />
                Rotta traghetti
              </label>
              </div>
            )}

            <button
              type="button"
              className="add-poi-btn catch-now-btn"
              onClick={handleCaptureCatch}
              disabled={capturingCatch}
            >
              {capturingCatch ? 'Rilevo posizione…' : '🎣 Cattura! (Now)'}
            </button>
            {catchError && <div className="catch-error">{catchError}</div>}

            <button
              type="button"
              className={`add-poi-btn${addPoiMode ? ' active' : ''}`}
              onClick={() => setAddPoiMode((v) => !v)}
            >
              {addPoiMode ? 'Tocca la mappa…' : '+ Aggiungi punto'}
            </button>

            <button type="button" className="add-poi-btn" onClick={() => setSessionFeedbackOpen(true)}>
              🎣 Come è andata oggi?
            </button>
          </>
        )}
      </div>
    </div>
  )
}
