import type { Feature, FeatureCollection } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'

import type {
  DistrictLand,
  DistrictLandProperties,
  DistrictGeometry,
} from './urbanDensityCensusDistricts.ts'

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
  excludedDistrictLand: DownloadedDistrictLand
}

let cachedDistrictLand: Promise<DistrictLand> | undefined
let geosReady:
  | Promise<{
      geos: Awaited<ReturnType<typeof import('geos-wasm')['default']>>
      geojsonToGeosGeom: (geometry: DistrictGeometry, geos: unknown) => number
    }>
  | undefined

const loadGeos = () =>
  (geosReady ??= Promise.all([import('geos-wasm'), import('geos-wasm/helpers')]).then(
    async ([{ default: initGeosJs }, helpers]) => ({
      geos: await initGeosJs(),
      geojsonToGeosGeom: helpers.geojsonToGeosGeom,
    }),
  ))

function isDistrictLand(value: unknown): value is DownloadedDistrictLand {
  if (!value || typeof value !== 'object') return false
  const collection = value as Partial<DownloadedDistrictLand>
  return collection.type === 'FeatureCollection' && Array.isArray(collection.features)
}

async function hasValidDistrictGeometry(
  feature: Feature<DistrictGeometry, DownloadedDistrictLandProperties>,
) {
  if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') {
    return false
  }

  const { geos, geojsonToGeosGeom } = await loadGeos()
  const geometry = geojsonToGeosGeom(feature.geometry, geos)
  try {
    return geos.GEOSisValid(geometry) === 1
  } finally {
    geos.GEOSGeom_destroy(geometry)
  }
}

async function normaliseDistrictLand(
  collection: DownloadedDistrictLand,
): Promise<Array<Feature<DistrictGeometry, DistrictLandProperties>>> {
  const normalised: Array<Feature<DistrictGeometry, DistrictLandProperties>> = []
  for (const feature of collection.features) {
    const { area, districtCode } = feature.properties
    if (typeof area !== 'string' || typeof districtCode !== 'string') {
      throw new Error('Land-analysis feature is missing its District identity.')
    }
    // Saved results must already be valid; previews never alter source geometry.
    if (!(await hasValidDistrictGeometry(feature))) {
      throw new Error(
        `Land-analysis contains invalid ${districtCode} geometry. Regenerate land-analysis.json.`,
      )
    }
    normalised.push({
      ...feature,
      properties: { area, divisionCode: districtCode },
    })
  }
  return normalised
}

export async function decodeLandAnalysis(value: unknown): Promise<DistrictLand> {
  if (!value || typeof value !== 'object') {
    throw new Error('Land-analysis JSON is not an object.')
  }

  const analysis = value as Partial<LandAnalysis>
  if (
    !isDistrictLand(analysis.liveableDistrictLand) ||
    !isDistrictLand(analysis.excludedDistrictLand)
  ) {
    throw new Error(
      'Land-analysis JSON must include liveable and excluded District land.',
    )
  }

  return {
    liveableDistrictLand: await normaliseDistrictLand(analysis.liveableDistrictLand),
    excludedDistrictLand: await normaliseDistrictLand(analysis.excludedDistrictLand),
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

    map.addSource('excluded-districts', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: excludedDistrictLand },
    })
    map.addSource('liveable-districts', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: liveableDistrictLand },
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
    // Let the map render the transparent result once, then reveal the completed analysis.
    requestAnimationFrame(() => {
      map.setPaintProperty('excluded-districts', 'fill-opacity', 0.62)
      map.setPaintProperty('liveable-districts', 'fill-opacity', 0.48)
      map.setPaintProperty('excluded-districts-outline', 'line-opacity', 1)
    })
  } catch (cause) {
    console.error('Liveable district land could not be calculated.', cause)
  }
}
