import { globSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import { Database as SQLiteDatabase } from 'bun:sqlite'
import { and, eq } from 'drizzle-orm'
import { parquetWriteFile } from 'hyparquet-writer'
import { resolveLocalD1Path } from '@repo/core/testing/localDb'
import {
  currentSchema,
  metaSchema,
  type CurrentDatabase,
  type MetaDatabase,
} from '@repo/db'

import type { UploadEnvironment } from './options.ts'
import {
  buildHkgovAlsPremiseIdentity,
  buildHkgovAlsProvisionalId,
} from './hkgovAlsIdentity.ts'
import {
  emptyHkgovAlsIdentityDecisions,
  emptyHkgovAlsIdentityHistory,
  resolveHkgovAlsIdentityDrift,
  type HkgovAlsIdentityDecisions,
  type HkgovAlsIdentityDriftCandidate,
  type HkgovAlsIdentityHistory,
  type HkgovAlsIdentityRecord,
} from './hkgovAlsDrift.ts'
import {
  normalizeHkgovAlsPremiseStructure,
  preferHkgovAlsEnglishCanonicalValue,
} from './hkgovAlsPremiseNormalization.ts'
const HARBOUR_API_WRANGLER_CONFIG = resolve(
  import.meta.dir,
  '../../../harbour-api/wrangler.jsonc',
)

const COUNTRY_NAME_ALIASES = [
  'CHINA',
  'P.R. CHINA',
  'PRC',
  'CHINA PRC',
  'CHINA, PRC',
  "THE PEOPLE'S REPUBLIC OF CHINA",
] as const

const AREA_NAME_ALIASES_EN = new Map<string, string>([
  ['HK', 'HONG KONG ISLAND'],
  ['HONG KONG', 'HONG KONG ISLAND'],
  ['KLN', 'KOWLOON'],
  ['KOWLOON', 'KOWLOON'],
  ['NT', 'NEW TERRITORIES'],
  ['NEW TERRITORIES', 'NEW TERRITORIES'],
])

const AREA_NAME_ALIASES_ZH = new Map<string, string>([
  ['香港', '香港島'],
  ['九龍', '九龍'],
  ['新界', '新界'],
])

type PrepareHkgovAlsOptions = {
  dbPath?: string
  environment: UploadEnvironment
  currentDb?: CurrentDatabase
  identityDecisions?: HkgovAlsIdentityDecisions
  identityHistory?: HkgovAlsIdentityHistory
  metaDb?: MetaDatabase
  outputFile: string
  cohortKey: string
  sourceDir: string
  sourceVersion: string
  postProcessPremiseStructure?: boolean
  writeOutput?: boolean
}

type DivisionLookupMaps = {
  areaByEn: Map<string, string>
  areaByZh: Map<string, string>
  countryId: string | null
  districtByEn: Map<string, string>
  districtByZh: Map<string, string>
  snapshotId: string
}

type HkgovAlsGeoJson = {
  features?: HkgovAlsFeature[]
}

type HkgovAlsFeature = {
  geometry?: {
    coordinates?: [number, number]
    type?: string
  } | null
  properties?: {
    Address?: {
      PremisesAddress?: HkgovPremisesAddress | null
    } | null
    Easting?: number | null
    Northing?: number | null
  } | null
}

export type HkgovAlsSourceDuplicateGroup = {
  address: string
  occurrences: Array<{
    featureIndexOneBased: number
    sourceFile: string
  }>
}

export type HkgovAlsSourceFeature = {
  feature: HkgovAlsFeature
  featureIndexOneBased: number
  sourceFile: string
}

type HkgovPremisesAddress = {
  BuildingCsuInformation?: {
    CsuId?: string | null
  } | null
  ChiPremisesAddress?: HkgovLocalizedPremisesAddress | null
  EngPremisesAddress?: HkgovLocalizedPremisesAddress | null
  GeoAddress?: string | null
}

type HkgovLocalizedPremisesAddress = {
  Region?: string | null
  ChiDistrict?: string | null
  EngDistrict?: string | null
  BuildingName?: string | null
  ChiBlock?: {
    BlockDescriptor?: string | null
    BlockNo?: string | number | null
  } | null
  EngBlock?: {
    BlockDescriptor?: string | null
    BlockDescriptorPrecedenceIndicator?: string | null
    BlockNo?: string | number | null
  } | null
  ChiEstate?: {
    EstateName?: string | null
  } | null
  EngEstate?: {
    EstateName?: string | null
  } | null
  ChiPhase?: {
    PhaseName?: string | null
    PhaseNo?: string | number | null
  } | null
  EngPhase?: {
    PhaseName?: string | null
    PhaseNo?: string | number | null
  } | null
  ChiStreet?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    StreetName?: string | null
  } | null
  EngStreet?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    StreetName?: string | null
  } | null
  ChiVillage?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    LocationName?: string | null
    VillageName?: string | null
  } | null
  EngVillage?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    LocationName?: string | null
    VillageName?: string | null
  } | null
  ChiUnit?: {
    UnitDescriptor?: string | null
    UnitNo?: string | number | null
  } | null
  EngUnit?: {
    UnitDescriptor?: string | null
    UnitNo?: string | number | null
  } | null
}

type PreparedHkgovAlsRow = {
  id: string
  canonicalId: string
  theme: 'addresses'
  type: 'address'
  country: 'HK'
  region: 'HK'
  cohortKey: string
  sourceVersion: string
  sourceFile: string
  sourceFeatureIndexOneBased: number
  geometry: string | null
  identifiers: string | null
  sources: string
  divisionSnapshotId: string
  areaId: string | null
  districtId: string | null
  countryId: string | null
  areaNameEn: string | null
  areaNameZhHant: string | null
  districtNameEn: string | null
  districtNameZhHant: string | null
  geoAddress: string | null
  hkgovCsuId: string | null
  identityAlias: string | null
  identityBuildingId: string
  identityContinuityKey: string
  identityKey: string
  numberlessIdentityKey: string
  identityMatchMethod: string
  blockDescriptorPrecedenceIndicator: string | null
  identityNumberFrom: string | null
  identityNumberTo: string | null
  identityRouteNames: string
  identitySummary: Record<string, string | null>
  chiPremisesAddressJson: string | null
  engPremisesAddressJson: string | null
  zhHantFormattedAddress: string | null
  zhHantRegion: string | null
  zhHantDistrict: string | null
  zhHantEstateName: string | null
  zhHantBuildingName: string | null
  zhHantBlockDescriptor: string | null
  zhHantBlockNumber: string | null
  zhHantStreetName: string | null
  zhHantStreetNumberFrom: string | null
  zhHantStreetNumberTo: string | null
  enFormattedAddress: string | null
  enRegion: string | null
  enDistrict: string | null
  enEstateName: string | null
  enBuildingName: string | null
  enBlockDescriptor: string | null
  enBlockNumber: string | null
  enStreetName: string | null
  enStreetNumberFrom: string | null
  enStreetNumberTo: string | null
  easting: number | null
  northing: number | null
}

