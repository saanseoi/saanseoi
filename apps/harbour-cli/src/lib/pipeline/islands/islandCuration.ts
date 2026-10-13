import type { ProtomapsIslandSelection } from '@repo/core/pipeline/services/sources/protomapsSourceViews'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  buildDeterministicUuidV5,
  canonicalGeneratedId,
  classifyIslandArea,
} from '@repo/db'
import { REPO_ROOT } from '../../sources/sourceUpdatesConfig.ts'

export type IslandGeometry = {
  type: string
  coordinates: unknown
}

export type IslandInventoryEntry = {
  id: string
  name: string
  zh?: string
  point?: [number, number]
  areaKm2?: number
  geometry?: IslandGeometry | null
  coverage?: 'landsd-gazetteer' | 'basemap-only'
  source?: string
  sourceRelease?: string
  sourceTags?: Record<string, unknown>
  identifiers?: string[]
  /** Curated crosswalk to the Overture division whose identity is retained. */
  overtureDivisionId?: string
  /** Overture source version that supplied the retained identity. */
  overtureRelease?: string
  /** Stable native feature ID in the selected Protomaps baseline. */
  protomapsFeatureId?: string
  geometrySource?: ProtomapsIslandSelection
  geometryOptions?: Array<{
    geometrySource?: ProtomapsIslandSelection
    label?: string
    geometry: IslandGeometry
    bounds?: number[]
    sourceTags?: Record<string, unknown>
  }>
  [key: string]: unknown
}

export type IslandReviewEntry = IslandInventoryEntry & {
  decision: 'accepted' | 'rejected' | 'flagged' | 'pending' | string
  note?: string
  ai?: boolean
  rejectionCode?: string
  alternativesEn?: string[]
  alternativesZh?: string[]
}

export type IslandCurationAction = {
  id: string
  action:
    | 'exclude'
    | 'merge'
    | 'reclassify'
    | 'geometry-correction'
    | 'manual-review'
    | 'no-geometry'
  operation?: string
  class?: string
  reason?: string
  reviewRequired?: boolean
  maxDistanceMetres?: number
  geometry?: IslandGeometry
}

export type IslandAliasGroup = {
  canonicalId: string
  aliasIds: string[]
  reason: string
}

export type IslandReviewFixture = {
  sourceRelease?: string
  basemapRelease?: string
  coastlineRelease?: string
  geometryPolicyVersion?: number
  curationPolicy?: {
    version: number
    actions: IslandCurationAction[]
    aliasGroups: IslandAliasGroup[]
  }
  entries: IslandReviewEntry[]
}

export type IslandSourceEvidence = {
  source: string
  sourceRelease?: string
  featureId: string
  coverage: 'landsd-gazetteer' | 'basemap-only'
}

export type CuratedIsland = {
  id: string
  names: {
    en: string
    zh: string | null
    alternativesEn: string[]
    alternativesZh: string[]
  }
  areaKm2: number
  geometry: IslandGeometry
  geometrySource?: ProtomapsIslandSelection
  class: 'island'
  identifiers: string[]
  sources: IslandSourceEvidence[]
  selection: {
    overtureDivisionId: string | null
    overtureRelease: string | null
    protomapsFeatureId: string | null
    protomapsRelease: string | null
    landsdPlaceNameIds: string[]
  }
  sourceProperties: {
    gazetteer: {
      landsdPlaceName: boolean
      sourceRelease: string | null
    }
    curation: {
      fixture: string
      policyVersion: number
      decision: string
    }
  }
}

export type IslandCurationResult = {
  islands: CuratedIsland[]
  pending: Array<{ id: string; name: string; action: string; reason: string }>
  uncuratedBasemap: Array<{ id: string; name: string }>
  uncuratedLandsd: Array<{ id: string; name: string }>
  gainedGeometry: Array<{ id: string; name: string }>
  sourceReleases: {
    landsd: string[]
    basemap: string[]
    curatedLandsd: string | null
    curatedBasemap: string | null
  }
  ready: boolean
}

const CURATED_ISLAND_DIVISION_NAMESPACE = '7a3c5e91-95c2-5c93-8e3c-7d5b5d3bb6e7'

