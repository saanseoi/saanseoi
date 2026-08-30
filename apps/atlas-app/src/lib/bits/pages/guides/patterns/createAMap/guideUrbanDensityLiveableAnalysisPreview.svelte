<script lang="ts">
import { bbox, bboxPolygon, booleanIntersects } from '@turf/turf'
import { onMount } from 'svelte'
import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
  StyleSpecification,
} from 'maplibre-gl'

import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'
import { urbanDensityCensusDistricts } from './urbanDensityCensusDistricts.ts'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()

const analysisZoom = 14

type ProcessingTile = {
  x: number
  y: number
  districtCode: string
}

let completed = $state(0)
let previewMap = $state<MapLibreMap>()

const emptyTileCollection = { type: 'FeatureCollection' as const, features: [] }
const processingTileSources: StyleSpecification['sources'] = {
  'processing-tile': { type: 'geojson', data: emptyTileCollection },
}
const processingTileLayers: LayerSpecification[] = [
  {
    id: 'processing-tile',
    type: 'line',
    source: 'processing-tile',
    paint: { 'line-color': '#f4a261', 'line-width': 3 },
  },
]

const longitudeToTile = (longitude: number) =>
  ((longitude + 180) / 360) * 2 ** analysisZoom
const latitudeToTile = (latitude: number) => {
  const radians = (latitude * Math.PI) / 180
  return ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** analysisZoom
}
const tileToLongitude = (x: number) => (x / 2 ** analysisZoom) * 360 - 180
const tileToLatitude = (y: number) => {
  const radians = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** analysisZoom)))
  return (radians * 180) / Math.PI
}
const tileBounds = ({ x, y }: Pick<ProcessingTile, 'x' | 'y'>) =>
  [
    tileToLongitude(x),
    tileToLatitude(y + 1),
    tileToLongitude(x + 1),
    tileToLatitude(y),
  ] as [number, number, number, number]
const tilesCovering = (
  district: (typeof urbanDensityCensusDistricts.features)[number],
) => {
  const [west, south, east, north] = bbox(district)
  const minX = Math.floor(longitudeToTile(west))
  const maxX = Math.floor(longitudeToTile(east))
  const minY = Math.floor(latitudeToTile(north))
  const maxY = Math.floor(latitudeToTile(south))
  const width = maxX - minX + 1
  return Array.from({ length: width * (maxY - minY + 1) }, (_, index) => ({
    x: minX + (index % width),
    y: minY + Math.floor(index / width),
  })).filter(tile => booleanIntersects(district, bboxPolygon(tileBounds(tile))))
}
const processingTiles = (() => {
  const tilesByKey = new Map<string, ProcessingTile>()
  for (const district of urbanDensityCensusDistricts.features) {
    for (const tile of tilesCovering(district)) {
      const key = `${tile.x}/${tile.y}`
      if (!tilesByKey.has(key)) {
        tilesByKey.set(key, { ...tile, districtCode: district.properties.divisionCode })
      }
    }
  }
  return [...tilesByKey.values()]
})()
const totalTiles = processingTiles.length
const activeTile = $derived(processingTiles[completed])
const showTileOutline = (tile?: ProcessingTile) => {
  const source = previewMap?.getSource('processing-tile') as GeoJSONSource | undefined
  source?.setData(
    tile === undefined ? emptyTileCollection : bboxPolygon(tileBounds(tile)),
  )
}
const progressLabel = $derived(
  completed < totalTiles
    ? m.guide_data_urban_density_liveable_analysis_preview_status({
        completed,
        total: totalTiles,
      })
    : m.guide_data_urban_density_liveable_analysis_preview_ready(),
)

onMount(() => {
  const timer = window.setInterval(() => {
    completed = Math.min(totalTiles, completed + 1)
    showTileOutline(processingTiles[completed])
    if (completed === totalTiles) window.clearInterval(timer)
  }, 90)

  return () => window.clearInterval(timer)
})
</script>

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
  {#key `${styleUrl}:${tilejsonUrl}`}
    <GuideMappingPreview
      ariaLabel={label}
      additionalLayers={processingTileLayers}
      additionalSources={processingTileSources}
      center={[114.16, 22.32]}
      onMapReady={map => {
        previewMap = map
        showTileOutline(activeTile)
      }}
      renderer="maplibre"
      {styleUrl}
      {tilejsonUrl}
      zoom={10.75}
    />
  {/key}
  <section
    class="absolute right-4 bottom-4 left-4 border border-white/20 bg-[#10151a]/95 p-4 font-body text-white shadow-lg backdrop-blur-sm"
    aria-live="polite"
  >
    <p
      class="font-mono text-label-sm font-bold tracking-[0.08em] text-[#79e7d1] uppercase"
    >
      {m.guide_data_urban_density_liveable_analysis_preview_title()}
    </p>
    <p class="mt-1 text-body-sm leading-6 text-white/85">{progressLabel}</p>
    {#if activeTile}
      <p class="mt-1 text-body-sm leading-6 text-white/70">
        {m.guide_data_urban_density_liveable_analysis_preview_district({
          district: activeTile.districtCode,
        })}
      </p>
    {/if}
    <progress
      class="mt-3 h-2 w-full accent-[#43c6ad]"
      max={totalTiles}
      value={completed}
    ></progress>
  </section>
</div>
