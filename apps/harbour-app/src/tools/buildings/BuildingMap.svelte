<script lang="ts">
import { onMount } from 'svelte'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { BASEMAP_ATTRIBUTION, createMapStyleFragment } from '@repo/basemap'
import type { FeatureCollection } from 'geojson'
import type { Inventory, Selection } from './types'
let {
  landsd,
  overture,
  highlight,
  showLandsd,
  showOverture,
  opacity,
  onSelect,
  onCenter,
  onError,
}: {
  landsd: FeatureCollection
  overture: FeatureCollection
  highlight: FeatureCollection
  showLandsd: boolean
  showOverture: boolean
  opacity: number
  onSelect: (selection: Selection) => void
  onCenter: (lng: number, lat: number) => void
  onError: (message: string) => void
} = $props()
let container: HTMLElement
let map = $state<maplibregl.Map>()
let ready = $state(false)
let lastFocus = ''
$effect(() => {
  if (!ready || !map) return
  for (const [id, data, visible] of [
    ['landsd', landsd, showLandsd],
    ['overture', overture, showOverture],
  ] as const) {
    ;(map.getSource(id) as maplibregl.GeoJSONSource).setData(data)
    map.setLayoutProperty(`${id}-fill`, 'visibility', visible ? 'visible' : 'none')
    map.setLayoutProperty(`${id}-line`, 'visibility', visible ? 'visible' : 'none')
    map.setPaintProperty(`${id}-fill`, 'fill-opacity', opacity)
  }
})
$effect(() => {
  if (!ready || !map) return
  ;(map.getSource('selected') as maplibregl.GeoJSONSource).setData(highlight)
  const key = highlight.features.map(feature => String(feature.id)).join('|')
  if (key && key !== lastFocus) {
    lastFocus = key
    const bounds = new maplibregl.LngLatBounds()
    const walk = (value: unknown): void => {
      if (!Array.isArray(value)) return
      if (typeof value[0] === 'number' && typeof value[1] === 'number')
        bounds.extend([value[0], value[1]])
      else value.forEach(walk)
    }
    for (const feature of highlight.features)
      if ('coordinates' in feature.geometry) walk(feature.geometry.coordinates)
    if (!bounds.isEmpty())
      map.fitBounds(bounds, { padding: 100, maxZoom: 18, duration: 450 })
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
    center: [114.1704, 22.3071],
    zoom: 16,
    maxZoom: 21,
  })
  map = target
  target.addControl(new maplibregl.NavigationControl(), 'bottom-right')
  target.on('error', event => onError(`Map resource: ${event.error.message}`))
  target.on('moveend', () => {
    const c = target.getCenter()
    onCenter(c.lng, c.lat)
  })
  target.once('load', () => {
    for (const [id, color, attribution] of [
      ['landsd', '#22d3ee', 'Lands Department · CSDI'],
      [
        'overture',
        '#fb923c',
        'Overture Maps · OpenStreetMap contributors · Qian Shi et al.',
      ],
    ] as const) {
      target.addSource(id, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        attribution,
      })
      target.addLayer({
        id: `${id}-fill`,
        source: id,
        type: 'fill',
        paint: { 'fill-color': color, 'fill-opacity': opacity },
      })
      target.addLayer({
        id: `${id}-line`,
        source: id,
        type: 'line',
        paint: {
          'line-color': color,
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            4,
            1.5,
          ],
        },
      })
      let previous: string | number | undefined
      target.on('mousemove', `${id}-fill`, event => {
        target.getCanvas().style.cursor = 'pointer'
        if (previous !== undefined)
          target.setFeatureState({ source: id, id: previous }, { hover: false })
        previous = event.features?.[0]?.id
        if (previous !== undefined)
          target.setFeatureState({ source: id, id: previous }, { hover: true })
      })
      target.on('mouseleave', `${id}-fill`, () => {
        target.getCanvas().style.cursor = ''
        if (previous !== undefined)
          target.setFeatureState({ source: id, id: previous }, { hover: false })
      })
    }
    target.on('click', event => {
      const hits = target.queryRenderedFeatures(event.point, {
        layers: ['landsd-fill', 'overture-fill'],
      })
      const hit = hits.find(f => f.source === 'landsd') ?? hits[0]
      if (hit)
        onSelect({ inventory: hit.source as Inventory, id: String(hit.properties.id) })
    })
    target.addSource('selected', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    target.addLayer({
      id: 'selected-line',
      source: 'selected',
      type: 'line',
      paint: {
        'line-color': ['match', ['get', 'inventory'], 'landsd', '#67e8f9', '#fdba74'],
        'line-width': 5,
      },
    })
    ready = true
  })
  return () => target.remove()
})
</script>
<div class="absolute inset-0">
  <section
    bind:this={container}
    class="h-full w-full"
    aria-label="LandsD and Overture footprint comparison map"
  ></section>
</div>
