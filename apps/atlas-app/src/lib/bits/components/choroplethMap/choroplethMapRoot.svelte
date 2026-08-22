<script lang="ts">
import { FillLayer, GeoJSONSource, LineLayer, MapLibre } from 'svelte-maplibre-gl'
import { tick, type ComponentProps } from 'svelte'
import { setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { MultiPolygon, Polygon } from 'geojson'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

setWorkerUrl(maplibreWorkerUrl)

type Geometry = Polygon | MultiPolygon
type MapLibreMap = ComponentProps<typeof MapLibre>['map']

export type ChoroplethFeature = {
  geometry: Geometry
  id: string
  label?: string
}

export type ChoroplethValue = {
  id: string
  value: number
}

type Props = {
  ariaLabel: string
  features: ChoroplethFeature[]
  values: ChoroplethValue[]
  valueLabel?: string
}

let { ariaLabel, features, values, valueLabel = 'records' }: Props = $props()
const saanseoiAccessToken = import.meta.env.VITE_SAANSEOI_API_KEY?.trim()

// SaanSeoi publishes a TileJSON manifest, so it must be mounted as a vector source
// inside a Style Specification rather than passed to MapLibre as a style URL.
const SAANSEOI_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'hongkong-latest': {
      type: 'vector',
      url: `https://tiles.saanseoi.hk/hongkong-latest.json${
        saanseoiAccessToken
          ? `?access_token=${encodeURIComponent(saanseoiAccessToken)}`
          : ''
      }`,
    },
  },
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
  layers: layers(
    'hongkong-latest',
    namedFlavor('dark'),
  ) as StyleSpecification['layers'],
}

let valueById = $derived(new Map(values.map(value => [value.id, value])))
let maxValue = $derived(Math.max(1, ...values.map(value => value.value)))
let sourceData = $derived({
  type: 'FeatureCollection' as const,
  features: features.map(feature => ({
    type: 'Feature' as const,
    id: feature.id,
    geometry: feature.geometry,
    properties: {
      label: feature.label ?? feature.id,
      value: valueById.get(feature.id)?.value ?? 0,
    },
  })),
})
let fillColor = $derived([
  'interpolate',
  ['linear'],
  ['get', 'value'],
  0,
  '#d8eee8',
  maxValue,
  '#008f7a',
] as unknown as ExpressionSpecification)
let activeFeature = $state<{ label: string; value: number } | null>(null)
let map = $state<MapLibreMap>()
const hongKongBounds: [[number, number], [number, number]] = [
  [113.83, 22.15],
  [114.45, 22.58],
]

$effect(() => {
  sourceData
  if (!map) return

  let frame: number | undefined
  void tick().then(() => {
    frame = requestAnimationFrame(() => {
      map?.resize()
      map?.fitBounds(hongKongBounds, { duration: 0, padding: 0 })
      if (map) map.setMinZoom(map.getZoom())
    })
  })

  return () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
  }
})

const formatValue = (value: number) => new Intl.NumberFormat().format(value)

function updateActiveFeature(event: {
  features?: Array<{ properties?: Record<string, unknown> }>
}) {
  const properties = event.features?.[0]?.properties
  if (!properties) return
  activeFeature = {
    label: String(properties.label ?? ''),
    value: Number(properties.value ?? 0),
  }
}
</script>

<div class="overflow-hidden bg-data-surface-container-lowest">
  <div
    class="relative h-auto aspect-3/2 lg:h-152 lg:aspect-auto"
    role="img"
    aria-label={ariaLabel}
  >
    <MapLibre
      class="size-full"
      bind:map
      style={SAANSEOI_BASEMAP_STYLE}
      bounds={hongKongBounds}
      fitBoundsOptions={{ padding: 0 }}
      minZoom={8}
      maxZoom={13}
      attributionControl={false}
      autoloadGlobalCss={false}
    >
      <GeoJSONSource id="choropleth-districts" data={sourceData}>
        <FillLayer
          id="choropleth-district-fill"
          paint={{
            'fill-color': fillColor,
            'fill-opacity': 0.72,
          }}
          onmousemove={updateActiveFeature}
          onmouseleave={() => (activeFeature = null)}
        />
        <LineLayer
          id="choropleth-district-outline"
          paint={{
            'line-color': '#0f2624',
            'line-opacity': 0.72,
            'line-width': 1.25,
          }}
        />
      </GeoJSONSource>
    </MapLibre>

    {#if activeFeature}
      <div
        class="pointer-events-none absolute bottom-3 left-3 rounded-default border border-data-outline-variant/70 bg-data-surface-container-lowest/95 px-3 py-2 shadow-popover"
      >
        <p class="font-body text-label-sm font-semibold text-primary">
          {activeFeature.label}
        </p>
        <p
          class="mt-0.5 font-mono text-label-sm font-bold tabular-nums text-data-primary"
        >
          {formatValue(activeFeature.value)} {valueLabel}
        </p>
      </div>
    {/if}
  </div>
  <div
    class="flex items-center justify-between gap-3 border-t border-data-outline-variant/60 px-4 py-3"
  >
    <p class="font-body text-label-sm text-foreground-alt">{valueLabel}</p>
    <div
      class="flex items-center gap-2 font-mono text-label-sm tabular-nums text-foreground-alt"
      role="img"
      aria-label={`Scale from 0 to ${formatValue(maxValue)} ${valueLabel}`}
    >
      <span>0</span>
      <span class="h-2 w-24 bg-linear-to-r from-[#d8eee8] to-[#008f7a]"></span>
      <span>{formatValue(maxValue)}</span>
    </div>
  </div>
</div>
