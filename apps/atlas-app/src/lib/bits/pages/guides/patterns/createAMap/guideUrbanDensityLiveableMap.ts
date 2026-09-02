import type { FeatureCollection } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'

import type {
  DistrictExclusions,
  DistrictGeometry,
} from './urbanDensityCensusDistricts.ts'
import { urbanDensityCensusDistricts } from './urbanDensityCensusDistricts.ts'

export const landAnalysisPath = '/guides/create-a-map/land-analysis.json.gz'

type DownloadedDistrictExclusionProperties = {
  area: string
  districtCode: string
}

type DownloadedDistrictExclusions = FeatureCollection<
  DistrictGeometry,
  DownloadedDistrictExclusionProperties
>

type LandAnalysis = {
  excludedDistrictLand: DownloadedDistrictExclusions
}

let cachedDistrictExclusions: Promise<DistrictExclusions> | undefined

function isDistrictExclusions(value: unknown): value is DownloadedDistrictExclusions {
  if (!value || typeof value !== 'object') return false
  const collection = value as Partial<DownloadedDistrictExclusions>
  return collection.type === 'FeatureCollection' && Array.isArray(collection.features)
}

function normaliseDistrictExclusions(
  collection: DownloadedDistrictExclusions,
): DistrictExclusions {
  return collection.features.map(feature => {
    const { area, districtCode } = feature.properties
    if (typeof area !== 'string' || typeof districtCode !== 'string') {
      throw new Error('Land-analysis feature is missing its District identity.')
    }
    if (
      feature.geometry.type !== 'Polygon' &&
      feature.geometry.type !== 'MultiPolygon'
    ) {
      throw new Error(`Land-analysis contains non-polygonal ${districtCode} geometry.`)
    }
    return {
      ...feature,
      properties: { area, divisionCode: districtCode },
    }
  })
}

export function decodeLandAnalysis(value: unknown): DistrictExclusions {
  if (!value || typeof value !== 'object') {
    throw new Error('Land-analysis JSON is not an object.')
  }

  const analysis = value as Partial<LandAnalysis>
  if (!isDistrictExclusions(analysis.excludedDistrictLand)) {
    throw new Error('Land-analysis JSON must include excluded District land.')
  }

  return normaliseDistrictExclusions(analysis.excludedDistrictLand)
}

export const loadCachedDistrictExclusions = () => {
  if (cachedDistrictExclusions) return cachedDistrictExclusions

  cachedDistrictExclusions = fetch(landAnalysisPath, { cache: 'no-cache' })
    .then(async response => {
      if (!response.ok) {
        throw new Error(`Land-analysis download failed: ${response.status}`)
      }
      if (!response.body) {
        throw new Error('Land-analysis download has no response body.')
      }
      const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'))
      return decodeLandAnalysis(await new Response(decompressed).json())
    })
    .catch(cause => {
      cachedDistrictExclusions = undefined
      throw cause
    })

  return cachedDistrictExclusions
}

export async function addUrbanDensityLiveableLand(map: MapLibreMap) {
  try {
    const excludedDistrictLand = await loadCachedDistrictExclusions()

    map.addSource('liveable-districts', {
      type: 'geojson',
      data: urbanDensityCensusDistricts,
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
          'fill-opacity': 0,
          'fill-opacity-transition': { duration: 700 },
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
          'fill-color': '#ff503d',
          'fill-opacity': 0,
          'fill-opacity-transition': { duration: 700 },
        },
      },
      firstLabelLayerId,
    )
    map.addLayer(
      {
        id: 'excluded-districts-outline',
        type: 'line',
        source: 'excluded-districts',
        paint: {
          'line-color': '#8c3427',
          'line-opacity': 0,
          'line-opacity-transition': { duration: 700 },
          'line-width': 1,
        },
      },
      firstLabelLayerId,
    )
    // Let the map render the transparent result once, then reveal the completed analysis.
    requestAnimationFrame(() => {
      map.setPaintProperty('excluded-districts', 'fill-opacity', 0.62)
      map.setPaintProperty('liveable-districts', 'fill-opacity', 0.48)
      map.setPaintProperty('excluded-districts-outline', 'line-opacity', 1)
    })
    return true
  } catch (cause) {
    console.error('Liveable district land could not be calculated.', cause)
    return false
  }
}