export const ISLAND_REVIEW_OUTPUT_PATH = resolve(
  REPO_ROOT,
  '.local/harbour/islands/curated-review.json',
)

const polygonTypes = new Set(['Polygon', 'MultiPolygon'])

export async function loadIslandReviewInputs(options?: {
  inventoryPath?: string
  reviewPath?: string
}) {
  if (!options?.inventoryPath && !options?.reviewPath) {
    const { loadDivisionReviewInputs } = await import(
      '../curatedDivisions/reviewInputs'
    )
    const inputs = await loadDivisionReviewInputs({
      root: REPO_ROOT,
      apiBaseUrl: process.env.SAANSEOI_REVIEW_API_URL,
      archiveBaseUrl: process.env.SAANSEOI_REVIEW_ARCHIVE_URL,
    })
    return { inventory: inputs.islands, review: inputs.islandReview }
  }
  if (!options.inventoryPath || !options.reviewPath)
    throw Error(
      'Custom island review requires both generated inventory and review paths.',
    )
  const [inventory, review] = await Promise.all([
    readJson<IslandInventoryEntry[]>(options.inventoryPath),
    readJson<IslandReviewFixture>(options.reviewPath),
  ])
  return { inventory, review }
}

/**
 * `select_curated_protomaps_island_features`: retain only curation-approved
 * Protomaps geometry selections and block unknown names or geometry changes.
 */
