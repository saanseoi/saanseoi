<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'
import type { CreateAMapOpeningPosition } from '#lib/guides/createAMapSelections.js'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import type { Map as MapboxMap } from 'mapbox-gl'
import type { Map as LeafletMap } from 'leaflet'

type Props = {
  label: string
  renderer: 'leaflet' | 'mapbox' | 'maplibre'
  sampleDataUrl: string
  styleUrl: string
  tilejsonUrl: string
  openingPosition: CreateAMapOpeningPosition
  popupAppearance: 'dark' | 'light'
}

let {
  label,
  renderer,
  sampleDataUrl,
  styleUrl,
  tilejsonUrl,
  openingPosition,
  popupAppearance,
}: Props = $props()
const popupClassName = $derived(`guide-data-popup guide-data-popup--${popupAppearance}`)
const additionalSources = $derived({
  places: {
    type: 'geojson' as const,
    data: sampleDataUrl,
  },
} satisfies StyleSpecification['sources'])

const showPlaceName = (map: MapLibreMap) => {
  map.on('click', 'places', async event => {
    const name = event.features?.[0]?.properties?.name
    if (!name) return
    const lngLat: [number, number] = [event.lngLat.lng, event.lngLat.lat]

    if (renderer === 'mapbox') {
      const { Popup } = await import('mapbox-gl')
      new Popup({ className: popupClassName })
        .setLngLat(lngLat)
        .setText(String(name))
        .addTo(map as unknown as MapboxMap)
      return
    }

    const { Popup } = await import('maplibre-gl')
    new Popup({ className: popupClassName })
      .setLngLat(lngLat)
      .setText(String(name))
      .addTo(map)
  })
  map.on('mouseenter', 'places', () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', 'places', () => {
    map.getCanvas().style.cursor = ''
  })
}

const showLeafletPlaceName = async (map: LeafletMap) => {
  const [L, places] = await Promise.all([
    import('leaflet'),
    fetch(sampleDataUrl).then(response => response.json()),
  ])

  L.geoJSON(places as GeoJSON.GeoJsonObject, {
    pointToLayer: (_, latlng) =>
      L.circleMarker(latlng, {
        color: '#0f766e',
        fillColor: '#2dd4bf',
        fillOpacity: 0.9,
        radius: 7,
      }),
    onEachFeature: (feature, layer) =>
      layer.bindPopup(feature.properties?.name ?? 'Place', {
        className: popupClassName,
      }),
  }).addTo(map)
}

const additionalLayers = [
  {
    id: 'places',
    type: 'circle' as const,
    source: 'places',
    paint: {
      'circle-radius': 7,
      'circle-color': '#2dd4bf',
      'circle-stroke-color': '#0f766e',
      'circle-stroke-width': 2,
    },
  },
]
</script>

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
  {#key `${renderer}:${styleUrl}:${tilejsonUrl}:${sampleDataUrl}:${openingPosition.center.join(',')}:${openingPosition.zoom}`}
    <GuideMappingPreview
      ariaLabel={label}
      additionalLayers={renderer === 'leaflet' ? [] : additionalLayers}
      additionalSources={renderer === 'leaflet' ? {} : additionalSources}
      center={openingPosition.center}
      {renderer}
      {styleUrl}
      {tilejsonUrl}
      onLeafletMapReady={renderer === 'leaflet' ? showLeafletPlaceName : undefined}
      onMapReady={renderer === 'leaflet' ? undefined : showPlaceName}
      zoom={openingPosition.zoom}
    />
  {/key}
  <div
    class="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-sm border border-white/20 bg-[#10151a]/90 px-3 py-2 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
  >
    <span>{m.guide_data_import_preview_instruction()}</span>
    <span class="truncate text-right text-white/60">
      {label}
    </span>
  </div>
</div>

<style>
:global(.guide-data-popup--light) {
  --guide-data-popup-background: #f0fdfa;
  --guide-data-popup-text: #0f766e;
}

:global(.guide-data-popup--dark) {
  --guide-data-popup-background: #071a1d;
  --guide-data-popup-text: #5eead4;
}

:global(.guide-data-popup .maplibregl-popup-content),
:global(.guide-data-popup .mapboxgl-popup-content),
:global(.guide-data-popup .leaflet-popup-content-wrapper) {
  background: var(--guide-data-popup-background);
  border: 1px solid #0f766e;
  border-radius: 0.25rem;
  box-shadow: 0 0.5rem 1.5rem rgb(2 44 34 / 0.28);
  color: var(--guide-data-popup-text);
  font-family: var(--font-body, sans-serif);
  font-weight: 600;
}

:global(.guide-data-popup .maplibregl-popup-content),
:global(.guide-data-popup .mapboxgl-popup-content) {
  padding: 0.65rem 0.8rem;
}

:global(.guide-data-popup .leaflet-popup-content) {
  margin: 0.65rem 0.8rem;
}

:global(.guide-data-popup .maplibregl-popup-close-button),
:global(.guide-data-popup .mapboxgl-popup-close-button),
:global(.guide-data-popup .leaflet-popup-close-button) {
  color: var(--guide-data-popup-text);
  font-size: 1.1rem;
  line-height: 1.1;
  padding: 0.2rem 0.35rem;
}

:global(.guide-data-popup .leaflet-popup-tip) {
  background: var(--guide-data-popup-background);
}

:global(.guide-data-popup .maplibregl-popup-anchor-top .maplibregl-popup-tip),
:global(.guide-data-popup .maplibregl-popup-anchor-top-left .maplibregl-popup-tip),
:global(.guide-data-popup .maplibregl-popup-anchor-top-right .maplibregl-popup-tip),
:global(.guide-data-popup .mapboxgl-popup-anchor-top .mapboxgl-popup-tip),
:global(.guide-data-popup .mapboxgl-popup-anchor-top-left .mapboxgl-popup-tip),
:global(.guide-data-popup .mapboxgl-popup-anchor-top-right .mapboxgl-popup-tip) {
  border-bottom-color: var(--guide-data-popup-background);
}

:global(.guide-data-popup .maplibregl-popup-anchor-bottom .maplibregl-popup-tip),
:global(.guide-data-popup .maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip),
:global(.guide-data-popup .maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip),
:global(.guide-data-popup .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip),
:global(.guide-data-popup .mapboxgl-popup-anchor-bottom-left .mapboxgl-popup-tip),
:global(.guide-data-popup .mapboxgl-popup-anchor-bottom-right .mapboxgl-popup-tip) {
  border-top-color: var(--guide-data-popup-background);
}

:global(.guide-data-popup .maplibregl-popup-anchor-left .maplibregl-popup-tip),
:global(.guide-data-popup .mapboxgl-popup-anchor-left .mapboxgl-popup-tip) {
  border-right-color: var(--guide-data-popup-background);
}

:global(.guide-data-popup .maplibregl-popup-anchor-right .maplibregl-popup-tip),
:global(.guide-data-popup .mapboxgl-popup-anchor-right .mapboxgl-popup-tip) {
  border-left-color: var(--guide-data-popup-background);
}
</style>