type PreparedHkgovAlsResult = {
  deduplicatedFeatureCount: number
  driftCandidates: HkgovAlsIdentityDriftCandidate[]
  featureCount: number
  identityConsolidatedFeatureCount: number
  identityEquivalentFeatureGroups: HkgovAlsSourceDuplicateGroup[]
  numberRangeSingletonConsolidatedFeatureCount: number
  numberRangeSingletonFeatureGroups: HkgovAlsSourceDuplicateGroup[]
  resolvedIdConsolidatedFeatureCount: number
  identityRecords: HkgovAlsIdentityRecord[]
  outputFile: string
  sourceDuplicateFeatureGroups: HkgovAlsSourceDuplicateGroup[]
  sourceFileCount: number
}

type DivisionLookupSource =
  | {
      dbPath: string
      kind: 'sqlite'
    }
  | {
      databaseName: string
      kind: 'wrangler'
      mode: 'remote'
      wranglerEnv: 'preview' | 'production'
    }

export async function prepareHkgovAlsAddressParquet(
  options: PrepareHkgovAlsOptions,
): Promise<PreparedHkgovAlsResult> {
  const sourceDir = resolve(options.sourceDir)
  const outputFile = resolve(options.outputFile)
  // The release bundles a separate public-rental-housing 3-D file alongside the
  // 2-D district files. Its flat-level records are a different address product and
  // must not be folded into this 2-D ALS premise feed.
  const inputFiles = globSync(resolve(sourceDir, '*.geojson'))
    .filter(inputFile =>
      /^als_addresses_\(.+_district\)\.geojson$/i.test(basename(inputFile)),
    )
    .filter(filePath => !basename(filePath).startsWith('als_addresses_3d_'))
    .sort()

  if (inputFiles.length === 0) {
    throw new Error(`No 2D ALS GeoJSON files found in ${sourceDir}.`)
  }

  const divisionMaps = await loadDivisionLookupMaps({
    currentDb: options.currentDb,
    dbPath: options.dbPath,
    environment: options.environment,
    metaDb: options.metaDb,
    cohortKey: options.cohortKey,
  })
  const sourceFeatures: HkgovAlsSourceFeature[] = []

  for (const inputFile of inputFiles) {
    const payload = JSON.parse(await readFile(inputFile, 'utf8')) as HkgovAlsGeoJson
    const sourceFile = basename(inputFile)

    for (const [featureIndexZeroBased, feature] of (payload.features ?? []).entries()) {
      sourceFeatures.push({
        feature,
        featureIndexOneBased: featureIndexZeroBased + 1,
        sourceFile,
      })
    }
  }

  if (sourceFeatures.length === 0) {
    throw new Error(`No address features found in ${sourceDir}.`)
  }
  const sourceFeatureCount = sourceFeatures.length
  const {
    duplicateGroups: sourceDuplicateFeatureGroups,
    features: uniqueSourceFeatures,
  } = dedupeHkgovAlsSourceFeatures(sourceFeatures)
  const rows = uniqueSourceFeatures.map(sourceFeature =>
    normalizeHkgovAlsFeature(
      sourceFeature.feature,
      sourceFeature.sourceFile,
      sourceFeature.featureIndexOneBased,
      options.cohortKey,
      options.sourceVersion,
      divisionMaps,
      options.postProcessPremiseStructure !== false,
    ),
  )
  const {
    duplicateGroups: identityEquivalentFeatureGroups,
    rows: identityDistinctRows,
  } = consolidateEquivalentHkgovAlsPremises(rows)
  rows.splice(0, rows.length, ...identityDistinctRows)
  const {
    duplicateGroups: numberRangeSingletonFeatureGroups,
    rows: numberRangeDistinctRows,
  } = consolidateHkgovAlsSingletonNumberRangeVariants(rows)
  rows.splice(0, rows.length, ...numberRangeDistinctRows)
  assertUniquePreparedRowIds(rows)
  const identityRecords = rows.map(row => ({
    continuityKey: row.identityContinuityKey,
    id: row.id,
    identityKey: row.identityKey,
    sourceVersion: row.sourceVersion,
    summary: row.identitySummary,
  }))
  const drift = resolveHkgovAlsIdentityDrift(
    identityRecords,
    options.identityHistory ?? emptyHkgovAlsIdentityHistory(),
    options.identityDecisions ?? emptyHkgovAlsIdentityDecisions(),
  )
  for (const row of rows) {
    const existingId = drift.resolvedIds.get(row.identityKey)
    if (!existingId) continue
    row.id = existingId
    row.canonicalId = existingId
    row.identityAlias = buildHkgovAlsProvisionalId(row.identityKey)
    row.identityMatchMethod =
      drift.resolvedMatchMethods.get(row.identityKey) ?? 'als-drift-decision'
  }
  const resolvedIdentityRecords = rows.map(row => ({
    continuityKey: row.identityContinuityKey,
    id: row.id,
    identityKey: row.identityKey,
    sourceVersion: row.sourceVersion,
    summary: row.identitySummary,
  }))
  const resolvedIdDistinctRows = consolidateRowsSharingResolvedId(rows)
  rows.splice(0, rows.length, ...resolvedIdDistinctRows)
  assertUniquePreparedRowIds(rows)

  await mkdir(dirname(outputFile), { recursive: true })
  if (options.writeOutput !== false)
    parquetWriteFile({
      filename: outputFile,
      rowGroupSize: 5000,
      columnData: [
        stringColumn(
          'id',
          rows.map(row => row.id),
          false,
        ),
        stringColumn(
          'canonicalId',
          rows.map(row => row.canonicalId),
          false,
        ),
        stringColumn(
          'theme',
          rows.map(row => row.theme),
          false,
        ),
        stringColumn(
          'type',
          rows.map(row => row.type),
          false,
        ),
        stringColumn(
          'country',
          rows.map(row => row.country),
          false,
        ),
        stringColumn(
          'region',
          rows.map(row => row.region),
          false,
        ),
        stringColumn(
          'cohortKey',
          rows.map(row => row.cohortKey),
          false,
        ),
        stringColumn(
          'sourceVersion',
          rows.map(row => row.sourceVersion),
          false,
        ),
        stringColumn(
          'sourceFile',
          rows.map(row => row.sourceFile),
          false,
        ),
        jsonColumn(
          'geometry',
          rows.map(row => row.geometry),
        ),
        jsonColumn(
          'identifiers',
          rows.map(row => row.identifiers),
        ),
        jsonColumn(
          'sources',
          rows.map(row => row.sources),
          false,
        ),
        stringColumn(
          'divisionSnapshotId',
          rows.map(row => row.divisionSnapshotId),
          false,
        ),
        stringColumn(
          'areaId',
          rows.map(row => row.areaId),
        ),
        stringColumn(
          'districtId',
          rows.map(row => row.districtId),
        ),
        stringColumn(
          'countryId',
          rows.map(row => row.countryId),
        ),
        stringColumn(
          'areaNameEn',
          rows.map(row => row.areaNameEn),
        ),
        stringColumn(
          'areaNameZhHant',
          rows.map(row => row.areaNameZhHant),
        ),
        stringColumn(
          'districtNameEn',
          rows.map(row => row.districtNameEn),
        ),
        stringColumn(
          'districtNameZhHant',
          rows.map(row => row.districtNameZhHant),
        ),
        stringColumn(
          'geoAddress',
          rows.map(row => row.geoAddress),
        ),
        stringColumn(
          'hkgovCsuId',
          rows.map(row => row.hkgovCsuId),
        ),
        stringColumn(
          'identityAlias',
          rows.map(row => row.identityAlias),
        ),
        stringColumn(
          'identityBuildingId',
          rows.map(row => row.identityBuildingId),
          false,
        ),
        stringColumn(
          'identityKey',
          rows.map(row => row.identityKey),
          false,
        ),
        stringColumn(
          'identityMatchMethod',
          rows.map(row => row.identityMatchMethod),
          false,
        ),
        stringColumn(
          'identityNumberFrom',
          rows.map(row => row.identityNumberFrom),
        ),
        stringColumn(
          'identityNumberTo',
          rows.map(row => row.identityNumberTo),
        ),
        jsonColumn(
          'identityRouteNames',
          rows.map(row => row.identityRouteNames),
          false,
        ),
        jsonColumn(
          'chiPremisesAddressJson',
          rows.map(row => row.chiPremisesAddressJson),
        ),
        jsonColumn(
          'engPremisesAddressJson',
          rows.map(row => row.engPremisesAddressJson),
        ),
        stringColumn(
          'zhHantFormattedAddress',
          rows.map(row => row.zhHantFormattedAddress),
        ),
        stringColumn(
          'zhHantRegion',
          rows.map(row => row.zhHantRegion),
        ),
        stringColumn(
          'zhHantDistrict',
          rows.map(row => row.zhHantDistrict),
        ),
        stringColumn(
          'zhHantEstateName',
          rows.map(row => row.zhHantEstateName),
        ),
        stringColumn(
          'zhHantBuildingName',
          rows.map(row => row.zhHantBuildingName),
        ),
        stringColumn(
          'zhHantBlockDescriptor',
          rows.map(row => row.zhHantBlockDescriptor),
        ),
        stringColumn(
          'zhHantBlockNumber',
          rows.map(row => row.zhHantBlockNumber),
        ),
        stringColumn(
          'zhHantStreetName',
          rows.map(row => row.zhHantStreetName),
        ),
        stringColumn(
          'zhHantStreetNumberFrom',
          rows.map(row => row.zhHantStreetNumberFrom),
        ),
        stringColumn(
          'zhHantStreetNumberTo',
          rows.map(row => row.zhHantStreetNumberTo),
        ),
        stringColumn(
          'enFormattedAddress',
          rows.map(row => row.enFormattedAddress),
        ),
        stringColumn(
          'enRegion',
          rows.map(row => row.enRegion),
        ),
        stringColumn(
          'enDistrict',
          rows.map(row => row.enDistrict),
        ),
        stringColumn(
          'enEstateName',
          rows.map(row => row.enEstateName),
        ),
        stringColumn(
          'enBuildingName',
          rows.map(row => row.enBuildingName),
        ),
        stringColumn(
          'enBlockDescriptor',
          rows.map(row => row.enBlockDescriptor),
        ),
        stringColumn(
          'enBlockNumber',
          rows.map(row => row.enBlockNumber),
        ),
        stringColumn(
          'enStreetName',
          rows.map(row => row.enStreetName),
        ),
        stringColumn(
          'enStreetNumberFrom',
          rows.map(row => row.enStreetNumberFrom),
        ),
        stringColumn(
          'enStreetNumberTo',
          rows.map(row => row.enStreetNumberTo),
        ),
        int32Column(
          'easting',
          rows.map(row => row.easting),
        ),
        int32Column(
          'northing',
          rows.map(row => row.northing),
        ),
      ],
    })

  return {
    deduplicatedFeatureCount: sourceFeatureCount - uniqueSourceFeatures.length,
    driftCandidates: drift.candidates,
    featureCount: sourceFeatureCount,
    identityConsolidatedFeatureCount:
      uniqueSourceFeatures.length - identityDistinctRows.length,
    identityEquivalentFeatureGroups,
    numberRangeSingletonConsolidatedFeatureCount:
      identityDistinctRows.length - numberRangeDistinctRows.length,
    numberRangeSingletonFeatureGroups,
    resolvedIdConsolidatedFeatureCount:
      numberRangeDistinctRows.length - resolvedIdDistinctRows.length,
    identityRecords: resolvedIdentityRecords,
    outputFile,
    sourceDuplicateFeatureGroups,
    sourceFileCount: inputFiles.length,
  }
}