export function curateIslands(
  inventory: readonly IslandInventoryEntry[],
  review: IslandReviewFixture,
): IslandCurationResult {
  const reviewById = new Map(review.entries.map(entry => [entry.id, entry]))
  const actions = new Map(
    (review.curationPolicy?.actions ?? []).map(action => [action.id, action]),
  )
  const aliasGroups = review.curationPolicy?.aliasGroups ?? []
  const aliasById = new Map<string, IslandAliasGroup>()
  for (const group of aliasGroups) {
    aliasById.set(group.canonicalId, group)
    for (const aliasId of group.aliasIds) aliasById.set(aliasId, group)
  }

  const uncuratedBasemap = inventory
    .filter(entry => entry.coverage === 'basemap-only')
    .filter(entry => !reviewById.has(entry.id))
    .map(entry => ({ id: entry.id, name: entry.name }))
  const uncuratedLandsd = inventory
    .filter(entry => entry.coverage === 'landsd-gazetteer')
    .filter(entry => !reviewById.has(entry.id))
    .map(entry => ({ id: entry.id, name: entry.name }))

  const gainedGeometry = review.entries
    .filter(entry => actions.get(entry.id)?.action === 'no-geometry')
    .flatMap(entry => {
      const current = inventory.find(candidate => candidate.id === entry.id)
      return current && isPolygonGeometry(current.geometry)
        ? [{ id: current.id, name: current.name }]
        : []
    })

  const pending = review.entries.flatMap(entry => {
    const action = actions.get(entry.id)
    const current = inventory.find(candidate => candidate.id === entry.id)
    const correctedGeometry = current ? geometryForAction(current, action) : undefined
    if (!action || (!action.reviewRequired && correctedGeometry)) return []
    if (!action.reviewRequired && action.action !== 'geometry-correction') return []
    return [
      {
        id: entry.id,
        name: entry.name,
        action: action.action,
        reason: action.reason ?? entry.note ?? 'Manual review is required.',
      },
    ]
  })

  const emitted = new Map<string, CuratedIsland>()
  for (const entry of review.entries) {
    const action = actions.get(entry.id)
    const aliasGroup = aliasById.get(entry.id)
    const isCanonicalMerge = aliasGroup?.canonicalId === entry.id
    const current = inventory.find(candidate => candidate.id === entry.id)
    const correctedGeometry = current ? geometryForAction(current, action) : undefined
    const shouldEmit =
      entry.decision === 'accepted' ||
      (isCanonicalMerge && action?.action === 'merge') ||
      (action?.action === 'geometry-correction' &&
        !action.reviewRequired &&
        isPolygonGeometry(correctedGeometry))
    if (!shouldEmit || action?.reviewRequired) continue
    if (
      action &&
      ['exclude', 'reclassify', 'manual-review', 'no-geometry'].includes(action.action)
    )
      continue
    if (!current)
      throw new Error(
        `Curated island ${entry.id} (${entry.name}) is missing from the inventory.`,
      )
    const geometry = geometryForAction(current, action)
    if (!geometry && action?.action === 'geometry-correction') continue
    if (!isPolygonGeometry(geometry)) {
      throw new Error(
        `Curated island ${entry.id} (${entry.name}) has no polygon geometry.`,
      )
    }

    const group = aliasGroup?.canonicalId === entry.id ? aliasGroup : undefined
    const aliases =
      group?.aliasIds
        .map(aliasId => {
          const curated = reviewById.get(aliasId)
          const currentAlias = inventory.find(candidate => candidate.id === aliasId)
          return curated && currentAlias
            ? { ...currentAlias, ...curated }
            : (curated ?? currentAlias)
        })
        .filter((alias): alias is IslandReviewEntry => Boolean(alias)) ?? []
    const sourceEntries = [entry, ...aliases]
    const alternativesEn = unique(
      aliases.flatMap(alias => (alias.name ? [alias.name] : [])),
    )
    const alternativesZh = unique(
      aliases.flatMap(alias => (alias.zh ? [alias.zh] : [])),
    )
    const geometryOption = geometryOptionForAction(current, action)
    const sources: IslandSourceEvidence[] = sourceEntries.map(source => ({
      source: source.source ?? 'unknown',
      sourceRelease: source.sourceRelease,
      featureId: source.id,
      coverage: source.coverage ?? 'basemap-only',
    }))
    if (geometryOption) {
      sources.push({
        source: 'OpenStreetMap',
        sourceRelease: review.basemapRelease,
        featureId: `${entry.id}:named-geometry`,
        coverage: 'basemap-only',
      })
    }
    if (action?.geometry) {
      sources.push({
        source: 'OpenStreetMap coastline',
        sourceRelease: review.coastlineRelease ?? review.basemapRelease,
        featureId: `${entry.id}:curated-geometry`,
        coverage: 'basemap-only',
      })
    }
    const geometrySource = action?.geometry
      ? undefined
      : geometryOption
        ? geometryOption.geometrySource
        : current.geometrySource
    emitted.set(entry.id, {
      id: entry.id,
      names: {
        en: entry.name,
        zh: entry.zh ?? current.zh ?? null,
        alternativesEn: unique([...alternativesEn, ...(entry.alternativesEn ?? [])]),
        alternativesZh: unique([...alternativesZh, ...(entry.alternativesZh ?? [])]),
      },
      areaKm2:
        geometryOption || action?.geometry
          ? geometryAreaKm2(geometry)
          : numberOrZero(entry.areaKm2 ?? current.areaKm2),
      geometry,
      geometrySource,
      class: 'island',
      identifiers: unique([
        ...(current.identifiers ?? []),
        ...aliases.flatMap(alias => alias.identifiers ?? []),
      ]),
      sources,
      selection: {
        overtureDivisionId:
          sourceEntries.find(source => source.overtureDivisionId)?.overtureDivisionId ??
          null,
        overtureRelease:
          sourceEntries.find(source => source.overtureRelease)?.overtureRelease ?? null,
        protomapsFeatureId: geometrySource?.sourceRecordId ?? null,
        protomapsRelease:
          review.basemapRelease ??
          sourceEntries.find(source => source.coverage === 'basemap-only')
            ?.sourceRelease ??
          null,
        landsdPlaceNameIds: sourceEntries
          .filter(source => source.coverage === 'landsd-gazetteer')
          .map(source => source.id),
      },
      sourceProperties: {
        gazetteer: {
          landsdPlaceName: sourceEntries.some(
            source => source.coverage === 'landsd-gazetteer',
          ),
          sourceRelease:
            sourceEntries.find(source => source.coverage === 'landsd-gazetteer')
              ?.sourceRelease ?? null,
        },
        curation: {
          fixture: 'division-exclusions',
          policyVersion: review.curationPolicy?.version ?? 1,
          decision: aliasGroup ? 'merge' : entry.decision,
        },
      },
    })
  }

  const sourceReleases = {
    landsd: unique(
      inventory
        .filter(entry => entry.coverage === 'landsd-gazetteer')
        .map(entry => entry.sourceRelease)
        .filter((value): value is string => Boolean(value)),
    ),
    basemap: unique(
      inventory
        .filter(entry => entry.coverage === 'basemap-only')
        .map(entry => entry.sourceRelease)
        .filter((value): value is string => Boolean(value)),
    ),
    curatedLandsd: review.sourceRelease ?? null,
    curatedBasemap: review.basemapRelease ?? review.coastlineRelease ?? null,
  }

  const islands = [...emitted.values()].sort(
    (left, right) =>
      right.areaKm2 - left.areaKm2 || left.names.en.localeCompare(right.names.en),
  )
  return {
    islands,
    pending,
    uncuratedBasemap,
    uncuratedLandsd,
    gainedGeometry,
    sourceReleases,
    ready:
      pending.length === 0 &&
      uncuratedBasemap.length === 0 &&
      uncuratedLandsd.length === 0 &&
      gainedGeometry.length === 0,
  }
}

