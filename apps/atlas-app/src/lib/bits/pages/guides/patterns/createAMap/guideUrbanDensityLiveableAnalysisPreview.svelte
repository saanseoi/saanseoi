<script lang="ts">
import { bbox, bboxPolygon, featureCollection } from '@turf/turf'
import { onMount } from 'svelte'
import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
  StyleSpecification,
} from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'
import {
  districtNameByCode,
  urbanDensityCensusDistricts,
} from './urbanDensityCensusDistricts.ts'

type Props = { label: string; styleUrl: string; tilejsonUrl: string }
let { label, styleUrl, tilejsonUrl }: Props = $props()

const analysisZoom = 14
type ProcessingTile = { x: number; y: number }
type PreviewPhase = 'tiles' | 'district' | 'complete'
let phase = $state<PreviewPhase>('tiles')
let districtIndex = $state(0)
let completedTiles = $state(0)
let completedDistricts = $state(0)
let completedDistrictParts = $state(0)
let previewMap = $state<MapLibreMap>()
let completeTicks = 0

const emptyCollection = { type: 'FeatureCollection' as const, features: [] }
const totalDistricts = urbanDensityCensusDistricts.features.length
const activeDistrict = $derived(urbanDensityCensusDistricts.features[districtIndex])
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
const tileBounds = ({ x, y }: ProcessingTile) =>
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
  }))
}
const activeTiles = $derived(activeDistrict ? tilesCovering(activeDistrict) : [])
const totalTiles = $derived(activeTiles.length)
const tileKey = (tile: ProcessingTile) => `${tile.x}/${tile.y}`

const processingTileSources: StyleSpecification['sources'] = {
  'analysis-tiles': { type: 'geojson', data: emptyCollection },
  'processing-tile': { type: 'geojson', data: emptyCollection },
  'processing-district': { type: 'geojson', data: emptyCollection },
  'completed-exclusions': { type: 'geojson', data: emptyCollection },
}
const processingTileLayers: LayerSpecification[] = [
  {
    id: 'analysis-tiles',
    type: 'fill',
    source: 'analysis-tiles',
    paint: {
      'fill-color': [
        'match',
        ['feature-state', 'status'],
        'active',
        '#f4a261',
        'complete',
        '#43c6ad',
        '#ffffff',
      ],
      'fill-opacity': [
        'match',
        ['feature-state', 'status'],
        'active',
        0.34,
        'complete',
        0.14,
        0.025,
      ],
    },
  },
  {
    id: 'analysis-tiles-outline',
    type: 'line',
    source: 'analysis-tiles',
    paint: {
      'line-color': [
        'match',
        ['feature-state', 'status'],
        'active',
        '#f4a261',
        'complete',
        '#43c6ad',
        '#ffffff',
      ],
      'line-opacity': [
        'match',
        ['feature-state', 'status'],
        'active',
        1,
        'complete',
        0.45,
        0.12,
      ],
      'line-width': ['match', ['feature-state', 'status'], 'active', 2, 1],
    },
  },
  {
    id: 'completed-exclusions',
    type: 'fill',
    source: 'completed-exclusions',
    paint: {
      'fill-color': [
        'match',
        ['get', 'area'],
        'Hong Kong Island',
        '#5b8ff9',
        'Kowloon',
        '#f6bd16',
        'New Territories',
        '#5ad8a6',
        '#e76f51',
      ],
      'fill-opacity': 0.72,
    },
  },
  {
    id: 'completed-exclusions-outline',
    type: 'line',
    source: 'completed-exclusions',
    paint: {
      'line-color': [
        'match',
        ['get', 'area'],
        'Hong Kong Island',
        '#5b8ff9',
        'Kowloon',
        '#f6bd16',
        'New Territories',
        '#5ad8a6',
        '#e76f51',
      ],
      'line-width': 2,
    },
  },
  {
    id: 'processing-tile',
    type: 'line',
    source: 'processing-tile',
    paint: { 'line-color': '#f4a261', 'line-width': 3 },
  },
  {
    id: 'processing-district',
    type: 'line',
    source: 'processing-district',
    paint: { 'line-color': '#79e7d1', 'line-width': 4, 'line-dasharray': [2, 1] },
  },
]

