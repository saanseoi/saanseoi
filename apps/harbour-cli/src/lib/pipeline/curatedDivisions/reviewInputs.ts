import { polygonLabelPoint } from '@repo/core/pipeline/services/divisions/polygonLabelPoint'
import { landsdPlaceNameLocales } from '@repo/core/pipeline/services/sources/landsdPlaceNames'
import { divisionCuration } from './curationInputs'
import pins from '../../../../../../fixtures/meta/datasetInputs/saanseoi-division-review.json'
import {
  buildCurationInventory,
  curationHierarchy,
  curatedPrimaryNames,
} from '@repo/core/pipeline/services/divisions/curationInventory'
import { classifyIslandArea, geographicDivisionClassification } from '@repo/db'
import { reviewAreaBounds } from '@repo/core/pipeline/services/divisions/geographicReview'
import {
  geometryAreaKm2,
  type IslandInventoryEntry,
  type IslandCurationAction,
  type IslandReviewFixture,
} from '../islands/islandCuration'
import {
  readReviewSource,
  type ReviewArchiveOptions,
  type ReviewSourcePin,
} from './reviewSourceArchives'

type Row = Record<string, any>
export async function loadDivisionReviewInputs(
  options: ReviewArchiveOptions & {
    releaseVersion?: string
    sourceReleases?: ReviewSourcePin[]
    includeAreas?: boolean
  },
) {
  const selected = options.sourceReleases ?? pins.sourceReleases
  const pin = (dataset: string, resourceType = 'division') => {
    const source = selected.find(
      row => row.datasetCode === dataset && row.resourceType === resourceType,
    )
    if (!source) throw Error(`Missing review source pin: ${dataset}`)
    return source
  }
  const overturePin = pin('ds-hk-overture-division')
  const protomapsPin = pin('ds-hk-protomaps-island', 'divisionArea')
  const landsdPin = pin('ds-hk-hkgov-landsd-division')
  const [overture, protomaps, landsd] = await Promise.all([
    readReviewSource(overturePin, options),
    readReviewSource(protomapsPin, options),
    readReviewSource(landsdPin, options),
  ])
  const native = new Map(protomaps.map(row => [row.sourceRecordId, row]))
  const places = new Map(landsd.map(row => [String(row.id), row]))
  const geometry = divisionCuration.geometry
  const points = new Map(
    divisionCuration.points.entries.map(row => [row.divisionId, row.point]),
  )
  for (const feature of geometry.features) {
    const corePoint = (feature.properties as Row).corePoint
    if (corePoint) points.set(feature.properties.divisionId, corePoint)
  }
  const selections = new Map<string, Row>(
    divisionCuration.selections.entries.map(row => [row.divisionId, row]),
  )
  const shapeFor = (selection: Row) => {
    if (selection.geometry) return selection.geometry
    const feature = native.get(selection.sourceRecordId)
    if (!feature)
      throw Error(`Missing selected Protomaps geometry: ${selection.sourceRecordId}`)
    return feature.sourceGeometry
  }
  const islands: IslandInventoryEntry[] = divisionCuration.matches.islands.map(row => {
    const selection = selections.get(row.id)
    if (!selection) throw Error(`Missing island geometry selection: ${row.id}`)
    const feature = native.get(selection.sourceRecordId)
    const place = row.id.startsWith('LANDSD:PLACE_NAME:')
      ? places.get(row.id.split(':').at(-1)!)
      : null
    if (row.coverage === 'landsd-gazetteer' && !place)
      throw Error(`Missing selected LandsD identity: ${row.id}`)
    const i18n = place ? landsdPlaceNameLocales(place.placeNames) : undefined
    const labels = curatedPrimaryNames(row.id, {
      en:
        i18n?.en?.official ??
        feature?.properties.names?.en ??
        feature?.properties.tags?.name ??
        row.id,
      'zh-hant':
        i18n?.['zh-hant']?.official ??
        feature?.properties.names?.zh ??
        feature?.properties.names?.['zh-Hant'] ??
        null,
    })
    const shape = shapeFor(selection)
    const bounds = ['Polygon', 'MultiPolygon'].includes(shape.type)
      ? reviewAreaBounds(shape)
      : [...shape.coordinates, ...shape.coordinates]
    return {
      ...row,
      coverage: row.coverage as IslandInventoryEntry['coverage'],
      name: labels.en!,
      ...(labels['zh-hant'] ? { zh: labels['zh-hant']! } : {}),
      point: (points.get(row.id) ??
        place?.geometry.coordinates ??
        (shape.type === 'Point' ? shape.coordinates : polygonLabelPoint(shape))) as [
        number,
        number,
      ],
      geometry: shape,
      geometrySource: selection.geometry ? undefined : feature?.geometrySource,
      bounds,
      areaKm2: ['Polygon', 'MultiPolygon'].includes(shape.type)
        ? geometryAreaKm2(shape)
        : 0,
      source: place ? 'LandsD Place Name' : 'Protomaps',
      sourceRelease: place ? landsdPin.sourceVersion : protomapsPin.sourceVersion,
      protomapsFeatureId: selection.sourceRecordId,
      sourceTags: feature?.properties.tags,
      geometryOptions: (selection.options ?? []).map((option: Row) => {
        const shape = shapeFor(option)
        return {
          ...option,
          geometry: shape,
          geometrySource: option.geometry
            ? undefined
            : native.get(option.sourceRecordId)?.geometrySource,
          bounds: ['Polygon', 'MultiPolygon'].includes(shape.type)
            ? reviewAreaBounds(shape)
            : [...shape.coordinates, ...shape.coordinates],
          sourceTags:
            option.sourceTags ?? native.get(option.sourceRecordId)?.properties.tags,
        }
      }),
      ...(selection.restrictHierarchyToGeometry
        ? { restrictHierarchyToGeometry: true }
        : {}),
    }
  })
  const byIsland = new Map(islands.map(row => [row.id, row]))
  const islandReview: IslandReviewFixture = {
    sourceRelease: landsdPin.sourceVersion,
    basemapRelease: protomapsPin.sourceVersion,
    geometryPolicyVersion: 1,
    curationPolicy: {
      version: 1,
      aliasGroups: divisionCuration.matches.aliasGroups,
      actions: [
        ...divisionCuration.exclusions.islandActions,
        ...divisionCuration.selections.corrections,
        ...geometry.features.flatMap(feature => {
          const correction = (feature.properties as Row).islandCorrection
          return correction
            ? [
                {
                  id: feature.properties.divisionId,
                  ...correction,
                  geometry: feature.geometry,
                },
              ]
            : []
        }),
      ] as IslandCurationAction[],
    },
    entries: divisionCuration.exclusions.islandDecisions.map(row => ({
      ...(byIsland.get(row.id) ?? {
        id: row.id,
        name: curatedPrimaryNames(row.id, {}).en ?? row.id,
      }),
      ...row,
    })),
  }
  const inventory = buildCurationInventory(
    overture,
    {
      cohort: overturePin.sourceVersion,
      releaseVersion: options.releaseVersion,
      releaseSet: `data-hk-divisions-${overturePin.sourceVersion}`,
    },
    true,
    divisionCuration.points.entries,
    geometry.features as import('@repo/core/pipeline/services/divisions/geographicReview').ReviewArea[],
  )
  const combined = {
    ...inventory,
    divisions: [
      ...inventory.divisions,
      ...islands.map(row => {
        const cls =
          divisionCuration.classifications.entries.find(
            entry => entry.divisionId === row.id,
          )?.class ?? (row.areaKm2 ? classifyIslandArea(row.areaKm2) : 'minor_island')
        return {
          id: row.id,
          class: cls,
          ...geographicDivisionClassification(cls)!,
          names: { en: row.name, 'zh-hant': row.zh ?? null },
          point: row.point ?? null,
          hierarchies: { full: [], administrative: [], landform: [], locality: [] },
        }
      }),
    ],
  }
  const hierarchy = curationHierarchy(combined)
  const reference = options.includeAreas
    ? await readReviewSource(pin('ds-hk-overture-division', 'divisionArea'), options)
    : []
  return {
    inventory,
    hierarchy,
    islands,
    islandReview,
    protomaps,
    overture,
    landsd,
    reference,
    sourceReleases: selected,
  }
}