export function formatIslandReviewTable(result: IslandCurationResult) {
  return result.islands
    .map(island =>
      [
        island.names.en,
        island.names.zh ?? '',
        island.names.alternativesEn.join('; '),
        island.names.alternativesZh.join('; '),
        island.areaKm2.toFixed(6),
      ].join(' | '),
    )
    .join('\n')
}

/**
 * `materialise_saanseoi_island_divisions`: build a SaanSeoi assembly row. This deliberately does not represent an
 * Overture source record: the selected Overture ID is retained when there is
 * one, while the island geometry remains the selected Protomaps assertion.
 */
export function curatedIslandToSaanSeoiDivisionRow(
  island: CuratedIsland,
): Record<string, unknown> {
  const names = [
    { language: 'en', value: island.names.en },
    ...(island.names.zh ? [{ language: 'zh-Hant', value: island.names.zh }] : []),
    ...island.names.alternativesEn.map(value => ({ language: 'en', value })),
    ...island.names.alternativesZh.map(value => ({ language: 'zh-Hant', value })),
  ]

  return {
    id:
      island.selection.overtureDivisionId ??
      canonicalGeneratedId(
        buildDeterministicUuidV5(CURATED_ISLAND_DIVISION_NAMESPACE, island.id),
      ),
    country: 'HK',
    theme: 'divisions',
    type: 'division',
    subtype: 'landform',
    class: classifyIslandArea(island.areaKm2),
    geometry: island.geometry,
    ...(island.geometrySource ? { geometrySource: island.geometrySource } : {}),
    hierarchies: [],
    names: { common: names, primary: island.names.en },
    identifiers: {
      saanseoi: {
        sourceId: island.id,
        canonicalClass: island.class,
        gazetteer: {
          landsdPlaceName: island.sourceProperties.gazetteer.landsdPlaceName,
        },
        curation: island.sourceProperties.curation,
      },
    },
    sources: {
      ...(island.selection.overtureDivisionId
        ? {
            overture: [
              {
                dataset: 'ds-hk-overture-division',
                record_id: island.selection.overtureDivisionId,
                contributions: ['identity'],
              },
            ],
          }
        : {}),
      ...(island.selection.landsdPlaceNameIds.length
        ? {
            hkgovLandsd: island.selection.landsdPlaceNameIds.map(record_id => ({
              dataset: 'ds-hk-hkgov-landsd-division',
              record_id,
              contributions: ['official-name', 'alias'],
            })),
          }
        : {}),
      ...(island.geometrySource
        ? {
            protomaps: [
              {
                dataset: 'ds-hk-protomaps-island',
                record_id: island.geometrySource.sourceRecordId,
                contributions: ['geometry'],
              },
            ],
          }
        : {}),
      saanseoi: [
        {
          dataset: 'ds-hk-saanseoi-division',
          curation: 'island-curation',
          record_id: island.id,
          contributions: [island.geometrySource ? 'selection' : 'geometry'],
          policy_version: island.sourceProperties.curation.policyVersion,
        },
      ],
    },
  }
}

