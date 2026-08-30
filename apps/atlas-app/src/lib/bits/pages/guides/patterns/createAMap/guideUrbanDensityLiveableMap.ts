import type { Map as MapLibreMap } from 'maplibre-gl'

import type {
  CensusDistrictCollection,
  DistrictLand,
} from './urbanDensityCensusDistricts.ts'

const cachePath = (name: 'excluded' | 'liveable') =>
  `/guides/urban-density-${name}-districts.geojson`

let cachedDistrictLand: Promise<DistrictLand> | undefined

export const loadCachedDistrictLand = () => {
  if (cachedDistrictLand) return cachedDistrictLand

  cachedDistrictLand = Promise.all(
    (['excluded', 'liveable'] as const).map(async name => {
      const response = await fetch(cachePath(name), { cache: 'force-cache' })
      if (!response.ok)
        throw new Error(`Cached ${name} district geometry failed: ${response.status}`)
      return (await response.json()) as CensusDistrictCollection
    }),
  )
    .then(([excluded, liveable]) => ({
      excludedDistrictLand: excluded.features,
      liveableDistrictLand: liveable.features,
    }))
    .catch(cause => {
      cachedDistrictLand = undefined
      throw cause
    })

  return cachedDistrictLand
}

export async function addUrbanDensityLiveableLand(map: MapLibreMap) {
  try {
    const { excludedDistrictLand, liveableDistrictLand } =
      await loadCachedDistrictLand()

    map.addSource('liveable-districts', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: liveableDistrictLand },
    })
    map.addSource('excluded-districts', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: excludedDistrictLand },
    })
    const firstLabelLayerId = map
      .getStyle()
      .layers?.find(layer => layer.type === 'symbol')?.id
    map.addLayer(
      {
        id: 'liveable-districts',
        type: 'fill',
        source: 'liveable-districts',
        paint: {
          'fill-antialias': false,
          'fill-color': '#36a269',
          'fill-opacity': 0.48,
        },
      },
      firstLabelLayerId,
    )
    map.addLayer(
      {
        id: 'excluded-districts',
        type: 'fill',
        source: 'excluded-districts',
        paint: {
          'fill-antialias': false,
          'fill-color': '#e76f51',
          'fill-opacity': 0.62,
        },
      },
      firstLabelLayerId,
    )
    map.addLayer(
      {
        id: 'excluded-districts-outline',
        type: 'line',
        source: 'excluded-districts',
        paint: { 'line-color': '#8c3427', 'line-width': 1 },
      },
      firstLabelLayerId,
    )
  } catch (cause) {
    console.error('Liveable district land could not be calculated.', cause)
  }
}