const source = (id: string) => previewMap?.getSource(id) as GeoJSONSource | undefined
const showTile = (tile?: ProcessingTile) => {
  source('processing-tile')?.setData(
    tile ? bboxPolygon(tileBounds(tile)) : emptyCollection,
  )
}
const setTileStatus = (tile: ProcessingTile, status: 'active' | 'complete') => {
  previewMap?.setFeatureState(
    { source: 'analysis-tiles', id: tileKey(tile) },
    { status },
  )
}
const showCompletedDistricts = () => {
  source('completed-exclusions')?.setData(
    featureCollection(
      urbanDensityCensusDistricts.features.slice(0, completedDistricts),
    ),
  )
}
const startDistrict = () => {
  if (!previewMap || !activeDistrict) return
  phase = 'tiles'
  completedTiles = 0
  completedDistrictParts = 0
  completeTicks = 0
  previewMap.removeFeatureState({ source: 'analysis-tiles' })
  source('analysis-tiles')?.setData(
    featureCollection(
      activeTiles.map(tile => ({
        ...bboxPolygon(tileBounds(tile)),
        id: tileKey(tile),
        properties: { tileKey: tileKey(tile) },
      })),
    ),
  )
  source('processing-district')?.setData(emptyCollection)
  showTile(activeTiles[0])
  if (activeTiles[0]) setTileStatus(activeTiles[0], 'active')
  const [west, south, east, north] = bbox(activeDistrict)
  previewMap.fitBounds([west, south, east, north], {
    padding: 48,
    duration: 300,
    maxZoom: 12,
  })
}

onMount(() => {
  const timer = window.setInterval(() => {
    if (!previewMap || !activeDistrict) return
    if (phase === 'complete') {
      completeTicks += 1
      if (completeTicks < 4) return
      if (districtIndex + 1 === totalDistricts) completedDistricts = 0
      districtIndex = (districtIndex + 1) % totalDistricts
      showCompletedDistricts()
      startDistrict()
      return
    }
    if (phase === 'district') {
      const step = Math.max(1, Math.ceil(totalTiles / 6))
      completedDistrictParts = Math.min(totalTiles, completedDistrictParts + step)
      if (completedDistrictParts < totalTiles) return
      completedDistricts = districtIndex + 1
      showCompletedDistricts()
      phase = 'complete'
      return
    }
    const tile = activeTiles[completedTiles]
    if (tile) setTileStatus(tile, 'complete')
    completedTiles = Math.min(totalTiles, completedTiles + 1)
    const nextTile = activeTiles[completedTiles]
    if (nextTile) {
      setTileStatus(nextTile, 'active')
      showTile(nextTile)
      return
    }
    showTile()
    source('processing-district')?.setData(activeDistrict)
    phase = 'district'
  }, 60)
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
        showCompletedDistricts()
        startDistrict()
      }}
      renderer="maplibre"
      {styleUrl}
      {tilejsonUrl}
      zoom={10.75}
    />
  {/key}
  <section
    class="absolute bottom-4 left-1/2 w-[min(calc(100%-2rem),32rem)] -translate-x-1/2 border border-white/20 bg-[#10151a]/95 px-5 py-4 text-center font-body text-white shadow-lg backdrop-blur-sm"
    aria-live="polite"
  >
    <p class="font-mono text-[0.68rem] font-bold tracking-[0.12em] text-white/70">
      {phase === 'tiles' ? '[DOWNLOAD, SNAP & MERGE TILE]' : phase === 'district' ? '[INTERSECT & DISSOLVE DISTRICT]' : '[DISTRICT COMPLETE]'}
    </p>
    {#if activeDistrict}
      <h2
        class="mt-1.5 font-mono text-3xl font-bold leading-none tracking-tight text-[#79e7d1]"
      >
        {districtNameByCode[activeDistrict.properties.divisionCode] ?? activeDistrict.properties.divisionCode}
      </h2>
    {/if}
    <dl
      class="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-x-3 font-mono tabular-nums"
    >
      <div>
        <dt class="text-[0.68rem] font-bold tracking-[0.12em] text-white/55">TILES</dt>
        <dd class="mt-0.5 text-base font-semibold text-white/85">
          {completedTiles}
          / {totalTiles}
        </dd>
      </div>
      <div class="pb-0.5 text-xs font-bold text-white/45" aria-hidden="true">and</div>
      <div>
        <dt class="text-[0.68rem] font-bold tracking-[0.12em] text-white/55">PARTS</dt>
        <dd class="mt-0.5 text-base font-semibold text-white/85">
          {completedDistrictParts}
          / {phase === 'tiles' ? '–' : totalTiles}
        </dd>
      </div>
      <div class="pb-0.5 text-xs font-bold text-white/45" aria-hidden="true">for</div>
      <div>
        <dt class="text-[0.68rem] font-bold tracking-[0.12em] text-white/55">
          DISTRICTS
        </dt>
        <dd class="mt-0.5 text-base font-semibold text-white/85">
          {completedDistricts}
          / {totalDistricts}
        </dd>
      </div>
    </dl>
    <progress
      class="mt-4 h-2 w-full accent-[#43c6ad]"
      max={totalTiles}
      value={phase === 'tiles' ? completedTiles : completedDistrictParts}
    ></progress>
  </section>
</div>