/**
 * `materialise_saanseoi_island_division_areas`: build the selected SaanSeoi
 * DivisionArea companion for an island assembly row.
 */
export function curatedIslandToSaanSeoiDivisionAreaRow(
  island: CuratedIsland,
): Record<string, unknown> {
  const division = curatedIslandToSaanSeoiDivisionRow(island)
  const divisionId = division.id as string
  return {
    id: `${divisionId}:saanseoi`,
    divisionId,
    variant: 'saanseoi',
    geometry: island.geometry,
    type: 'land',
    isLand: true,
    isTerritorial: false,
    identifiers: {
      saanseoi: {
        sourceId: island.id,
        selectedProtomapsFeatureId: island.selection.protomapsFeatureId,
      },
    },
    sources: division.sources,
  }
}

/** @deprecated SaanSeoi island rows must be assembled outside native uploads. */
export const curatedIslandToDivisionRow = curatedIslandToSaanSeoiDivisionRow

export async function writeIslandCurationReview(
  result: IslandCurationResult,
  outputPath = ISLAND_REVIEW_OUTPUT_PATH,
) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        ready: result.ready,
        sourceReleases: result.sourceReleases,
        pending: result.pending,
        uncuratedBasemap: result.uncuratedBasemap,
        uncuratedLandsd: result.uncuratedLandsd,
        gainedGeometry: result.gainedGeometry,
        columns: [
          'English Name',
          'Chinese Name',
          'Alternatives English',
          'Alternatives Chinese',
          'Size',
        ],
        islands: result.islands,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

export async function writeIslandReviewMarkdown(
  result: IslandCurationResult,
  outputPath = resolve(dirname(ISLAND_REVIEW_OUTPUT_PATH), 'curated-review.md'),
) {
  await mkdir(dirname(outputPath), { recursive: true })
  const pending = result.pending.length
    ? `\nPending review: ${result.pending.map(item => `${item.name} (${item.action})`).join(', ')}\n`
    : '\nPending review: none\n'
  await writeFile(
    outputPath,
    `# Curated Hong Kong islands\n\nReady for upload: **${result.ready ? 'yes' : 'no'}**. Emitted islands: **${result.islands.length}**.${pending}\n\n| English Name | Chinese Name | Alternatives English | Alternatives Chinese | Size |\n| --- | --- | --- | --- | ---: |\n${result.islands
      .map(island => {
        const values = [
          island.names.en,
          island.names.zh ?? '',
          island.names.alternativesEn.join('; '),
          island.names.alternativesZh.join('; '),
          island.areaKm2.toFixed(6),
        ]
        return `| ${values.join(' | ')} |`
      })
      .join('\n')}\n`,
    'utf8',
  )
}

export function assertIslandCurationReady(result: IslandCurationResult) {
  if (result.ready) return
  const details = [
    result.uncuratedBasemap.length
      ? `${result.uncuratedBasemap.length} uncurated named basemap island(s): ${result.uncuratedBasemap.map(item => item.name).join(', ')}`
      : '',
    result.uncuratedLandsd.length
      ? `${result.uncuratedLandsd.length} uncurated LandsD island name(s): ${result.uncuratedLandsd.map(item => item.name).join(', ')}`
      : '',
    result.gainedGeometry.length
      ? `geometry appeared for previously no-geometry candidate(s): ${result.gainedGeometry.map(item => item.name).join(', ')}`
      : '',
    result.pending.length
      ? `${result.pending.length} curation decision(s) still require review: ${result.pending.map(item => item.name).join(', ')}`
      : '',
  ].filter(Boolean)
  throw new Error(
    `Hong Kong island curation is not ready for an Overture division upload. ${details.join(' ')}`,
  )
}

export async function runIslandCurationReview(options?: {
  inventoryPath?: string
  reviewPath?: string
  outputPath?: string
}) {
  const { inventory, review } = await loadIslandReviewInputs(options)
  const result = curateIslands(inventory, review)
  await writeIslandCurationReview(result, options?.outputPath)
  return result
}

