<script lang="ts">
import { bbox, bboxPolygon, booleanIntersects, flatten } from '@turf/turf'
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
  type DistrictLand,
  urbanDensityCensusDistricts,
} from './urbanDensityCensusDistricts.ts'
import { loadCachedDistrictLand } from './guideUrbanDensityLiveableMap.ts'

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

type PreviewPhase = 'tiles' | 'districts'

let phase = $state<PreviewPhase>('tiles')
let completedTiles = $state(0)
let completedDistricts = $state(0)
let completedDistrictParts = $state(0)
let previewMap = $state<MapLibreMap>()
let excludedDistrictLand = $state.raw<DistrictLand['excludedDistrictLand']>([])
let completedExcludedDistrictLand = $state.raw<DistrictLand['excludedDistrictLand']>([])
let excludedByDistrictCode = new Map<
  string,
  DistrictLand['excludedDistrictLand'][number]
>()

const emptyTileCollection = { type: 'FeatureCollection' as const, features: [] }
const processingTileSources: StyleSpecification['sources'] = {
  'processing-tile': { type: 'geojson', data: emptyTileCollection },
  'raw-exclusions': { type: 'geojson', data: emptyTileCollection },
  'completed-exclusions': { type: 'geojson', data: emptyTileCollection },
}
const processingTileLayers: LayerSpecification[] = [
  {
    id: 'raw-exclusions',
    type: 'fill',
    source: 'raw-exclusions',
    paint: { 'fill-color': '#e76f51', 'fill-opacity': 0.72 },
  },
  {
    id: 'raw-exclusions-outline',
    type: 'line',
    source: 'raw-exclusions',
    paint: { 'line-color': '#8c3427', 'line-width': 1 },
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
const totalDistricts = urbanDensityCensusDistricts.features.length
const activeTile = $derived(processingTiles[Math.min(completedTiles, totalTiles - 1)])
const districtByCode = new Map(
  urbanDensityCensusDistricts.features.map(district => [
    district.properties.divisionCode,
    district,
  ]),
)
const activeDistrict = $derived(
  phase === 'districts'
    ? urbanDensityCensusDistricts.features[
        Math.min(Math.max(completedDistricts - 1, 0), totalDistricts - 1)
      ]
    : activeTile
      ? districtByCode.get(activeTile.districtCode)
      : undefined,
)
const activeDistrictPartTotal = $derived(
  activeDistrict ? flatten(activeDistrict).features.length : 0,
)
const progressCompleted = $derived(
  phase === 'tiles' ? completedTiles : completedDistricts,
)
const progressTotal = $derived(phase === 'tiles' ? totalTiles : totalDistricts)
const progressPhase = $derived(
  phase === 'tiles'
    ? '[DOWNLOAD TILES & EXTRACT FEATURES]'
    : '[CALCULATE DISTRICT INTERSECTION]',
)
let focusedDistrictCode = $state<string>()
const updateExclusionSources = () => {
  const rawSource = previewMap?.getSource('raw-exclusions') as GeoJSONSource | undefined
  const completedSource = previewMap?.getSource('completed-exclusions') as
    | GeoJSONSource
    | undefined
  rawSource?.setData({ type: 'FeatureCollection', features: excludedDistrictLand })
  completedSource?.setData({
    type: 'FeatureCollection',
    features: completedExcludedDistrictLand,
  })
}
const focusDistrict = (
  district: (typeof urbanDensityCensusDistricts.features)[number] | undefined,
) => {
  if (!district || focusedDistrictCode === district.properties.divisionCode) return

  focusedDistrictCode = district.properties.divisionCode
  const [west, south, east, north] = bbox(district)
  previewMap?.fitBounds([west, south, east, north], {
    padding: 48,
    duration: 300,
    maxZoom: 12,
  })
}
const showTileOutline = (tile?: ProcessingTile) => {
  const source = previewMap?.getSource('processing-tile') as GeoJSONSource | undefined
  source?.setData(
    tile === undefined ? emptyTileCollection : bboxPolygon(tileBounds(tile)),
  )
  if (tile) focusDistrict(districtByCode.get(tile.districtCode))
}
onMount(() => {
  let cancelled = false
  let tileTimer: number | undefined
  let districtTimer: number | undefined

  const completeDistrict = () => {
    const district = urbanDensityCensusDistricts.features[completedDistricts - 1]
    if (!district) return

    const excluded = excludedByDistrictCode.get(district.properties.divisionCode)
    if (!excluded) return

    completedExcludedDistrictLand = [...completedExcludedDistrictLand, excluded]
    updateExclusionSources()
  }

  const startDistrict = () => {
    completedDistricts = Math.min(totalDistricts, completedDistricts + 1)
    completedDistrictParts = 0
    const district = urbanDensityCensusDistricts.features[completedDistricts - 1]
    if (district) focusDistrict(district)
  }

  const advanceDistrictPart = () => {
    const partStep = Math.max(1, Math.ceil(activeDistrictPartTotal / 6))
    completedDistrictParts = Math.min(
      activeDistrictPartTotal,
      completedDistrictParts + partStep,
    )
    if (completedDistrictParts !== activeDistrictPartTotal) return

    completeDistrict()
    if (completedDistricts === totalDistricts) {
      if (districtTimer) window.clearInterval(districtTimer)
    } else {
      startDistrict()
    }
  }

  const startDistrictProgress = () => {
    phase = 'districts'
    showTileOutline()
    startDistrict()
    districtTimer = window.setInterval(advanceDistrictPart, 120)
  }

  void loadCachedDistrictLand().then(land => {
    if (cancelled) return
    excludedDistrictLand = land.excludedDistrictLand
    excludedByDistrictCode = new Map(
      land.excludedDistrictLand.map(feature => [
        feature.properties.divisionCode,
        feature,
      ]),
    )
    updateExclusionSources()
    tileTimer = window.setInterval(() => {
      completedTiles = Math.min(totalTiles, completedTiles + 12)
      showTileOutline(processingTiles[completedTiles])
      if (completedTiles === totalTiles && tileTimer) {
        window.clearInterval(tileTimer)
        startDistrictProgress()
      }
    }, 160)
  })

  return () => {
    cancelled = true
    if (tileTimer) window.clearInterval(tileTimer)
    if (districtTimer) window.clearInterval(districtTimer)
  }
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
        updateExclusionSources()
        showTileOutline(activeTile)
      }}
      renderer="maplibre"
      {styleUrl}
      {tilejsonUrl}
      zoom={10.75}
    />
  {/key}
  <section
    class="absolute bottom-4 left-1/2 w-[min(calc(100%-2rem),24rem)] -translate-x-1/2 border border-white/20 bg-[#10151a]/95 px-5 py-4 text-center font-body text-white shadow-lg backdrop-blur-sm"
    aria-live="polite"
  >
    <p class="font-mono text-[0.68rem] font-bold tracking-[0.12em] text-white/70">
      {progressPhase}
    </p>
    {#if activeDistrict}
      <h2
        class="mt-1.5 font-mono text-3xl font-bold leading-none tracking-tight text-[#79e7d1]"
      >
        {districtNameByCode[activeDistrict.properties.divisionCode] ?? activeDistrict.properties.divisionCode}
      </h2>
    {/if}
    {#if phase === 'districts'}
      <dl
        class="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-x-3 font-mono tabular-nums"
      >
        <div>
          <dt class="text-[0.68rem] font-bold tracking-[0.12em] text-white/55">
            PARTS
          </dt>
          <dd class="mt-0.5 text-base font-semibold text-white/85">
            {completedDistrictParts}
            / {activeDistrictPartTotal}
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
    {:else}
      <p class="mt-3 font-mono text-base font-semibold tabular-nums text-white/85">
        {progressCompleted}
        / {progressTotal}
      </p>
    {/if}
    <progress
      class="mt-4 h-2 w-full accent-[#43c6ad]"
      max={progressTotal}
      value={progressCompleted}
    ></progress>
  </section>
</div>
