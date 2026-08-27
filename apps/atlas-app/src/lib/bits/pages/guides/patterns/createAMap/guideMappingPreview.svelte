<script module lang="ts">
import type { StyleSpecification } from 'maplibre-gl'

const cachedStyles = new Map<string, Promise<StyleSpecification>>()
type CachedTileJson = {
  attribution?: string
  bounds?: [number, number, number, number]
  maxzoom?: number
  minzoom?: number
  scheme?: 'xyz' | 'tms'
  tiles: string[]
}
const cachedTileJsons = new Map<string, Promise<CachedTileJson>>()

const getCachedStyle = (url: string) => {
  const cached = cachedStyles.get(url)
  if (cached) return cached

  const request = fetch(url)
    .then(async response => {
      if (!response.ok)
        throw new Error(`The map style could not be loaded (${response.status}).`)

      return (await response.json()) as StyleSpecification
    })
    .catch(cause => {
      cachedStyles.delete(url)
      throw cause
    })

  cachedStyles.set(url, request)
  return request
}

const getCachedTileJson = (url: string) => {
  const cached = cachedTileJsons.get(url)
  if (cached) return cached

  const request = fetch(url)
    .then(async response => {
      if (!response.ok)
        throw new Error(`The basemap could not be loaded (${response.status}).`)

      const tileJson = (await response.json()) as Partial<CachedTileJson>
      if (!tileJson.tiles?.every(tile => typeof tile === 'string'))
        throw new Error('The basemap did not return any tile URLs.')

      return tileJson as CachedTileJson
    })
    .catch(cause => {
      cachedTileJsons.delete(url)
      throw cause
    })

  cachedTileJsons.set(url, request)
  return request
}
</script>

<script lang="ts">
import { onMount } from 'svelte'
import {
  setWorkerUrl,
  type Map as MapLibreMap,
  type LayerSpecification,
} from 'maplibre-gl'
import type { StyleSpecification as MapboxStyleSpecification } from 'mapbox-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'leaflet/dist/leaflet.css'
import 'mapbox-gl/dist/mapbox-gl.css'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(maplibreWorkerUrl)

type Renderer = 'leaflet' | 'mapbox' | 'maplibre'
type Coordinates = [longitude: number, latitude: number]

type Props = {
  additionalLayers?: LayerSpecification[]
  additionalSources?: StyleSpecification['sources']
  ariaLabel: string
  beforeLayerId?: string
  center: Coordinates
  onMapReady?: (map: MapLibreMap) => void | Promise<void>
  renderer: Renderer
  styleUrl?: string
  tilejsonUrl?: string
  unstyled?: boolean
  zoom: number
}

let {
  additionalLayers = [],
  additionalSources = {},
  ariaLabel,
  beforeLayerId,
  center,
  onMapReady,
  renderer,
  styleUrl,
  tilejsonUrl,
  unstyled = false,
  zoom,
}: Props = $props()
let container = $state<HTMLDivElement>()
let error = $state<string>()
let loading = $state(true)

const libraryName = (value: Renderer) =>
  value === 'mapbox' ? 'Mapbox GL JS' : value === 'leaflet' ? 'Leaflet' : 'MapLibre'

const loadStyle = async (): Promise<StyleSpecification> => {
  if (unstyled) {
    return {
      version: 8,
      sources: additionalSources,
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#fff9ed' },
        },
      ],
    }
  }

  if (!styleUrl || !tilejsonUrl)
    throw new Error('A map style and basemap are required.')

  // Keep the immutable network response for transient previews, while every map
  // receives its own mutable style object.
  const [styleResponse, tileJson] = await Promise.all([
    getCachedStyle(styleUrl),
    getCachedTileJson(tilejsonUrl),
  ])
  const style = structuredClone(styleResponse)
  style.sources = {
    basemap: {
      type: 'vector',
      ...tileJson,
    },
    ...additionalSources,
  }

  if (additionalLayers.length > 0) {
    const beforeIndex = beforeLayerId
      ? style.layers.findIndex(layer => layer.id === beforeLayerId)
      : -1
    style.layers.splice(
      beforeIndex === -1 ? style.layers.length : beforeIndex,
      0,
      ...additionalLayers,
    )
  }

  return style
}

onMount(() => {
  let disposed = false
  let remove: (() => void) | undefined
  let resizeObserver: ResizeObserver | undefined

  const observeResize = (resize: () => void) => {
    if (!container) return
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()
  }

  void (async () => {
    try {
      loading = true
      error = undefined
      const style = await loadStyle()
      if (disposed || !container) return

      if (renderer === 'leaflet') {
        const [leaflet, { maplibreGL }] = await Promise.all([
          import('leaflet'),
          import('@maplibre/maplibre-gl-leaflet'),
        ])
        if (disposed || !container) return

        const map = leaflet.map(container, {
          attributionControl: false,
          zoomControl: false,
        })
        map.setView([center[1], center[0]], zoom)
        maplibreGL({ style }).addTo(map)
        remove = () => map.remove()
        observeResize(() => map.invalidateSize())
      } else if (renderer === 'mapbox') {
        const { default: mapboxgl } = await import('mapbox-gl')
        if (disposed || !container) return

        const map = new mapboxgl.Map({
          attributionControl: false,
          container,
          center,
          style: style as unknown as MapboxStyleSpecification,
          zoom,
        })
        remove = () => map.remove()
        observeResize(() => map.resize())
      } else {
        const { Map: MapLibreMap } = await import('maplibre-gl')
        if (disposed || !container) return

        const map = new MapLibreMap({
          ...(unstyled ? {} : { attributionControl: false }),
          container,
          center,
          style,
          zoom,
        })
        map.once('idle', () => {
          void onMapReady?.(map)
        })
        remove = () => map.remove()
        observeResize(() => map.resize())
      }
    } catch (cause) {
      if (!disposed) {
        error =
          cause instanceof Error
            ? cause.message
            : 'The map preview could not be loaded.'
      }
    } finally {
      if (!disposed) loading = false
    }
  })()

  return () => {
    disposed = true
    resizeObserver?.disconnect()
    remove?.()
  }
})
</script>

<div
  class="relative size-full overflow-hidden bg-[#10151a]"
  role="img"
  aria-label={ariaLabel}
>
  <div class="size-full" bind:this={container}></div>
  {#if loading}
    <div class="absolute inset-0 animate-pulse bg-[#10151a]" aria-hidden="true"></div>
  {:else if error}
    <div
      class="absolute inset-0 grid place-items-center bg-[#10151a] px-6 text-center font-body text-body-sm leading-6 text-white/70"
    >
      <span>{libraryName(renderer)} preview unavailable: {error}</span>
    </div>
  {/if}
</div>