/**
 * A reviewed ALS drift decision can make two source variants in the *same*
 * release resolve to one canonical premise. Keep a single service record, favouring
 * the representation that carries the most structured premise detail. The full
 * official source JSON remains in the release input/history.
 */
function consolidateRowsSharingResolvedId(rows: PreparedHkgovAlsRow[]) {
  const byId = new Map<string, PreparedHkgovAlsRow[]>()
  for (const row of rows) {
    const group = byId.get(row.id) ?? []
    group.push(row)
    byId.set(row.id, group)
  }
  const selected: PreparedHkgovAlsRow[] = []
  for (const group of byId.values()) {
    const first = [...group].sort((left, right) => {
      const scoreDifference =
        preparedPremiseSpecificity(right) - preparedPremiseSpecificity(left)
      if (scoreDifference !== 0) return scoreDifference
      return (
        left.sourceFile.localeCompare(right.sourceFile) ||
        left.sourceFeatureIndexOneBased - right.sourceFeatureIndexOneBased
      )
    })[0]
    if (first) selected.push(first)
  }
  return selected
}

function preparedPremiseSpecificity(row: PreparedHkgovAlsRow) {
  return (
    ((row.enBuildingName ?? row.zhHantBuildingName) ? 8 : 0) +
    ((row.enBlockNumber ?? row.zhHantBlockNumber) ? 4 : 0) +
    ((row.enBlockDescriptor ?? row.zhHantBlockDescriptor) ? 2 : 0) +
    ((row.enEstateName ?? row.zhHantEstateName) ? 1 : 0)
  )
}

/**
 * Collapses an ALS singleton number only when it repeats an endpoint of a
 * range for the exact same geocoded premise. ALS number ranges may use
 * alphanumeric values and odd/even semantics, so this intentionally does not
 * infer that a number between two endpoints belongs to the range.
 */
