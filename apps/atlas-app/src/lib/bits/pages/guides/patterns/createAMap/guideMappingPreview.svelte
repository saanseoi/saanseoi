<script lang="ts">
import { onMount } from 'svelte'
import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
import type { StyleSpecification as MapboxStyleSpecification } from 'mapbox-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'leaflet/dist/leaflet.css'
import 'mapbox-gl/dist/mapbox-gl.css'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(maplibreWorkerUrl)

type Renderer = 'leaflet' | 'mapbox' | 'maplibre'
type Coordinates = [longitude: number, latitude: number]

type Props = {
  ariaLabel: string
  center: Coordinates
  renderer: Renderer
  styleUrl?: string
  tilejsonUrl?: string
  unstyled?: boolean
  zoom: number
}

let {
  ariaLabel,
  center,
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

const loadStyle = async (signal: AbortSignal): Promise<StyleSpecification> => {
  if (unstyled) {
    return {
      version: 8,
      sources: {},
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

  const response = await fetch(styleUrl, { signal })
  if (!response.ok)
    throw new Error(`The map style could not be loaded (${response.status}).`)

  const style = (await response.json()) as StyleSpecification
  style.sources = {
    basemap: {
      type: 'vector',
      url: tilejsonUrl,
    },
  }
  return style
}

onMount(() => {
  let disposed = false
  let remove: (() => void) | undefined
  const controller = new AbortController()

  void (async () => {
    try {
      loading = true
      error = undefined
      const style = await loadStyle(controller.signal)
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
        remove = () => map.remove()
      }
    } catch (cause) {
      if (!disposed && !controller.signal.aborted) {
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
    controller.abort()
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
