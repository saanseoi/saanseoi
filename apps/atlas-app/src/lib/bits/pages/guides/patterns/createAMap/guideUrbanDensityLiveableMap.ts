import type { Feature, FeatureCollection } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'

import type {
  DistrictLand,
  DistrictLandProperties,
  DistrictGeometry,
} from './urbanDensityCensusDistricts.ts'
import { urbanDensityCensusDistricts } from './urbanDensityCensusDistricts.ts'

export const landAnalysisPath = '/guides/create-a-map/land-analysis.json'

type DownloadedDistrictLandProperties = {
  area: string
  districtCode: string
}

type DownloadedDistrictLand = FeatureCollection<
  DistrictGeometry,
  DownloadedDistrictLandProperties
>

type LandAnalysis = {
  liveableDistrictLand: DownloadedDistrictLand
  excludedDistrictLand?: DownloadedDistrictLand
}

let cachedDistrictLand: Promise<DistrictLand> | undefined

function isDistrictLand(value: unknown): value is DownloadedDistrictLand {
  if (!value || typeof value !== 'object') return false
  const collection = value as Partial<DownloadedDistrictLand>
  return collection.type === 'FeatureCollection' && Array.isArray(collection.features)
}

function normaliseDistrictLand(
  collection: DownloadedDistrictLand,
): Array<Feature<DistrictGeometry, DistrictLandProperties>> {
  return collection.features.map(feature => {
    const { area, districtCode } = feature.properties
    if (typeof area !== 'string' || typeof districtCode !== 'string') {
      throw new Error('Land-analysis feature is missing its District identity.')
    }
    return {
      ...feature,
      properties: { area, divisionCode: districtCode },
    }
  })
}

export function decodeLandAnalysis(value: unknown): DistrictLand {
  if (!value || typeof value !== 'object') {
    throw new Error('Land-analysis JSON is not an object.')
  }

  const analysis = value as Partial<LandAnalysis>
  if (!isDistrictLand(analysis.liveableDistrictLand)) {
    throw new Error('Land-analysis JSON is missing liveable District land.')
  }

  return {
    liveableDistrictLand: normaliseDistrictLand(analysis.liveableDistrictLand),
    // Newer results only persist liveable geometry. Rendering the District below
    // it shows the complement without re-running costly polygon differences.
    excludedDistrictLand: isDistrictLand(analysis.excludedDistrictLand)
      ? normaliseDistrictLand(analysis.excludedDistrictLand)
      : urbanDensityCensusDistricts.features.map(({ geometry, properties }) => ({
          type: 'Feature',
          geometry,
          properties: {
            area: properties.area,
            divisionCode: properties.divisionCode,
          },
        })),
  }
}

export const loadCachedDistrictLand = () => {
  if (cachedDistrictLand) return cachedDistrictLand

  cachedDistrictLand = fetch(landAnalysisPath, { cache: 'no-cache' })
    .then(async response => {
      if (!response.ok) {
        throw new Error(`Land-analysis download failed: ${response.status}`)
      }
      return decodeLandAnalysis(await response.json())
    })
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