export function consolidateHkgovAlsSingletonNumberRangeVariants(
  rows: PreparedHkgovAlsRow[],
) {
  const rowsByNumberlessPremise = new Map<string, PreparedHkgovAlsRow[]>()
  for (const row of rows) {
    const key = [row.numberlessIdentityKey, row.geoAddress, row.geometry].join('\u0000')
    const variants = rowsByNumberlessPremise.get(key) ?? []
    variants.push(row)
    rowsByNumberlessPremise.set(key, variants)
  }

  const removedRows = new Set<PreparedHkgovAlsRow>()
  const occurrencesByRange = new Map<PreparedHkgovAlsRow, PreparedHkgovAlsRow[]>()
  for (const variants of rowsByNumberlessPremise.values()) {
    const ranges = variants.filter(isHkgovAlsNumberRange)
    if (ranges.length === 0) continue

    for (const singleton of variants.filter(isHkgovAlsSingletonNumber)) {
      const matchingRanges = ranges.filter(range =>
        hkgovAlsRangeHasSingletonEndpoint(range, singleton),
      )
      if (matchingRanges.length !== 1) continue

      const range = matchingRanges[0]
      if (!range) continue
      removedRows.add(singleton)
      const occurrences = occurrencesByRange.get(range) ?? [range]
      occurrences.push(singleton)
      occurrencesByRange.set(range, occurrences)
    }
  }

  return {
    duplicateGroups: [...occurrencesByRange.values()].map(occurrences => ({
      address:
        occurrences[0]?.enFormattedAddress ??
        occurrences[0]?.zhHantFormattedAddress ??
        'Unformatted ALS address',
      occurrences: occurrences.map(row => ({
        featureIndexOneBased: row.sourceFeatureIndexOneBased,
        sourceFile: row.sourceFile,
      })),
    })),
    rows: rows.filter(row => !removedRows.has(row)),
  }
}

function isHkgovAlsNumberRange(row: PreparedHkgovAlsRow) {
  const from = normalizeHkgovAlsNumber(row.identityNumberFrom)
  const to = normalizeHkgovAlsNumber(row.identityNumberTo)
  return from != null && to != null && from !== to
}

function isHkgovAlsSingletonNumber(row: PreparedHkgovAlsRow) {
  const from = normalizeHkgovAlsNumber(row.identityNumberFrom)
  const to = normalizeHkgovAlsNumber(row.identityNumberTo)
  return from != null && (to == null || from === to)
}

function hkgovAlsRangeHasSingletonEndpoint(
  range: PreparedHkgovAlsRow,
  singleton: PreparedHkgovAlsRow,
) {
  const singletonNumber = normalizeHkgovAlsNumber(singleton.identityNumberFrom)
  const rangeFrom = normalizeHkgovAlsNumber(range.identityNumberFrom)
  const rangeTo = normalizeHkgovAlsNumber(range.identityNumberTo)
  return (
    singletonNumber != null &&
    (singletonNumber === rangeFrom || singletonNumber === rangeTo)
  )
}

function normalizeHkgovAlsNumber(value: string | null) {
  return value?.normalize('NFKC').trim().toUpperCase() || null
}

export function dedupeHkgovAlsSourceFeatures(sourceFeatures: HkgovAlsSourceFeature[]) {
  const featureByExactJson = new Map<string, HkgovAlsSourceFeature>()
  const occurrencesByExactJson = new Map<string, HkgovAlsSourceFeature[]>()

  for (const sourceFeature of sourceFeatures) {
    const exactJson = JSON.stringify(sourceFeature.feature)
    if (!featureByExactJson.has(exactJson)) {
      featureByExactJson.set(exactJson, sourceFeature)
    }
    const occurrences = occurrencesByExactJson.get(exactJson) ?? []
    occurrences.push(sourceFeature)
    occurrencesByExactJson.set(exactJson, occurrences)
  }

  const duplicateGroups = [...occurrencesByExactJson.values()]
    .filter(occurrences => occurrences.length > 1)
    .map(occurrences => ({
      address: formatSourceFeatureAddress(occurrences[0]?.feature),
      occurrences: occurrences.map(occurrence => ({
        featureIndexOneBased: occurrence.featureIndexOneBased,
        sourceFile: occurrence.sourceFile,
      })),
    }))

  return {
    duplicateGroups,
    features: [...featureByExactJson.values()],
  }
}

function formatSourceFeatureAddress(feature: HkgovAlsFeature | undefined) {
  const premises = feature?.properties?.Address?.PremisesAddress
  const en = premises?.EngPremisesAddress ?? {}
  const zh = premises?.ChiPremisesAddress ?? {}
  const enVillage = en.EngVillage ?? {}
  const zhVillage = zh.ChiVillage ?? {}

  const enVillageAddress = compactAddress(
    [
      joinStreetNumberRange(enVillage.BuildingNoFrom, enVillage.BuildingNoTo, '-'),
      asOptionalString(enVillage.VillageName),
      asOptionalString(enVillage.LocationName),
      asOptionalString(en.EngDistrict),
      asOptionalString(en.Region),
    ],
    ', ',
  )
  if (
    enVillageAddress &&
    !en.BuildingName &&
    !en.EngEstate?.EstateName &&
    !en.EngStreet?.StreetName
  ) {
    return enVillageAddress
  }

  const zhVillageAddress = compactAddress(
    [
      joinStreetNumberRange(zhVillage.BuildingNoFrom, zhVillage.BuildingNoTo, ''),
      asOptionalString(zhVillage.VillageName),
      asOptionalString(zhVillage.LocationName),
      asOptionalString(zh.ChiDistrict),
      asOptionalString(zh.Region),
    ],
    '',
  )
  if (
    zhVillageAddress &&
    !zh.BuildingName &&
    !zh.ChiEstate?.EstateName &&
    !zh.ChiStreet?.StreetName
  ) {
    return zhVillageAddress
  }

  return (
    formatEnPremisesAddress(en) ??
    formatZhPremisesAddress(zh) ??
    'Unformatted ALS address'
  )
}

/**
 * Handles non-byte-identical ALS source variants that nevertheless describe exactly
 * the same fully specified premise. This is deliberately narrower than a spatial or
 * street-address dedupe: every component in the stable premise identity must match.
 */
