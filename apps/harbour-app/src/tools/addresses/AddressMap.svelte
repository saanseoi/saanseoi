<script lang="ts">
import { onMount } from 'svelte'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { BASEMAP_ATTRIBUTION, createMapStyleFragment } from '@repo/basemap'
import type { FeatureCollection, Point } from 'geojson'

let {
  showHousing,
  onStatus,
  onError,
}: {
  showHousing: boolean
  onStatus: (value: string) => void
  onError: (value: string) => void
} = $props()
let container: HTMLElement
let map = $state<maplibregl.Map>()
let ready = $state(false)
let housingLoaded = false
let housingLoading = false
const controller = new AbortController()

async function load(kind: '2d' | '3d', target: maplibregl.Map) {
  const response = await fetch(`/__addresses?kind=${kind}`, {
    signal: controller.signal,
  })
  const data = (await response.json()) as FeatureCollection<Point> & {
    release: string
    skipped: number
    error?: string
  }
  if (!response.ok) throw new Error(data.error ?? 'Unable to load ALS points')
  target.addSource(kind, {
    type: 'geojson',
    data,
    maxzoom: 18,
    attribution: 'Address data: HKGov DPO · ALS',
  })
  target.addLayer({
    id: kind,
    source: kind,
    type: 'circle',
    layout: { visibility: kind === '2d' || showHousing ? 'visible' : 'none' },
    paint: {
      'circle-color': kind === '2d' ? '#67e8f9' : '#fbbf24',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 14, 4, 18, 7],
      'circle-opacity': 0.8,
      'circle-stroke-width': ['step', ['zoom'], 0, 14, 1],
      'circle-stroke-color': '#0f172a',
    },
  })
  target.on('mouseenter', kind, () => {
    target.getCanvas().style.cursor = 'pointer'
  })
  target.on('mouseleave', kind, () => {
    target.getCanvas().style.cursor = ''
  })
  target.on('click', kind, event => {
    const feature = event.features?.[0]
    if (feature?.geometry.type !== 'Point') return
    const content = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = `CSU ${feature.properties.csuId || 'unavailable'}`
    content.append(title)
    for (const key of ['english', 'chinese']) {
      const pre = document.createElement('pre')
      pre.textContent = JSON.stringify(JSON.parse(feature.properties[key]), null, 2)
      content.append(pre)
    }
    const note = document.createElement('p')
    note.textContent = `${feature.properties.units ? `${feature.properties.units} units · ` : ''}${feature.properties.file}`
    content.append(note)
    new maplibregl.Popup({ maxWidth: '360px' })
      .setLngLat(event.lngLat)
      .setDOMContent(content)
      .addTo(target)
  })
  return data
}
$effect(() => {
  if (!ready || !map) return
  const target = map
  if (housingLoaded)
    target.setLayoutProperty('3d', 'visibility', showHousing ? 'visible' : 'none')
  else if (showHousing && !housingLoading) {
    housingLoading = true
    onError('Loading public rental housing…')
    load('3d', target)
      .then(data => {
        housingLoaded = true
        onError(
          `${data.features.length.toLocaleString()} public-housing points${data.skipped ? ` · ${data.skipped} invalid geometries omitted` : ''}.`,
        )
      })
      .catch(error => {
        if (!controller.signal.aborted) onError(String(error))
      })
      .finally(() => {
        housingLoading = false
      })
  }
})
onMount(() => {
  maplibregl.setWorkerUrl(workerUrl)
  const target = new maplibregl.Map({
    container,
    style: {
      ...createMapStyleFragment('midnight'),
      sources: {
        basemap: {
          type: 'vector',
          url: 'https://tiles.saanseoi.hk/hongkong-latest.json',
          attribution: BASEMAP_ATTRIBUTION,
        },
      },
    },
    center: [114.12, 22.36],
    zoom: 10,
    maxZoom: 20,
  })
  map = target
  target.addControl(new maplibregl.NavigationControl(), 'bottom-right')
  target.on('error', () =>
    onError(
      'Some map resources failed to load. Check the connection or use review.localhost.',
    ),
  )
  target.once('load', async () => {
    try {
      const data = await load('2d', target)
      onStatus(
        `${data.features.length.toLocaleString()} points · ${`${data.release.slice(0, 4)}-${data.release.slice(4, 6)}-${data.release.slice(6, 8)}`}${data.skipped ? ` · ${data.skipped} invalid geometries omitted` : ''}`,
      )
      ready = true
    } catch (error) {
      if (!controller.signal.aborted)
        onStatus(`Could not load addresses: ${String(error)}`)
    }
  })
  return () => {
    controller.abort()
    target.remove()
  }
})
</script>

<div class="absolute inset-0">
  <section
    bind:this={container}
    class="h-full w-full"
    aria-label="ALS address point map"
  ></section>
</div>
