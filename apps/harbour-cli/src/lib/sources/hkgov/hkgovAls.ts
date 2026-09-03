import { globSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import { Database as SQLiteDatabase } from 'bun:sqlite'
import { and, eq } from 'drizzle-orm'
import { parquetWriteFile } from 'hyparquet-writer'
import { resolveLocalD1Path } from '@repo/core/testing/localDb'
import {
  currentSchema,
  historySchema,
  metaSchema,
  type CurrentDatabase,
  type HistoryDatabase,
  type MetaDatabase,
} from '@repo/db'

import type { UploadEnvironment } from '../../cli/options.ts'
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
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import {
  collectHkgovAlsRomanNumeralBuildingNameFamilies,
  collectHkgovAlsRomanNumeralPremiseNumberFamilies,
  normaliseHkgovAlsBuildingNameRomanNumeral,
  normaliseHkgovAlsPremiseNumberRomanNumeral,
  normaliseHkgovAlsPremiseStructure,
  preferHkgovAlsEnglishCanonicalValue,
} from './hkgovAlsPremiseNormalisation.ts'
import type { AddressDivisionQualityCounts } from '@repo/core/pipeline/services/stats'
const HARBOUR_API_WRANGLER_CONFIG = resolve(
  import.meta.dir,
  '../../../../../harbour-api/wrangler.jsonc',
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
  historyDb?: HistoryDatabase
  identityDecisions?: HkgovAlsIdentityDecisions
  identityHistory?: HkgovAlsIdentityHistory
  metaDb?: MetaDatabase
  outputFile: string
  cohortKey: string
  divisionCohortKey?: string
  sourceDir: string
  sourceVersion: string
  postProcessPremiseStructure?: boolean
  writeOutput?: boolean
}

type DivisionLookupMaps = {
  areaByEn: Map<string, string>
  areaByZh: Map<string, string>
  ambiguousAreaEn: Set<string>
  ambiguousAreaZh: Set<string>
  countryId: string | null
  districtByEn: Map<string, string>
  districtByZh: Map<string, string>
  ambiguousDistrictEn: Set<string>
  ambiguousDistrictZh: Set<string>
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
  canonicalRecord?: Record<string, unknown>
  ignoredRecords?: Array<Record<string, unknown>>
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
  ChiPremisesAddress?: HkgovLocalisedPremisesAddress | null
  EngPremisesAddress?: HkgovLocalisedPremisesAddress | null
  GeoAddress?: string | null
}

type HkgovLocalisedPremisesAddress = {
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
  areaMatchStatus: HkgovAlsDivisionMatchStatus
  districtId: string | null
  districtMatchStatus: HkgovAlsDivisionMatchStatus
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
  identityMatchMethod: string
  identityPreviousSummary?: Record<string, string | null>
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
  zhHantPhaseName: string | null
  zhHantPhaseRef: string | null
  zhHantStreetName: string | null
  zhHantStreetNumberFrom: string | null
  zhHantStreetNumberTo: string | null
  zhHantVillageName: string | null
  zhHantVillageNumberFrom: string | null
  zhHantVillageNumberTo: string | null
  enFormattedAddress: string | null
  enRegion: string | null
  enDistrict: string | null
  enEstateName: string | null
  enBuildingName: string | null
  enBuildingNameRomanNumeralNormalisation: {
    from: string
    to: string
  } | null
  enBlockDescriptor: string | null
  enBlockNumber: string | null
  enBlockNumberRomanNumeralNormalisation: {
    from: string
    to: string
  } | null
  enStreetName: string | null
  enStreetNumberFrom: string | null
  enStreetNumberTo: string | null
  enVillageName: string | null
  enVillageNumberFrom: string | null
  enVillageNumberTo: string | null
  enPhaseName: string | null
  enPhaseRef: string | null
  easting: number | null
  northing: number | null
}

type PreparedHkgovAlsResult = {
  deduplicatedFeatureCount: number
  driftCandidates: HkgovAlsIdentityDriftCandidate[]
  featureCount: number
  identityConsolidatedFeatureCount: number
  identityEquivalentFeatureGroups: HkgovAlsSourceDuplicateGroup[]
  resolvedIdConsolidatedFeatureCount: number
  identityRecords: HkgovAlsIdentityRecord[]
  outputFile: string
  processingActions: ReleaseProcessingAction[]
  sourceDuplicateFeatureGroups: HkgovAlsSourceDuplicateGroup[]
  sourceFileCount: number
  divisionQuality: HkgovAlsDivisionQuality
}

export type HkgovAlsDivisionMatchStatus = 'ambiguous' | 'matched' | 'unmatched'

export type HkgovAlsDivisionQualityIssue = {
  address: string
  areaName: string | null
  areaStatus: HkgovAlsDivisionMatchStatus
  districtName: string | null
  districtStatus: HkgovAlsDivisionMatchStatus
  sourceFeatureIndexOneBased: number
  sourceFile: string
}

export type HkgovAlsDivisionQuality = AddressDivisionQualityCounts & {
  issues: HkgovAlsDivisionQualityIssue[]
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
    historyDb: options.historyDb,
    dbPath: options.dbPath,
    environment: options.environment,
    metaDb: options.metaDb,
    cohortKey: options.divisionCohortKey ?? options.cohortKey,
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
  const romanNumeralBuildingNameFamilies =
    options.postProcessPremiseStructure !== false
      ? collectHkgovAlsRomanNumeralBuildingNameFamilies(
          uniqueSourceFeatures.map(
            sourceFeature =>
              sourceFeature.feature.properties?.Address?.PremisesAddress
                ?.EngPremisesAddress?.BuildingName,
          ),
        )
      : new Map<string, string>()
  const romanNumeralPremiseNumberFamilies =
    options.postProcessPremiseStructure !== false
      ? collectHkgovAlsRomanNumeralPremiseNumberFamilies(
          uniqueSourceFeatures.map(sourceFeature => {
            const premises = sourceFeature.feature.properties?.Address?.PremisesAddress
            const en = premises?.EngPremisesAddress
            const buildingName = asOptionalString(en?.BuildingName)
            const buildingNameNormalisation = normaliseHkgovAlsBuildingNameRomanNumeral(
              {
                buildingName,
                romanNumeralFamilies: romanNumeralBuildingNameFamilies,
              },
            )
            return normaliseHkgovAlsPremiseStructure({
              blockDescriptor: asOptionalString(en?.EngBlock?.BlockDescriptor),
              blockNumber: asOptionalString(en?.EngBlock?.BlockNo),
              buildingName: buildingNameNormalisation?.to ?? buildingName,
              estateName: asOptionalString(en?.EngEstate?.EstateName),
            })
          }),
        )
      : new Map<string, string>()
  const rows = uniqueSourceFeatures.map(sourceFeature =>
    normaliseHkgovAlsFeature(
      sourceFeature.feature,
      sourceFeature.sourceFile,
      sourceFeature.featureIndexOneBased,
      options.cohortKey,
      options.sourceVersion,
      divisionMaps,
      options.postProcessPremiseStructure !== false,
      romanNumeralBuildingNameFamilies,
      romanNumeralPremiseNumberFamilies,
    ),
  )
  const {
    duplicateGroups: identityEquivalentFeatureGroups,
    rows: identityDistinctRows,
  } = consolidateEquivalentHkgovAlsPremises(rows)
  rows.splice(0, rows.length, ...identityDistinctRows)
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
    row.identityPreviousSummary = drift.resolvedPreviousRecords.get(
      row.identityKey,
    )?.summary
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
  const divisionQuality = buildHkgovAlsDivisionQuality(rows)

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
          'zhHantVillageName',
          rows.map(row => row.zhHantVillageName),
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
        stringColumn(
          'enVillageName',
          rows.map(row => row.enVillageName),
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
    resolvedIdConsolidatedFeatureCount:
      identityDistinctRows.length - resolvedIdDistinctRows.length,
    identityRecords: resolvedIdentityRecords,
    outputFile,
    processingActions: buildHkgovAlsProcessingActions({
      decisions: options.identityDecisions ?? emptyHkgovAlsIdentityDecisions(),
      identityEquivalentFeatureGroups,
      resolvedRows: rows,
      sourceDuplicateFeatureGroups,
    }),
    sourceDuplicateFeatureGroups,
    sourceFileCount: inputFiles.length,
    divisionQuality,
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

export function buildHkgovAlsProcessingActions(input: {
  decisions: HkgovAlsIdentityDecisions
  identityEquivalentFeatureGroups: HkgovAlsSourceDuplicateGroup[]
  resolvedRows: PreparedHkgovAlsRow[]
  sourceDuplicateFeatureGroups: HkgovAlsSourceDuplicateGroup[]
}): ReleaseProcessingAction[] {
  const rowsBySourceLocation = new Map(
    input.resolvedRows.map(row => [
      `${row.sourceFile}\u0000${row.sourceFeatureIndexOneBased}`,
      row,
    ]),
  )
  const actionsForGroups = (
    action: string,
    summary: string,
    groups: HkgovAlsSourceDuplicateGroup[],
  ): ReleaseProcessingAction[] =>
    groups.flatMap(group => {
      const affectedRecordCount = Math.max(0, group.occurrences.length - 1)
      if (affectedRecordCount === 0) return []

      return [
        {
          action,
          affectedRecordCount,
          evidence: (() => {
            const canonicalRow = group.occurrences
              .map(occurrence =>
                rowsBySourceLocation.get(
                  `${occurrence.sourceFile}\u0000${occurrence.featureIndexOneBased}`,
                ),
              )
              .find((row): row is PreparedHkgovAlsRow => row != null)
            const canonicalRecord =
              group.canonicalRecord ??
              (canonicalRow ? summariseHkgovAlsProcessingRow(canonicalRow) : null)
            const ignoredRecords = group.ignoredRecords ?? group.occurrences.slice(1)
            return {
              address: group.address,
              canonicalRecord,
              ignoredRecords,
              differences:
                action === 'als_equivalent_premise_variant_consolidated'
                  ? ignoredRecords.flatMap(ignoredRecord =>
                      describeHkgovAlsEvidenceDifferences(
                        processingRecord(ignoredRecord)?.sourceRepresentation,
                        processingRecord(canonicalRecord)?.sourceRepresentation,
                      ),
                    )
                  : undefined,
            }
          })(),
          mode: 'automatic' as const,
          summary,
        },
      ]
    })

  const actions = [
    ...actionsForGroups(
      'als_exact_source_duplicate_removed',
      'Removed byte-identical ALS GeoJSON feature duplicates.',
      input.sourceDuplicateFeatureGroups,
    ),
    ...actionsForGroups(
      'als_equivalent_premise_variant_consolidated',
      'Consolidated ALS variants with the same complete premise identity.',
      input.identityEquivalentFeatureGroups,
    ),
  ]

  const decisionByCurrentIdentityKey = new Map(
    input.decisions.decisions.map(decision => [decision.currentIdentityKey, decision]),
  )
  const manualRows = input.resolvedRows.filter(
    row => row.identityMatchMethod === 'als-drift-decision',
  )
  if (manualRows.length > 0) {
    actions.push(
      ...manualRows.map(row => ({
        action: 'als_identity_drift_decision',
        affectedRecordCount: 1,
        evidence: {
          canonicalRecord: summariseHkgovAlsProcessingRow(row),
          decision: decisionByCurrentIdentityKey.get(row.identityKey) ?? null,
          previousIdentity: row.identityPreviousSummary ?? null,
        },
        mode: 'manual' as const,
        summary: 'Applied a reviewed ALS premise-identity continuity decision.',
      })),
    )
  }

  const historyMatchedRows = input.resolvedRows.filter(
    row => row.identityMatchMethod === 'als-identity-history',
  )
  if (historyMatchedRows.length > 0) {
    actions.push(
      ...historyMatchedRows.map(row => ({
        action: 'als_identity_history_matched',
        affectedRecordCount: 1,
        evidence: {
          canonicalRecord: summariseHkgovAlsProcessingRow(row),
          previousIdentity: row.identityPreviousSummary ?? null,
        },
        mode: 'automatic' as const,
        summary: 'Reused the canonical ALS ID for a previously seen identity.',
      })),
    )
  }

  for (const [matchMethod, action, summary] of [
    [
      'als-address-component-withdrawal',
      'als_address_component_withdrawal_matched',
      'Retained an ALS ID after an address component was dropped.',
    ],
    [
      'als-building-estate-reassignment',
      'als_building_estate_reassignment_matched',
      'Retained an ALS ID after an identical name moved between building and estate.',
    ],
    [
      'als-building-name-detail',
      'als_building_name_detail_matched',
      'Retained an ALS ID after a non-material building-name detail was added.',
    ],
    [
      'als-building-site-part-reassignment',
      'als_building_site_part_reassignment_matched',
      'Retained an ALS ID after a site-part qualifier moved into structured fields.',
    ],
  ] as const) {
    const matchedRows = input.resolvedRows.filter(
      row => row.identityMatchMethod === matchMethod,
    )
    if (matchedRows.length === 0) continue
    actions.push(
      ...matchedRows.map(row => {
        const droppedField = Object.entries(row.identityPreviousSummary ?? {}).find(
          ([field, value]) =>
            ['buildingName', 'estateName', 'phaseName'].includes(field) &&
            value != null &&
            row.identitySummary[field] == null,
        )
        return {
          action,
          affectedRecordCount: 1,
          evidence:
            matchMethod === 'als-address-component-withdrawal' && droppedField
              ? {
                  canonicalRecord: summariseHkgovAlsProcessingRow(row),
                  droppedComponent: {
                    field: droppedField[0],
                    value: droppedField[1],
                  },
                }
              : summariseHkgovAlsProcessingRow(row),
          mode: 'automatic' as const,
          summary,
        }
      }),
    )
  }

  for (const row of input.resolvedRows) {
    const buildingName = row.enBuildingNameRomanNumeralNormalisation
    if (!buildingName) continue
    actions.push({
      action: 'als_building_name_roman_numeral_normalised',
      affectedRecordCount: 1,
      evidence: {
        buildingName,
        canonicalRecord: summariseHkgovAlsProcessingRow(row),
      },
      mode: 'automatic' as const,
      summary:
        'Styled an ALS building-name number as Roman numerals used by its building-name family.',
    })
  }

  for (const row of input.resolvedRows) {
    const blockNumber = row.enBlockNumberRomanNumeralNormalisation
    if (!blockNumber) continue
    actions.push({
      action: 'als_premise_number_roman_numeral_normalised',
      affectedRecordCount: 1,
      evidence: {
        canonicalRecord: summariseHkgovAlsProcessingRow(row),
        premiseNumber: {
          descriptor: row.enBlockDescriptor,
          ...blockNumber,
        },
      },
      mode: 'automatic' as const,
      summary:
        'Styled an ALS BLOCK, HOUSE or TOWER number as Roman numerals used by its premise family.',
    })
  }

  return actions
}

function summariseHkgovAlsProcessingRow(row: PreparedHkgovAlsRow) {
  return {
    canonicalId: row.canonicalId,
    formattedAddress: {
      en: row.enFormattedAddress,
      zhHant: row.zhHantFormattedAddress,
    },
    identity: row.identitySummary,
    identityKey: row.identityKey,
    identityMatchMethod: row.identityMatchMethod,
    sourcePremises: {
      en: parseHkgovAlsSourceJson(row.engPremisesAddressJson),
      zhHant: parseHkgovAlsSourceJson(row.chiPremisesAddressJson),
    },
    sourceRepresentation: {
      easting: row.easting,
      geometry: parseHkgovAlsJson(row.geometry),
      northing: row.northing,
      premises: {
        en: parseHkgovAlsSourceJson(row.engPremisesAddressJson),
        zhHant: parseHkgovAlsSourceJson(row.chiPremisesAddressJson),
      },
    },
    source: {
      featureIndexOneBased: row.sourceFeatureIndexOneBased,
      file: row.sourceFile,
    },
  }
}

function parseHkgovAlsSourceJson(value: string | null) {
  if (!value) return null
  return JSON.parse(value) as Record<string, unknown>
}

function parseHkgovAlsJson(value: string | null) {
  if (!value) return null
  return JSON.parse(value) as unknown
}

function processingRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function describeHkgovAlsEvidenceDifferences(
  previous: unknown,
  current: unknown,
  path = '',
): Array<{ field: string; oldValue: string; newValue: string }> {
  const previousRecord = processingRecord(previous)
  const currentRecord = processingRecord(current)
  if (previousRecord || currentRecord) {
    const keys = new Set([
      ...Object.keys(previousRecord ?? {}),
      ...Object.keys(currentRecord ?? {}),
    ])
    return [...keys].flatMap(key =>
      describeHkgovAlsEvidenceDifferences(
        previousRecord?.[key],
        currentRecord?.[key],
        path ? `${path}.${key}` : key,
      ),
    )
  }

  const oldValue = processingEvidenceValue(previous)
  const newValue = processingEvidenceValue(current)
  return oldValue === newValue ? [] : [{ field: path, oldValue, newValue }]
}

function processingEvidenceValue(value: unknown) {
  if (value == null) return '—'
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value)
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
  const duplicateGroups: HkgovAlsSourceDuplicateGroup[] = []
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
    if (equivalentRows.length > 1) {
      duplicateGroups.push({
        address:
          selectedRow.enFormattedAddress ??
          selectedRow.zhHantFormattedAddress ??
          'Unformatted ALS address',
        canonicalRecord: summariseHkgovAlsProcessingRow(selectedRow),
        ignoredRecords: equivalentRows
          .filter(row => row !== selectedRow)
          .map(summariseHkgovAlsProcessingRow),
        occurrences: equivalentRows.map(row => ({
          featureIndexOneBased: row.sourceFeatureIndexOneBased,
          sourceFile: row.sourceFile,
        })),
      })
    }
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

export function buildHkgovAlsDivisionQuality(
  rows: readonly Pick<
    PreparedHkgovAlsRow,
    | 'areaMatchStatus'
    | 'areaNameEn'
    | 'areaNameZhHant'
    | 'districtMatchStatus'
    | 'districtNameEn'
    | 'districtNameZhHant'
    | 'enFormattedAddress'
    | 'sourceFeatureIndexOneBased'
    | 'sourceFile'
    | 'zhHantFormattedAddress'
  >[],
): HkgovAlsDivisionQuality {
  const quality: HkgovAlsDivisionQuality = {
    ambiguous_area_count: 0,
    ambiguous_district_count: 0,
    unmatched_area_count: 0,
    unmatched_district_count: 0,
    issues: [],
  }

  for (const row of rows) {
    if (row.areaMatchStatus === 'ambiguous') quality.ambiguous_area_count += 1
    if (row.areaMatchStatus === 'unmatched') quality.unmatched_area_count += 1
    if (row.districtMatchStatus === 'ambiguous') quality.ambiguous_district_count += 1
    if (row.districtMatchStatus === 'unmatched') quality.unmatched_district_count += 1

    if (row.areaMatchStatus === 'matched' && row.districtMatchStatus === 'matched') {
      continue
    }

    quality.issues.push({
      address:
        row.enFormattedAddress ??
        row.zhHantFormattedAddress ??
        'Unformatted ALS address',
      areaName: row.areaNameEn ?? row.areaNameZhHant,
      areaStatus: row.areaMatchStatus,
      districtName: row.districtNameEn ?? row.districtNameZhHant,
      districtStatus: row.districtMatchStatus,
      sourceFeatureIndexOneBased: row.sourceFeatureIndexOneBased,
      sourceFile: row.sourceFile,
    })
  }

  return quality
}

function normaliseHkgovAlsFeature(
  feature: HkgovAlsFeature,
  sourceFile: string,
  sourceFeatureIndexOneBased: number,
  cohortKey: string,
  sourceVersion: string,
  divisionMaps: DivisionLookupMaps,
  postProcessPremiseStructure: boolean,
  romanNumeralBuildingNameFamilies: ReadonlyMap<string, string>,
  romanNumeralPremiseNumberFamilies: ReadonlyMap<string, string>,
): PreparedHkgovAlsRow {
  const properties = feature.properties ?? {}
  const premises = properties.Address?.PremisesAddress ?? {}
  const rawZh = premises.ChiPremisesAddress ?? {}
  const rawEn = premises.EngPremisesAddress ?? {}
  const enBuildingNameRomanNumeralNormalisation = postProcessPremiseStructure
    ? normaliseHkgovAlsBuildingNameRomanNumeral({
        buildingName: asOptionalString(rawEn.BuildingName),
        romanNumeralFamilies: romanNumeralBuildingNameFamilies,
      })
    : null
  const rawEnStructure = {
    blockDescriptor: asOptionalString(rawEn.EngBlock?.BlockDescriptor),
    blockNumber: asOptionalString(rawEn.EngBlock?.BlockNo),
    buildingName:
      enBuildingNameRomanNumeralNormalisation?.to ??
      asOptionalString(rawEn.BuildingName),
    estateName: asOptionalString(rawEn.EngEstate?.EstateName),
  }
  const rawZhStructure = {
    blockDescriptor: asOptionalString(rawZh.ChiBlock?.BlockDescriptor),
    blockNumber: asOptionalString(rawZh.ChiBlock?.BlockNo),
    buildingName: asOptionalString(rawZh.BuildingName),
    estateName: asOptionalString(rawZh.ChiEstate?.EstateName),
  }
  const normalisedEnStructure = postProcessPremiseStructure
    ? normaliseHkgovAlsPremiseStructure(rawEnStructure)
    : { ...rawEnStructure, normalisation: 'none' as const }
  const enBlockNumberRomanNumeralNormalisation = postProcessPremiseStructure
    ? normaliseHkgovAlsPremiseNumberRomanNumeral({
        premise: normalisedEnStructure,
        romanNumeralFamilies: romanNumeralPremiseNumberFamilies,
      })
    : null
  const enStructure = enBlockNumberRomanNumeralNormalisation
    ? {
        ...normalisedEnStructure,
        blockNumber: enBlockNumberRomanNumeralNormalisation.to,
      }
    : normalisedEnStructure
  const zhStructure = postProcessPremiseStructure
    ? normaliseHkgovAlsPremiseStructure(rawZhStructure)
    : { ...rawZhStructure, normalisation: 'none' as const }
  const en: HkgovLocalisedPremisesAddress = {
    ...rawEn,
    BuildingName: enStructure.buildingName,
    EngBlock: {
      ...rawEn.EngBlock,
      BlockDescriptor: enStructure.blockDescriptor,
      BlockNo: enStructure.blockNumber,
    },
    EngEstate: { ...rawEn.EngEstate, EstateName: enStructure.estateName },
  }
  const zh: HkgovLocalisedPremisesAddress = {
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
  const areaMatch = resolveMappedDivision({
    byEn: divisionMaps.areaByEn,
    byZh: divisionMaps.areaByZh,
    ambiguousEn: divisionMaps.ambiguousAreaEn,
    ambiguousZh: divisionMaps.ambiguousAreaZh,
    en: areaNameEn,
    zh: areaNameZhHant,
  })
  const districtMatch = resolveMappedDivision({
    byEn: divisionMaps.districtByEn,
    byZh: divisionMaps.districtByZh,
    ambiguousEn: divisionMaps.ambiguousDistrictEn,
    ambiguousZh: divisionMaps.ambiguousDistrictZh,
    en: districtNameEn,
    zh: districtNameZhHant,
  })
  const areaId = areaMatch.id
  const districtId = districtMatch.id
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
        premiseNormalisation: {
          en: enStructure.normalisation,
          enBuildingNameRomanNumeral: enBuildingNameRomanNumeralNormalisation != null,
          enBlockNumberRomanNumeral: enBlockNumberRomanNumeralNormalisation != null,
          zhHant: zhStructure.normalisation,
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
    areaMatchStatus: areaMatch.status,
    districtId,
    districtMatchStatus: districtMatch.status,
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
    zhHantPhaseName: asOptionalString(zh.ChiPhase?.PhaseName),
    zhHantPhaseRef: asOptionalString(zh.ChiPhase?.PhaseNo),
    zhHantStreetName: asOptionalString(zhStreet.StreetName),
    zhHantStreetNumberFrom: asOptionalString(zhStreet.BuildingNoFrom),
    zhHantStreetNumberTo: asOptionalString(zhStreet.BuildingNoTo),
    zhHantVillageName:
      asOptionalString(zhVillage.VillageName) ??
      asOptionalString(zhVillage.LocationName),
    zhHantVillageNumberFrom: asOptionalString(zhVillage.BuildingNoFrom),
    zhHantVillageNumberTo: asOptionalString(zhVillage.BuildingNoTo),
    enFormattedAddress: formatEnPremisesAddress(en),
    enRegion: asOptionalString(en.Region),
    enDistrict: districtNameEn,
    enEstateName: asOptionalString(en.EngEstate?.EstateName),
    enBuildingName: asOptionalString(en.BuildingName),
    enBuildingNameRomanNumeralNormalisation,
    enBlockDescriptor: asOptionalString(en.EngBlock?.BlockDescriptor),
    enBlockNumber: asOptionalString(en.EngBlock?.BlockNo),
    enBlockNumberRomanNumeralNormalisation,
    enStreetName: asOptionalString(enStreet.StreetName),
    enStreetNumberFrom: asOptionalString(enStreet.BuildingNoFrom),
    enStreetNumberTo: asOptionalString(enStreet.BuildingNoTo),
    enVillageName:
      asOptionalString(enVillage.VillageName) ??
      asOptionalString(enVillage.LocationName),
    enVillageNumberFrom: asOptionalString(enVillage.BuildingNoFrom),
    enVillageNumberTo: asOptionalString(enVillage.BuildingNoTo),
    enPhaseName: asOptionalString(en.EngPhase?.PhaseName),
    enPhaseRef: asOptionalString(en.EngPhase?.PhaseNo),
    easting: asOptionalInteger(properties.Easting),
    northing: asOptionalInteger(properties.Northing),
  }
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

async function loadDivisionLookupMaps(options: {
  currentDb?: CurrentDatabase
  historyDb?: HistoryDatabase
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
    let rows = await options.currentDb
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
    if (rows.length === 0 && options.historyDb) {
      rows = await options.historyDb
        .select({
          snapshotId: historySchema.divisions.snapshotId,
          id: historySchema.divisions.id,
          level: historySchema.divisions.level,
          type: historySchema.divisions.type,
          locale: historySchema.divisionsI18n.locale,
          name: historySchema.divisionsI18n.name,
        })
        .from(historySchema.divisions)
        .innerJoin(
          historySchema.divisionsI18n,
          and(
            eq(historySchema.divisionsI18n.divisionId, historySchema.divisions.id),
            eq(
              historySchema.divisionsI18n.versionHash,
              historySchema.divisions.versionHash,
            ),
          ),
        )
        .where(eq(historySchema.divisions.snapshotId, snapshot.id))
        .all()
    }
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
    cwd: resolve(import.meta.dir, '../../../..'),
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
    cwd: resolve(import.meta.dir, '../../../..'),
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
  level: number | null
  locale: string
  name: string | null
  type: string
}

function buildDivisionLookupMaps(rows: Array<DivisionLookupRow>): DivisionLookupMaps {
  const areaByEn = new Map<string, string>()
  const areaByZh = new Map<string, string>()
  const ambiguousAreaEn = new Set<string>()
  const ambiguousAreaZh = new Set<string>()
  const districtByEn = new Map<string, string>()
  const districtByZh = new Map<string, string>()
  const ambiguousDistrictEn = new Set<string>()
  const ambiguousDistrictZh = new Set<string>()
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
        addDivisionLookupEntry(
          areaByEn,
          ambiguousAreaEn,
          normaliseEnKey(row.name),
          row.id,
        )
      }

      if (row.locale === 'zh-hant') {
        addDivisionLookupEntry(
          areaByZh,
          ambiguousAreaZh,
          normaliseZhKey(row.name),
          row.id,
        )
      }
    }

    if (row.level === 2 || row.type === 'district') {
      if (row.locale === 'en') {
        addDivisionLookupEntry(
          districtByEn,
          ambiguousDistrictEn,
          normaliseEnKey(row.name),
          row.id,
        )
      }

      if (row.locale === 'zh-hant') {
        addDivisionLookupEntry(
          districtByZh,
          ambiguousDistrictZh,
          normaliseZhKey(row.name),
          row.id,
        )
      }
    }

    if (row.level === 0 && row.locale === 'en') {
      const normalised = normaliseEnKey(row.name)

      if (COUNTRY_NAME_ALIASES.some(alias => normalised === normaliseEnKey(alias))) {
        countryId = row.id
      }
    }
  }

  return {
    areaByEn,
    areaByZh,
    ambiguousAreaEn,
    ambiguousAreaZh,
    countryId,
    districtByEn,
    districtByZh,
    ambiguousDistrictEn,
    ambiguousDistrictZh,
    snapshotId,
  }
}

function addDivisionLookupEntry(
  map: Map<string, string>,
  ambiguousKeys: Set<string>,
  key: string,
  id: string,
) {
  if (ambiguousKeys.has(key)) return
  const existingId = map.get(key)
  if (existingId && existingId !== id) {
    map.delete(key)
    ambiguousKeys.add(key)
    return
  }
  map.set(key, id)
}

function resolveMappedDivision(input: {
  ambiguousEn: Set<string>
  ambiguousZh: Set<string>
  byEn: Map<string, string>
  byZh: Map<string, string>
  en: string | null
  zh: string | null
}) {
  const ids = new Set<string>()
  let ambiguous = false

  if (input.en) {
    const key = normaliseEnKey(input.en)
    const id = input.byEn.get(key)
    if (id) ids.add(id)
    if (input.ambiguousEn.has(key)) ambiguous = true
  }
  if (input.zh) {
    const key = normaliseZhKey(input.zh)
    const id = input.byZh.get(key)
    if (id) ids.add(id)
    if (input.ambiguousZh.has(key)) ambiguous = true
  }

  if (ids.size > 1 || ambiguous) {
    // Do not let one language silently choose a row when another language or
    // the snapshot itself indicates that the label is ambiguous.
    return { id: null, status: 'ambiguous' as const }
  }

  const id = ids.values().next().value ?? null
  return id
    ? { id, status: 'matched' as const }
    : { id: null, status: 'unmatched' as const }
}

function resolveAreaNameEn(value: unknown) {
  const normalised = asOptionalString(value)

  if (!normalised) {
    return null
  }

  return AREA_NAME_ALIASES_EN.get(normaliseEnKey(normalised)) ?? normalised
}

function resolveAreaNameZh(value: unknown) {
  const normalised = asOptionalString(value)

  if (!normalised) {
    return null
  }

  return AREA_NAME_ALIASES_ZH.get(normaliseZhKey(normalised)) ?? normalised
}

export function formatZhPremisesAddress(address: HkgovLocalisedPremisesAddress) {
  const street = address.ChiStreet ?? {}
  const village = address.ChiVillage ?? {}
  const block = address.ChiBlock ?? {}
  const routeLine =
    compactAddress(
      [
        joinStreetNumberRange(street.BuildingNoFrom, street.BuildingNoTo, ''),
        asOptionalString(street.StreetName),
      ],
      '',
    ) ??
    compactAddress(
      [
        joinStreetNumberRange(village.BuildingNoFrom, village.BuildingNoTo, ''),
        asOptionalString(village.VillageName),
        asOptionalString(village.LocationName),
      ],
      '',
    )
  const parts = [
    asOptionalString(address.BuildingName),
    compactAddress(
      [asOptionalString(block.BlockDescriptor), asOptionalString(block.BlockNo)],
      '',
    ),
    asOptionalString(address.ChiEstate?.EstateName),
    routeLine,
    asOptionalString(address.ChiDistrict),
    asOptionalString(address.Region),
  ]

  return compactAddress(parts, '')
}

export function formatEnPremisesAddress(address: HkgovLocalisedPremisesAddress) {
  const street = address.EngStreet ?? {}
  const village = address.EngVillage ?? {}
  const block = address.EngBlock ?? {}
  const streetLine = compactAddress(
    [
      joinStreetNumberRange(street.BuildingNoFrom, street.BuildingNoTo, '-'),
      asOptionalString(street.StreetName),
    ],
    ' ',
  )
  const villageLine = compactAddress(
    [
      joinStreetNumberRange(village.BuildingNoFrom, village.BuildingNoTo, '-'),
      asOptionalString(village.VillageName),
      asOptionalString(village.LocationName),
    ],
    ', ',
  )
  const parts = [
    asOptionalString(address.BuildingName),
    compactAddress(
      [asOptionalString(block.BlockDescriptor), asOptionalString(block.BlockNo)],
      ' ',
    ),
    asOptionalString(address.EngEstate?.EstateName),
    streetLine ?? villageLine,
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

function normaliseEnKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

function normaliseZhKey(value: string) {
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