export function consolidateEquivalentHkgovAlsPremises(rows: PreparedHkgovAlsRow[]) {
  const selectedRows: PreparedHkgovAlsRow[] = []
  const rowsByIdentity = new Map<string, PreparedHkgovAlsRow[]>()
  for (const row of rows) {
    const equivalentRows = rowsByIdentity.get(row.identityKey) ?? []
    equivalentRows.push(row)
    rowsByIdentity.set(row.identityKey, equivalentRows)
  }
  const equivalentGroups = [...rowsByIdentity.values()]
  const duplicateGroups = equivalentGroups
    .filter(equivalentRows => equivalentRows.length > 1)
    .map(equivalentRows => ({
      address:
        equivalentRows[0]?.enFormattedAddress ??
        equivalentRows[0]?.zhHantFormattedAddress ??
        'Unformatted ALS address',
      occurrences: equivalentRows.map(row => ({
        featureIndexOneBased: row.sourceFeatureIndexOneBased,
        sourceFile: row.sourceFile,
      })),
    }))
  for (const equivalentRows of equivalentGroups) {
    const firstRow = equivalentRows[0]
    if (!firstRow) continue
    if (equivalentRows.length === 1) {
      selectedRows.push(firstRow)
      continue
    }
    const indicators = new Set(
      equivalentRows.map(row => row.blockDescriptorPrecedenceIndicator),
    )
    const hasMissingAndPresentIndicator = indicators.has(null) && indicators.size > 1
    const indicatorPresentRow =
      equivalentRows.find(
        row => row.blockDescriptorPrecedenceIndicator?.toUpperCase() === 'Y',
      ) ??
      (hasMissingAndPresentIndicator
        ? equivalentRows.find(row => row.blockDescriptorPrecedenceIndicator != null)
        : undefined)
    const selectedRow = indicatorPresentRow ?? firstRow
    selectedRows.push(selectedRow ?? firstRow)
  }

  return { duplicateGroups, rows: selectedRows }
}

function assertUniquePreparedRowIds(rows: PreparedHkgovAlsRow[]) {
  const firstById = new Map<string, PreparedHkgovAlsRow>()
  for (const row of rows) {
    const first = firstById.get(row.id)
    if (!first) {
      firstById.set(row.id, row)
      continue
    }
    throw new Error(
      `ALS premise identity collision between ${first.sourceFile} #${first.sourceFeatureIndexOneBased} ` +
        `and ${row.sourceFile} #${row.sourceFeatureIndexOneBased}. ` +
        `First: ${JSON.stringify(first.identitySummary)}. ` +
        `Second: ${JSON.stringify(row.identitySummary)}. ` +
        'The source rows are not exact duplicates; expand the premise identity before ingestion.',
    )
  }
}