export function isOvertureHongKongDivisionPlan(plan: {
  datasetCode?: string
  regionCode?: string
  source?: string
  theme?: string
  resourceType?: string
}) {
  return (
    plan.datasetCode === 'ds-hk-overture-division' &&
    plan.regionCode === 'hk' &&
    plan.source === 'overture' &&
    plan.theme === 'divisions' &&
    plan.resourceType === 'division'
  )
}

function isPolygonGeometry(
  value: IslandGeometry | null | undefined,
): value is IslandGeometry {
  return Boolean(value && polygonTypes.has(value.type))
}

function geometryForAction(
  entry: IslandInventoryEntry,
  action: IslandCurationAction | undefined,
) {
  return (
    action?.geometry ??
    geometryOptionForAction(entry, action)?.geometry ??
    (action?.action === 'geometry-correction' &&
    action.operation === 'use-named-basemap-geometry'
      ? undefined
      : entry.geometry)
  )
}

function geometryOptionForAction(
  entry: IslandInventoryEntry,
  action: IslandCurationAction | undefined,
) {
  if (action?.action !== 'geometry-correction') return undefined
  if (action.operation !== 'use-named-basemap-geometry') return undefined
  const options = (entry.geometryOptions ?? []).filter(option =>
    isPolygonGeometry(option.geometry),
  )
  const distanceFiltered =
    action.maxDistanceMetres !== undefined && entry.point
      ? options.filter(
          option =>
            distanceMetres(entry.point!, pointForGeometry(option.geometry)) <=
            action.maxDistanceMetres!,
        )
      : options
  if (action.maxDistanceMetres !== undefined && distanceFiltered.length !== 1) {
    return undefined
  }
  const island = distanceFiltered.find(option => option.sourceTags?.place === 'island')
  return island ?? distanceFiltered[0]
}

function pointForGeometry(geometry: IslandGeometry): [number, number] {
  const coordinates: number[][] = []
  walkCoordinates(geometry.coordinates, coordinates)
  if (!coordinates.length) return [0, 0]
  return [
    coordinates.reduce((sum, [value]) => sum + value!, 0) / coordinates.length,
    coordinates.reduce((sum, [, value]) => sum + value!, 0) / coordinates.length,
  ]
}

function distanceMetres(left: [number, number], right: [number, number]) {
  const latitudeScale = 111_320
  const longitudeScale = latitudeScale * Math.cos((left[1] * Math.PI) / 180)
  return Math.hypot(
    (right[0] - left[0]) * longitudeScale,
    (right[1] - left[1]) * latitudeScale,
  )
}

function numberOrZero(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function geometryAreaKm2(geometry: IslandGeometry) {
  const coordinates: number[][] = []
  walkCoordinates(geometry.coordinates, coordinates)
  if (coordinates.length < 3) return 0
  const latitude =
    coordinates.reduce((sum, [, value]) => sum + value!, 0) / coordinates.length
  const longitudeScale = 111.32 * Math.cos((latitude * Math.PI) / 180)
  const polygons: unknown[] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : (geometry.coordinates as unknown[])
  const degreeArea = polygons.reduce<number>((total, polygon) => {
    if (!Array.isArray(polygon)) return total
    return (
      total +
      polygon.reduce<number>((polygonTotal, ring, index) => {
        const ringCoordinates: number[][] = []
        walkCoordinates(ring, ringCoordinates)
        let twiceArea = 0
        for (let point = 0; point < ringCoordinates.length; point += 1) {
          const [x1, y1] = ringCoordinates[point]!
          const [x2, y2] = ringCoordinates[(point + 1) % ringCoordinates.length]!
          twiceArea += x1! * y2! - x2! * y1!
        }
        return polygonTotal + ((index === 0 ? 1 : -1) * Math.abs(twiceArea)) / 2
      }, 0)
    )
  }, 0)
  return Math.abs(degreeArea) * longitudeScale * 111.32
}

function walkCoordinates(value: unknown, output: number[][]) {
  if (!Array.isArray(value)) return
  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    output.push([value[0], value[1]])
    return
  }
  for (const item of value) walkCoordinates(item, output)
}

function unique(values: string[]) {
  return [...new Set(values)]
}

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as T
}