function normalizeHkgovAlsFeature(
  feature: HkgovAlsFeature,
  sourceFile: string,
  sourceFeatureIndexOneBased: number,
  cohortKey: string,
  sourceVersion: string,
  divisionMaps: DivisionLookupMaps,
  postProcessPremiseStructure: boolean,
): PreparedHkgovAlsRow {
  const properties = feature.properties ?? {}
  const premises = properties.Address?.PremisesAddress ?? {}
  const rawZh = premises.ChiPremisesAddress ?? {}
  const rawEn = premises.EngPremisesAddress ?? {}
  const rawEnStructure = {
    blockDescriptor: asOptionalString(rawEn.EngBlock?.BlockDescriptor),
    blockNumber: asOptionalString(rawEn.EngBlock?.BlockNo),
    buildingName: asOptionalString(rawEn.BuildingName),
    estateName: asOptionalString(rawEn.EngEstate?.EstateName),
  }
  const rawZhStructure = {
    blockDescriptor: asOptionalString(rawZh.ChiBlock?.BlockDescriptor),
    blockNumber: asOptionalString(rawZh.ChiBlock?.BlockNo),
    buildingName: asOptionalString(rawZh.BuildingName),
    estateName: asOptionalString(rawZh.ChiEstate?.EstateName),
  }
  const enStructure = postProcessPremiseStructure
    ? normalizeHkgovAlsPremiseStructure(rawEnStructure)
    : { ...rawEnStructure, normalization: 'none' as const }
  const zhStructure = postProcessPremiseStructure
    ? normalizeHkgovAlsPremiseStructure(rawZhStructure)
    : { ...rawZhStructure, normalization: 'none' as const }
  const en: HkgovLocalizedPremisesAddress = {
    ...rawEn,
    BuildingName: enStructure.buildingName,
    EngBlock: {
      ...rawEn.EngBlock,
      BlockDescriptor: enStructure.blockDescriptor,
      BlockNo: enStructure.blockNumber,
    },
    EngEstate: { ...rawEn.EngEstate, EstateName: enStructure.estateName },
  }
  const zh: HkgovLocalizedPremisesAddress = {
    ...rawZh,
    BuildingName: zhStructure.buildingName,
    ChiBlock: {
      ...rawZh.ChiBlock,
      BlockDescriptor: zhStructure.blockDescriptor,
      BlockNo: zhStructure.blockNumber,
    },
    ChiEstate: { ...rawZh.ChiEstate, EstateName: zhStructure.estateName },
  }
  const zhStreet = zh.ChiStreet ?? {}
  const enStreet = en.EngStreet ?? {}
  const zhVillage = zh.ChiVillage ?? {}
  const enVillage = en.EngVillage ?? {}
  const blockDescriptorPrecedenceIndicator = asOptionalString(
    en.EngBlock?.BlockDescriptorPrecedenceIndicator,
  )
  const geoAddress = asOptionalString(premises.GeoAddress)
  const csuId = asOptionalString(premises.BuildingCsuInformation?.CsuId)
  const identityBuildingId = csuId ?? geoAddress
  if (!identityBuildingId) {
    throw new Error(`ALS feature in ${sourceFile} is missing GeoAddress and CsuId.`)
  }
  const identityRouteNames = [
    asOptionalString(enStreet.StreetName),
    asOptionalString(enVillage.VillageName),
    asOptionalString(enVillage.LocationName),
    asOptionalString(zhStreet.StreetName),
    asOptionalString(zhVillage.VillageName),
    asOptionalString(zhVillage.LocationName),
  ].filter((value): value is string => Boolean(value))
  const identityNumberFrom =
    asOptionalString(enStreet.BuildingNoFrom) ??
    asOptionalString(enVillage.BuildingNoFrom) ??
    asOptionalString(zhStreet.BuildingNoFrom) ??
    asOptionalString(zhVillage.BuildingNoFrom)
  const identityNumberTo =
    asOptionalString(enStreet.BuildingNoTo) ??
    asOptionalString(enVillage.BuildingNoTo) ??
    asOptionalString(zhStreet.BuildingNoTo) ??
    asOptionalString(zhVillage.BuildingNoTo)
  const areaNameEn = resolveAreaNameEn(en.Region)
  const areaNameZhHant = resolveAreaNameZh(zh.Region)
  const districtNameEn = asOptionalString(en.EngDistrict)
  const districtNameZhHant = asOptionalString(zh.ChiDistrict)
  const areaId =
    resolveMappedId(divisionMaps.areaByEn, areaNameEn) ??
    resolveMappedId(divisionMaps.areaByZh, areaNameZhHant)
  const districtId =
    resolveMappedId(divisionMaps.districtByEn, districtNameEn) ??
    resolveMappedId(divisionMaps.districtByZh, districtNameZhHant)
  const coordinates =
    feature.geometry?.type === 'Point' && Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates
      : null
  const routeKind =
    enStreet.StreetName || zhStreet.StreetName
      ? 'street'
      : enVillage.VillageName ||
          enVillage.LocationName ||
          zhVillage.VillageName ||
          zhVillage.LocationName
        ? 'village'
        : 'unknown'
  const routeName =
    asOptionalString(enStreet.StreetName) ??
    asOptionalString(enVillage.VillageName) ??
    asOptionalString(enVillage.LocationName) ??
    asOptionalString(zhStreet.StreetName) ??
    asOptionalString(zhVillage.VillageName) ??
    asOptionalString(zhVillage.LocationName)
  const premiseIdentity = buildHkgovAlsPremiseIdentity({
    blockDescriptor:
      asOptionalString(en.EngBlock?.BlockDescriptor) ??
      asOptionalString(zh.ChiBlock?.BlockDescriptor),
    blockNumber:
      asOptionalString(en.EngBlock?.BlockNo) ?? asOptionalString(zh.ChiBlock?.BlockNo),
    buildingName: preferHkgovAlsEnglishCanonicalValue({
      canonicalChinese: asOptionalString(zh.BuildingName),
      canonicalEnglish: asOptionalString(en.BuildingName),
      rawEnglish: asOptionalString(rawEn.BuildingName),
    }),
    csuId,
    districtName: districtNameEn ?? districtNameZhHant,
    estateName:
      asOptionalString(en.EngEstate?.EstateName) ??
      asOptionalString(zh.ChiEstate?.EstateName),
    geoAddress,
    latitude: coordinates?.[1] ?? null,
    longitude: coordinates?.[0] ?? null,
    numberFrom: identityNumberFrom,
    numberTo: identityNumberTo,
    phaseName:
      asOptionalString(en.EngPhase?.PhaseName) ??
      asOptionalString(zh.ChiPhase?.PhaseName),
    phaseNumber:
      asOptionalString(en.EngPhase?.PhaseNo) ?? asOptionalString(zh.ChiPhase?.PhaseNo),
    routeKind,
    routeName,
    unitDescriptor:
      asOptionalString(en.EngUnit?.UnitDescriptor) ??
      asOptionalString(zh.ChiUnit?.UnitDescriptor),
    unitNumber:
      asOptionalString(en.EngUnit?.UnitNo) ?? asOptionalString(zh.ChiUnit?.UnitNo),
  })
  const provisionalId = buildHkgovAlsProvisionalId(premiseIdentity.identityKey)
  const sources =
    stringifyJson({
      hkgovAls: {
        geoAddress,
        hkgovCsuId: csuId,
        cohortKey,
        sourceFile,
        premiseNormalization: {
          en: enStructure.normalization,
          zhHant: zhStructure.normalization,
        },
      },
    }) ?? '{}'

  return {
    id: provisionalId,
    canonicalId: provisionalId,
    theme: 'addresses',
    type: 'address',
    country: 'HK',
    region: 'HK',
    cohortKey,
    sourceVersion,
    sourceFile,
    sourceFeatureIndexOneBased,
    geometry: stringifyJson(feature.geometry ?? null),
    identifiers: csuId ? stringifyJson({ hkgovCsuId: csuId }) : null,
    sources,
    divisionSnapshotId: divisionMaps.snapshotId,
    areaId,
    districtId,
    countryId: divisionMaps.countryId,
    areaNameEn,
    areaNameZhHant,
    districtNameEn,
    districtNameZhHant,
    geoAddress,
    hkgovCsuId: csuId,
    identityAlias: null,
    identityBuildingId,
    identityContinuityKey: premiseIdentity.continuityKey,
    identityKey: premiseIdentity.identityKey,
    numberlessIdentityKey: premiseIdentity.numberlessIdentityKey,
    identityMatchMethod: 'als-premise',
    blockDescriptorPrecedenceIndicator,
    identityNumberFrom,
    identityNumberTo,
    identityRouteNames: JSON.stringify(identityRouteNames),
    identitySummary: premiseIdentity.summary,
    // Preserve the official representation verbatim; canonical component fields
    // below carry the narrowly-scoped post-processing used by the service.
    chiPremisesAddressJson: stringifyJson(rawZh),
    engPremisesAddressJson: stringifyJson(rawEn),
    zhHantFormattedAddress: formatZhPremisesAddress(zh),
    zhHantRegion: asOptionalString(zh.Region),
    zhHantDistrict: districtNameZhHant,
    zhHantEstateName: asOptionalString(zh.ChiEstate?.EstateName),
    zhHantBuildingName: asOptionalString(zh.BuildingName),
    zhHantBlockDescriptor: asOptionalString(zh.ChiBlock?.BlockDescriptor),
    zhHantBlockNumber: asOptionalString(zh.ChiBlock?.BlockNo),
    zhHantStreetName: asOptionalString(zhStreet.StreetName),
    zhHantStreetNumberFrom: asOptionalString(zhStreet.BuildingNoFrom),
    zhHantStreetNumberTo: asOptionalString(zhStreet.BuildingNoTo),
    enFormattedAddress: formatEnPremisesAddress(en),
    enRegion: asOptionalString(en.Region),
    enDistrict: districtNameEn,
    enEstateName: asOptionalString(en.EngEstate?.EstateName),
    enBuildingName: asOptionalString(en.BuildingName),
    enBlockDescriptor: asOptionalString(en.EngBlock?.BlockDescriptor),
    enBlockNumber: asOptionalString(en.EngBlock?.BlockNo),
    enStreetName: asOptionalString(enStreet.StreetName),
    enStreetNumberFrom: asOptionalString(enStreet.BuildingNoFrom),
    enStreetNumberTo: asOptionalString(enStreet.BuildingNoTo),
    easting: asOptionalInteger(properties.Easting),
    northing: asOptionalInteger(properties.Northing),
  }
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

async function loadDivisionLookupMaps(options: {
  currentDb?: CurrentDatabase
  cohortKey: string
  dbPath?: string
  environment: UploadEnvironment
  metaDb?: MetaDatabase
}): Promise<DivisionLookupMaps> {
  if (options.currentDb && options.metaDb) {
    const snapshot = await options.metaDb
      .select({ id: metaSchema.metaSnapshots.id })
      .from(metaSchema.metaSnapshots)
      .innerJoin(
        metaSchema.metaSnapshotLineages,
        eq(
          metaSchema.metaSnapshots.snapshotLineageId,
          metaSchema.metaSnapshotLineages.id,
        ),
      )
      .where(
        and(
          eq(metaSchema.metaSnapshots.resourceType, 'division'),
          eq(metaSchema.metaSnapshots.status, 'published'),
          eq(metaSchema.metaSnapshots.cohortKey, options.cohortKey),
          eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
        ),
      )
      .limit(1)
      .get()
    if (!snapshot) {
      throw new Error(
        `No published Overture division snapshot found for cohort ${options.cohortKey}.`,
      )
    }
    const rows = await options.currentDb
      .select({
        snapshotId: currentSchema.divisions.snapshotId,
        id: currentSchema.divisions.id,
        level: currentSchema.divisions.level,
        type: currentSchema.divisions.type,
        locale: currentSchema.divisionsI18n.locale,
        name: currentSchema.divisionsI18n.name,
      })
      .from(currentSchema.divisions)
      .innerJoin(
        currentSchema.divisionsI18n,
        and(
          eq(
            currentSchema.divisionsI18n.snapshotId,
            currentSchema.divisions.snapshotId,
          ),
          eq(currentSchema.divisionsI18n.divisionId, currentSchema.divisions.id),
        ),
      )
      .where(eq(currentSchema.divisions.snapshotId, snapshot.id))
      .all()
    return buildDivisionLookupMaps(rows)
  }

  const currentSource = resolveDivisionLookupSource(options)
  const snapshotSource = resolveDivisionSnapshotSource(options)
  const snapshotId =
    snapshotSource.kind === 'sqlite'
      ? loadPublishedDivisionSnapshotIdFromSqlite(
          snapshotSource.dbPath,
          options.cohortKey,
        )
      : await loadPublishedDivisionSnapshotIdFromWrangler(
          snapshotSource,
          options.cohortKey,
        )
  const rows =
    currentSource.kind === 'sqlite'
      ? loadDivisionLookupRowsFromSqlite(currentSource.dbPath, snapshotId)
      : await loadDivisionLookupRowsFromWrangler(currentSource, snapshotId)

  return buildDivisionLookupMaps(rows)
}

function loadPublishedDivisionSnapshotIdFromSqlite(
  explicitDbPath: string,
  cohortKey: string,
) {
  const databasePath = resolveLocalD1Path(explicitDbPath)
  const sqlite = new SQLiteDatabase(databasePath, { readonly: true })

  try {
    const row = sqlite
      .query(
        `
          SELECT s.id AS snapshotId
          FROM snapshots s
          INNER JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
          WHERE s.resourceType = 'division'
            AND s.status = 'published'
            AND s.cohortKey = ?
            AND sl.variant = 'overture'
          ORDER BY s.revision DESC
          LIMIT 1
        `,
      )
      .get(cohortKey) as { snapshotId: string } | null

    if (!row?.snapshotId) {
      throw new Error(
        `No published Overture division snapshot found for cohort ${cohortKey}.`,
      )
    }

    return row.snapshotId
  } finally {
    sqlite.close()
  }
}

function loadDivisionLookupRowsFromSqlite(explicitDbPath: string, snapshotId: string) {
  const databasePath = resolveLocalD1Path(explicitDbPath)
  const sqlite = new SQLiteDatabase(databasePath, { readonly: true })

  try {
    return sqlite
      .query(
        `
          SELECT d.snapshotId, d.id, d.level, d.type, di.locale, di.name
          FROM divisions d
          JOIN divisionsI18n di
            ON di.snapshotId = d.snapshotId
           AND di.divisionId = d.id
          WHERE d.snapshotId = ?
            AND di.locale IN ('en', 'zh-hant')
        `,
      )
      .all(snapshotId) as Array<DivisionLookupRow>
  } finally {
    sqlite.close()
  }
}

async function loadDivisionLookupRowsFromWrangler(
  target: Extract<DivisionLookupSource, { kind: 'wrangler' }>,
  snapshotId: string,
) {
  const args = [
    'x',
    'wrangler',
    'd1',
    'execute',
    target.databaseName,
    `--${target.mode}`,
    '--config',
    HARBOUR_API_WRANGLER_CONFIG,
    '--env',
    target.wranglerEnv,
    '--json',
    '--command',
    `
      SELECT d.snapshotId, d.id, d.level, d.type, di.locale, di.name
      FROM divisions d
      JOIN divisionsI18n di
        ON di.snapshotId = d.snapshotId
       AND di.divisionId = d.id
      WHERE d.snapshotId = '${snapshotId}'
        AND di.locale IN ('en', 'zh-hant')
    `,
  ]

  const process = Bun.spawn({
    cmd: ['bun', ...args],
    cwd: resolve(import.meta.dir, '../../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(
      `Failed to query divisions from ${target.wranglerEnv} D1.\n${stderr.trim() || stdout.trim()}`,
    )
  }

  const payload = JSON.parse(stdout) as Array<{
    results?: DivisionLookupRow[]
    success?: boolean
  }>
  const firstResult = payload[0]

  if (!firstResult?.success || !Array.isArray(firstResult.results)) {
    throw new Error(
      `Unexpected Wrangler D1 response for ${target.wranglerEnv} environment.`,
    )
  }

  return firstResult.results
}

async function loadPublishedDivisionSnapshotIdFromWrangler(
  target: Extract<DivisionLookupSource, { kind: 'wrangler' }>,
  cohortKey: string,
) {
  const metaDatabaseName =
    target.wranglerEnv === 'production' ? 'ss-meta-db-prod' : 'ss-meta-db-preview'
  const args = [
    'x',
    'wrangler',
    'd1',
    'execute',
    metaDatabaseName,
    `--${target.mode}`,
    '--config',
    HARBOUR_API_WRANGLER_CONFIG,
    '--env',
    target.wranglerEnv,
    '--json',
    '--command',
    `
      SELECT s.id AS snapshotId
      FROM snapshots s
      INNER JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
      WHERE s.resourceType = 'division'
        AND s.status = 'published'
        AND s.cohortKey = ${sqlLiteral(cohortKey)}
        AND sl.variant = 'overture'
      ORDER BY s.revision DESC
      LIMIT 1
    `,
  ]

  const process = Bun.spawn({
    cmd: ['bun', ...args],
    cwd: resolve(import.meta.dir, '../../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(
      `Failed to query division snapshot from ${target.wranglerEnv} meta D1.\n${stderr.trim() || stdout.trim()}`,
    )
  }

  const payload = JSON.parse(stdout) as Array<{
    results?: Array<{
      snapshotId?: string
    }>
    success?: boolean
  }>
  const firstResult = payload[0]
  const snapshotId = firstResult?.results?.[0]?.snapshotId

  if (!firstResult?.success || !snapshotId) {
    throw new Error(
      `No published Overture division snapshot found for cohort ${cohortKey} in ${target.wranglerEnv} meta D1.`,
    )
  }

  return snapshotId
}

export function resolveDivisionLookupSource(
  options: {
    dbPath?: string
    environment: UploadEnvironment
  },
  resolveLocalDbPath: (explicitPath?: string) => string = resolveLocalD1Path,
): DivisionLookupSource {
  if (options.dbPath) {
    return {
      dbPath: resolveLocalDbPath(options.dbPath),
      kind: 'sqlite',
    }
  }

  if (options.environment === 'dev') {
    return {
      dbPath: resolveLocalDbPath(),
      kind: 'sqlite',
    }
  }

  if (options.environment === 'production') {
    return {
      databaseName: 'ss-current-db-prod',
      kind: 'wrangler',
      mode: 'remote',
      wranglerEnv: 'production',
    }
  }

  return {
    databaseName: 'ss-current-db-preview',
    kind: 'wrangler',
    mode: 'remote',
    wranglerEnv: 'preview',
  }
}

function resolveLocalMetaD1Path(explicitPath?: string) {
  const databasePath = resolveLocalD1Path(explicitPath)

  return join(dirname(databasePath), 'metadata.sqlite')
}

export function resolveDivisionSnapshotSource(
  options: {
    dbPath?: string
    environment: UploadEnvironment
  },
  resolveLocalMetaDbPath: (explicitPath?: string) => string = resolveLocalMetaD1Path,
) {
  if (options.dbPath || options.environment === 'dev') {
    return {
      dbPath: resolveLocalMetaDbPath(options.dbPath),
      kind: 'sqlite',
    } satisfies DivisionLookupSource
  }

  return {
    databaseName:
      options.environment === 'production' ? 'ss-meta-db-prod' : 'ss-meta-db-preview',
    kind: 'wrangler',
    mode: 'remote',
    wranglerEnv: options.environment === 'production' ? 'production' : 'preview',
  } satisfies DivisionLookupSource
}

type DivisionLookupRow = {
  snapshotId: string
  id: string
  level: number
  locale: string
  name: string | null
  type: string
}

function buildDivisionLookupMaps(rows: Array<DivisionLookupRow>): DivisionLookupMaps {
  const areaByEn = new Map<string, string>()
  const areaByZh = new Map<string, string>()
  const districtByEn = new Map<string, string>()
  const districtByZh = new Map<string, string>()
  let countryId: string | null = null
  const snapshotId = rows[0]?.snapshotId ?? null

  if (!snapshotId) {
    throw new Error('No published division snapshot found in current database.')
  }

  for (const row of rows) {
    if (!row.name) {
      continue
    }

    if (row.level === 1 || row.type === 'area') {
      if (row.locale === 'en') {
        areaByEn.set(normalizeEnKey(row.name), row.id)
      }

      if (row.locale === 'zh-hant') {
        areaByZh.set(normalizeZhKey(row.name), row.id)
      }
    }

    if (row.level === 2 || row.type === 'district') {
      if (row.locale === 'en') {
        districtByEn.set(normalizeEnKey(row.name), row.id)
      }

      if (row.locale === 'zh-hant') {
        districtByZh.set(normalizeZhKey(row.name), row.id)
      }
    }

    if (row.level === 0 && row.locale === 'en') {
      const normalized = normalizeEnKey(row.name)

      if (COUNTRY_NAME_ALIASES.some(alias => normalized === normalizeEnKey(alias))) {
        countryId = row.id
      }
    }
  }

  return {
    areaByEn,
    areaByZh,
    countryId,
    districtByEn,
    districtByZh,
    snapshotId,
  }
}

function resolveMappedId(map: Map<string, string>, name: string | null) {
  if (!name) {
    return null
  }

  return map.get(normalizeEnKey(name)) ?? map.get(normalizeZhKey(name)) ?? null
}

function resolveAreaNameEn(value: unknown) {
  const normalized = asOptionalString(value)

  if (!normalized) {
    return null
  }

  return AREA_NAME_ALIASES_EN.get(normalizeEnKey(normalized)) ?? normalized
}

function resolveAreaNameZh(value: unknown) {
  const normalized = asOptionalString(value)

  if (!normalized) {
    return null
  }

  return AREA_NAME_ALIASES_ZH.get(normalizeZhKey(normalized)) ?? normalized
}

function formatZhPremisesAddress(address: HkgovLocalizedPremisesAddress) {
  const street = address.ChiStreet ?? {}
  const block = address.ChiBlock ?? {}
  const parts = [
    asOptionalString(address.BuildingName),
    compactAddress(
      [asOptionalString(block.BlockDescriptor), asOptionalString(block.BlockNo)],
      '',
    ),
    asOptionalString(address.ChiEstate?.EstateName),
    joinStreetNumberRange(street.BuildingNoFrom, street.BuildingNoTo, ''),
    asOptionalString(street.StreetName),
    asOptionalString(address.ChiDistrict),
    asOptionalString(address.Region),
  ]

  return compactAddress(parts, '')
}

function formatEnPremisesAddress(address: HkgovLocalizedPremisesAddress) {
  const street = address.EngStreet ?? {}
  const block = address.EngBlock ?? {}
  const streetLine = compactAddress(
    [
      joinStreetNumberRange(street.BuildingNoFrom, street.BuildingNoTo, '-'),
      asOptionalString(street.StreetName),
    ],
    ' ',
  )
  const parts = [
    asOptionalString(address.BuildingName),
    compactAddress(
      [asOptionalString(block.BlockDescriptor), asOptionalString(block.BlockNo)],
      ' ',
    ),
    asOptionalString(address.EngEstate?.EstateName),
    streetLine,
    asOptionalString(address.EngDistrict),
    asOptionalString(address.Region),
  ]

  return compactAddress(parts, ', ')
}

function compactAddress(parts: Array<string | null>, separator: string) {
  const filtered = parts.filter((value): value is string => Boolean(value))
  return filtered.length > 0 ? filtered.join(separator) : null
}

function joinStreetNumberRange(
  from: unknown,
  to: unknown,
  separator: string,
): string | null {
  const fromValue = asOptionalString(from)
  const toValue = asOptionalString(to)

  if (!fromValue && !toValue) {
    return null
  }

  if (fromValue && toValue && fromValue !== toValue) {
    return `${fromValue}${separator}${toValue}`
  }

  return fromValue ?? toValue
}

function asOptionalString(value: unknown) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asOptionalInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.trunc(value)
}

function normalizeEnKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

function normalizeZhKey(value: string) {
  return value.trim().replace(/\s+/g, '')
}

function stringifyJson(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  return JSON.stringify(value)
}

function stringColumn(name: string, data: Array<string | null>, nullable = true) {
  return {
    name,
    data,
    nullable,
    type: 'STRING' as const,
  }
}

function jsonColumn(name: string, data: Array<string | null>, nullable = true) {
  return {
    name,
    data,
    nullable,
    type: 'STRING' as const,
  }
}

function int32Column(name: string, data: Array<number | null>, nullable = true) {
  return {
    name,
    data,
    nullable,
    type: 'INT32' as const,
  }
}
