import { globSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import { Database as SQLiteDatabase } from 'bun:sqlite'
import { and, desc, eq, or } from 'drizzle-orm'
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
  bridgeMapFromFile,
  buildHkgovAlsIdentityKey,
  buildHkgovAlsProvisionalId,
  mergePersistedHkgovAlsAliases,
  resolveHkgovAlsIdentities,
  type HkgovAlsIdentityBridge,
  type HkgovAlsIdentityInput,
  type HkgovAlsIdentityMatchStats,
  type OvertureAddressIdentityRow,
} from './hkgovAlsIdentity.ts'
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
  bridgeOutputFile?: string
  dbPath?: string
  environment: UploadEnvironment
  identityBridgeFile?: string
  matchReportFile?: string
  currentDb?: CurrentDatabase
  metaDb?: MetaDatabase
  overtureRelease?: string
  outputFile: string
  cohortKey: string
  sourceDir: string
  sourceVersion: string
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
  ChiEstate?: {
    EstateName?: string | null
  } | null
  EngEstate?: {
    EstateName?: string | null
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
  identityKey: string
  identityMatchMethod: string
  identityNumberFrom: string | null
  identityNumberTo: string | null
  identityRouteNames: string
  chiPremisesAddressJson: string | null
  engPremisesAddressJson: string | null
  zhHantFormattedAddress: string | null
  zhHantRegion: string | null
  zhHantDistrict: string | null
  zhHantEstateName: string | null
  zhHantBuildingName: string | null
  zhHantStreetName: string | null
  zhHantStreetNumberFrom: string | null
  zhHantStreetNumberTo: string | null
  enFormattedAddress: string | null
  enRegion: string | null
  enDistrict: string | null
  enEstateName: string | null
  enBuildingName: string | null
  enStreetName: string | null
  enStreetNumberFrom: string | null
  enStreetNumberTo: string | null
  easting: number | null
  northing: number | null
}

type PreparedHkgovAlsResult = {
  bridgeOutputFile: string | null
  deduplicatedFeatureCount: number
  featureCount: number
  identityConsolidatedFeatureCount: number
  identityStats: HkgovAlsIdentityMatchStats
  matchReportFile: string | null
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
  const inputFiles = globSync(resolve(sourceDir, '*.geojson'))
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
      options.cohortKey,
      options.sourceVersion,
      divisionMaps,
    ),
  )
  const deduplicatedRows = dedupePreparedHkgovAlsRows(rows)
  rows.splice(0, rows.length, ...deduplicatedRows)

  const bridge = options.identityBridgeFile
    ? (JSON.parse(
        await readFile(options.identityBridgeFile, 'utf8'),
      ) as HkgovAlsIdentityBridge)
    : null
  let bridgeMappings = bridge ? bridgeMapFromFile(bridge) : new Map<string, string>()
  if (options.metaDb) {
    const persistedAliases = await options.metaDb
      .select({
        aliasValue: metaSchema.entityAliases.aliasValue,
        canonicalId: metaSchema.entityAliases.canonicalId,
      })
      .from(metaSchema.entityAliases)
      .where(
        and(
          eq(metaSchema.entityAliases.entityType, 'address'),
          eq(metaSchema.entityAliases.sourceSystem, 'hkgov-dpo'),
          eq(metaSchema.entityAliases.isCurrent, true),
        ),
      )
      .all()
    bridgeMappings = mergePersistedHkgovAlsAliases(
      rows.map(row => identityInputFromPreparedRow(row)),
      bridgeMappings,
      persistedAliases,
    )
  }
  const overtureRows = options.overtureRelease
    ? await loadOvertureAddressIdentityRows(options, options.overtureRelease)
    : []
  const {
    diagnostics,
    resolutions,
    stats: identityStats,
  } = resolveHkgovAlsIdentities(
    rows.map(row => identityInputFromPreparedRow(row)),
    overtureRows,
    bridgeMappings,
  )

  resolutions.forEach((resolution, index) => {
    const row = rows[index]
    if (!row) return
    row.canonicalId = resolution.canonicalId
    row.identityAlias = resolution.identityAlias
    row.identityKey = resolution.identityKey
    row.identityMatchMethod = resolution.matchMethod
  })

  const matchReportFile = options.matchReportFile
    ? resolve(options.matchReportFile)
    : null
  if (matchReportFile) {
    const records = diagnostics.map(diagnostic => {
      const row = rows[diagnostic.inputIndex]
      if (!row) {
        throw new Error(
          `ALS diagnostic references missing prepared row ${diagnostic.inputIndex}.`,
        )
      }
      return {
        als: {
          buildingIdentity: row.identityBuildingId,
          coordinates: parsePointGeometry(row.geometry),
          districtId: row.districtId,
          districtNameEn: row.districtNameEn,
          districtNameZhHant: row.districtNameZhHant,
          formattedAddressEn: row.enFormattedAddress,
          formattedAddressZhHant: row.zhHantFormattedAddress,
          numberFrom: row.identityNumberFrom,
          numberTo: row.identityNumberTo,
          provisionalId: diagnostic.provisionalId,
          routeNames: JSON.parse(row.identityRouteNames) as string[],
          sourceFile: row.sourceFile,
        },
        candidateCount: diagnostic.candidateCount,
        candidates: diagnostic.candidates,
        candidatesTruncated: diagnostic.candidatesTruncated,
        conflictingAlsIdentityKeys: diagnostic.conflictingAlsIdentityKeys,
        identityKey: diagnostic.identityKey,
        reasons: diagnostic.reasons,
      }
    })
    const noMatches = records.filter(
      (_, index) => diagnostics[index]?.kind === 'no-match',
    )
    const nearMatches = records.filter(
      (_, index) => diagnostics[index]?.kind === 'near-match',
    )

    await mkdir(dirname(matchReportFile), { recursive: true })
    await writeFile(
      matchReportFile,
      `${JSON.stringify(
        {
          authority: 'hkgov-dpo',
          cohortKey: options.cohortKey,
          generatedAt: new Date().toISOString(),
          noMatches,
          nearMatches,
          overtureRelease: options.overtureRelease ?? null,
          sourceVersion: options.sourceVersion,
          summary: {
            matched:
              identityStats.matchedByAddressCoordinate +
              identityStats.matchedByAddress +
              identityStats.bridged,
            nearMatchCount: nearMatches.length,
            noMatchCount: noMatches.length,
            provisional: identityStats.provisional,
          },
          version: 1,
        },
        null,
        2,
      )}\n`,
    )
  }

  const bridgeOutputFile = options.bridgeOutputFile
    ? resolve(options.bridgeOutputFile)
    : null
  if (bridgeOutputFile) {
    const mappings = resolutions.flatMap(resolution =>
      resolution.canonicalId === resolution.provisionalId
        ? []
        : [
            {
              canonicalId: resolution.canonicalId,
              identityKey: resolution.identityKey,
              matchMethod: resolution.matchMethod,
            },
          ],
    )
    await mkdir(dirname(bridgeOutputFile), { recursive: true })
    await writeFile(
      bridgeOutputFile,
      `${JSON.stringify(
        {
          authority: 'hkgov-dpo',
          generatedAt: new Date().toISOString(),
          mappings,
          overtureRelease: options.overtureRelease ?? bridge?.overtureRelease ?? null,
          version: 1,
        } satisfies HkgovAlsIdentityBridge,
        null,
        2,
      )}\n`,
    )
  }

  await mkdir(dirname(outputFile), { recursive: true })
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
    bridgeOutputFile,
    deduplicatedFeatureCount: sourceFeatureCount - uniqueSourceFeatures.length,
    featureCount: sourceFeatureCount,
    identityConsolidatedFeatureCount: uniqueSourceFeatures.length - rows.length,
    identityStats,
    matchReportFile,
    outputFile,
    sourceDuplicateFeatureGroups,
    sourceFileCount: inputFiles.length,
  }
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

function dedupePreparedHkgovAlsRows(rows: PreparedHkgovAlsRow[]) {
  const byIdentity = new Map<string, PreparedHkgovAlsRow>()
  for (const row of rows) {
    const existing = byIdentity.get(row.identityKey)
    if (!existing || comparePreparedRowRichness(row, existing) > 0) {
      byIdentity.set(row.identityKey, row)
    }
  }
  return [...byIdentity.values()]
}

function comparePreparedRowRichness(
  left: PreparedHkgovAlsRow,
  right: PreparedHkgovAlsRow,
) {
  const score = (row: PreparedHkgovAlsRow) =>
    [
      row.enBuildingName,
      row.zhHantBuildingName,
      row.enEstateName,
      row.zhHantEstateName,
      row.enFormattedAddress,
      row.zhHantFormattedAddress,
    ].reduce((total, value) => total + (value?.length ?? 0), 0)
  const difference = score(left) - score(right)
  if (difference !== 0) return difference
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}

function normalizeHkgovAlsFeature(
  feature: HkgovAlsFeature,
  sourceFile: string,
  cohortKey: string,
  sourceVersion: string,
  divisionMaps: DivisionLookupMaps,
): PreparedHkgovAlsRow {
  const properties = feature.properties ?? {}
  const premises = properties.Address?.PremisesAddress ?? {}
  const zh = premises.ChiPremisesAddress ?? {}
  const en = premises.EngPremisesAddress ?? {}
  const zhStreet = zh.ChiStreet ?? {}
  const enStreet = en.EngStreet ?? {}
  const zhVillage = zh.ChiVillage ?? {}
  const enVillage = en.EngVillage ?? {}
  const geoAddress = asOptionalString(premises.GeoAddress)
  const csuId =
    asOptionalString(premises.BuildingCsuInformation?.CsuId) ?? geoAddress ?? null
  const identityBuildingId = geoAddress ?? csuId
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
  const identityKey = buildHkgovAlsIdentityKey({
    buildingIdentity: identityBuildingId,
    districtId,
    latitude: coordinates?.[1] ?? null,
    longitude: coordinates?.[0] ?? null,
    numberFrom: identityNumberFrom,
    numberTo: identityNumberTo,
    routeNames: identityRouteNames,
  })
  const provisionalId = buildHkgovAlsProvisionalId(identityKey)
  const sources =
    stringifyJson({
      hkgovAls: {
        geoAddress,
        hkgovCsuId: csuId,
        cohortKey,
        sourceFile,
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
    identityKey,
    identityMatchMethod: 'provisional',
    identityNumberFrom,
    identityNumberTo,
    identityRouteNames: JSON.stringify(identityRouteNames),
    chiPremisesAddressJson: stringifyJson(zh),
    engPremisesAddressJson: stringifyJson(en),
    zhHantFormattedAddress: formatZhPremisesAddress(zh),
    zhHantRegion: asOptionalString(zh.Region),
    zhHantDistrict: districtNameZhHant,
    zhHantEstateName: asOptionalString(zh.ChiEstate?.EstateName),
    zhHantBuildingName: asOptionalString(zh.BuildingName),
    zhHantStreetName: asOptionalString(zhStreet.StreetName),
    zhHantStreetNumberFrom: asOptionalString(zhStreet.BuildingNoFrom),
    zhHantStreetNumberTo: asOptionalString(zhStreet.BuildingNoTo),
    enFormattedAddress: formatEnPremisesAddress(en),
    enRegion: asOptionalString(en.Region),
    enDistrict: districtNameEn,
    enEstateName: asOptionalString(en.EngEstate?.EstateName),
    enBuildingName: asOptionalString(en.BuildingName),
    enStreetName: asOptionalString(enStreet.StreetName),
    enStreetNumberFrom: asOptionalString(enStreet.BuildingNoFrom),
    enStreetNumberTo: asOptionalString(enStreet.BuildingNoTo),
    easting: asOptionalInteger(properties.Easting),
    northing: asOptionalInteger(properties.Northing),
  }
}

function identityInputFromPreparedRow(row: PreparedHkgovAlsRow): HkgovAlsIdentityInput {
  const geometry = row.geometry
    ? (JSON.parse(row.geometry) as { coordinates?: [number, number]; type?: string })
    : null
  const routeNames = JSON.parse(row.identityRouteNames) as string[]

  return {
    buildingIdentity: row.identityBuildingId,
    districtId: row.districtId,
    latitude: geometry?.type === 'Point' ? (geometry.coordinates?.[1] ?? null) : null,
    longitude: geometry?.type === 'Point' ? (geometry.coordinates?.[0] ?? null) : null,
    numberFrom: row.identityNumberFrom,
    numberTo: row.identityNumberTo,
    routeNames,
  }
}

async function loadOvertureAddressIdentityRows(
  options: Pick<
    PrepareHkgovAlsOptions,
    'currentDb' | 'dbPath' | 'environment' | 'metaDb'
  >,
  overtureRelease: string,
): Promise<OvertureAddressIdentityRow[]> {
  if (options.currentDb && options.metaDb) {
    const snapshotId = await loadOvertureAddressSnapshotIdFromDb(
      options.metaDb,
      overtureRelease,
    )
    return loadOvertureAddressRowsFromDb(options.currentDb, snapshotId)
  }

  const currentSource = resolveDivisionLookupSource(options)
  const metaSource = resolveDivisionSnapshotSource(options)
  const snapshotId =
    metaSource.kind === 'sqlite'
      ? loadOvertureAddressSnapshotIdFromSqlite(metaSource.dbPath, overtureRelease)
      : await loadOvertureAddressSnapshotIdFromWrangler(metaSource, overtureRelease)
  const rows =
    currentSource.kind === 'sqlite'
      ? loadOvertureAddressRowsFromSqlite(currentSource.dbPath, snapshotId)
      : await loadOvertureAddressRowsFromWrangler(currentSource, snapshotId)

  return rows.map(row => {
    const geometry = parsePointGeometry(row.geometry)
    return {
      canonicalId: row.canonicalId,
      districtId: row.districtId,
      latitude: geometry?.[1] ?? null,
      longitude: geometry?.[0] ?? null,
      streetName: row.streetName,
      streetNumber: row.streetNumber,
    }
  })
}

async function loadOvertureAddressSnapshotIdFromDb(
  metaDb: MetaDatabase,
  overtureRelease: string,
) {
  const row = await metaDb
    .select({ snapshotId: metaSchema.metaSnapshots.id })
    .from(metaSchema.metaSnapshots)
    .innerJoin(
      metaSchema.metaSnapshotSources,
      eq(metaSchema.metaSnapshots.id, metaSchema.metaSnapshotSources.snapshotId),
    )
    .innerJoin(
      metaSchema.metaReleases,
      eq(metaSchema.metaSnapshotSources.sourceReleaseId, metaSchema.metaReleases.id),
    )
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
    )
    .innerJoin(
      metaSchema.metaPublishers,
      eq(metaSchema.metaDatasets.publisherId, metaSchema.metaPublishers.id),
    )
    .where(
      and(
        eq(metaSchema.metaSnapshots.resourceType, 'address'),
        eq(metaSchema.metaSnapshots.status, 'published'),
        eq(metaSchema.metaPublishers.code, 'overture'),
        or(
          eq(metaSchema.metaReleases.code, overtureRelease),
          eq(metaSchema.metaReleases.cohortKey, overtureRelease),
        ),
      ),
    )
    .orderBy(desc(metaSchema.metaSnapshots.revision))
    .limit(1)
    .get()
  if (!row?.snapshotId) {
    throw new Error(
      `Published Overture address snapshot not found: ${overtureRelease}.`,
    )
  }
  return row.snapshotId
}

async function loadOvertureAddressRowsFromDb(
  currentDb: CurrentDatabase,
  snapshotId: string,
): Promise<OvertureAddressIdentityRow[]> {
  const rows = await currentDb
    .select({
      canonicalId: currentSchema.address2d.id,
      districtId: currentSchema.address2d.districtId,
      geometry: currentSchema.address2d.geometry,
      streetName: currentSchema.address2dI18n.streetName,
      streetNumber: currentSchema.address2dI18n.streetNumber,
    })
    .from(currentSchema.address2d)
    .leftJoin(
      currentSchema.address2dI18n,
      and(
        eq(currentSchema.address2dI18n.snapshotId, currentSchema.address2d.snapshotId),
        eq(currentSchema.address2dI18n.addressId, currentSchema.address2d.id),
        eq(currentSchema.address2dI18n.locale, 'en'),
      ),
    )
    .where(eq(currentSchema.address2d.snapshotId, snapshotId))
    .all()

  return rows.map(row => {
    const geometry = parsePointGeometry(row.geometry)
    return {
      canonicalId: row.canonicalId,
      districtId: row.districtId,
      latitude: geometry?.[1] ?? null,
      longitude: geometry?.[0] ?? null,
      streetName: row.streetName,
      streetNumber: row.streetNumber,
    }
  })
}

type OvertureAddressLookupRow = {
  canonicalId: string
  districtId: string | null
  geometry: string | Record<string, unknown> | null
  streetName: string | null
  streetNumber: string | null
}

function loadOvertureAddressSnapshotIdFromSqlite(
  explicitDbPath: string,
  overtureRelease: string,
) {
  const sqlite = new SQLiteDatabase(resolveLocalD1Path(explicitDbPath), {
    readonly: true,
  })
  try {
    const row = sqlite
      .query(
        `
          SELECT s.id AS snapshotId
          FROM snapshots s
          INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
          INNER JOIN releases r ON r.id = ss.sourceReleaseId
          INNER JOIN datasets d ON d.id = r.datasetId
          INNER JOIN publishers p ON p.id = d.publisherId
          WHERE s.resourceType = 'address'
            AND s.status = 'published'
            AND p.code = 'overture'
            AND (r.code = ? OR r.cohortKey = ?)
          ORDER BY CASE WHEN r.code = ? THEN 0 ELSE 1 END, s.revision DESC
          LIMIT 1
        `,
      )
      .get(overtureRelease, overtureRelease, overtureRelease) as {
      snapshotId?: string
    } | null

    if (!row?.snapshotId) {
      throw new Error(
        `Published Overture address snapshot not found: ${overtureRelease}.`,
      )
    }
    return row.snapshotId
  } finally {
    sqlite.close()
  }
}

function loadOvertureAddressRowsFromSqlite(explicitDbPath: string, snapshotId: string) {
  const sqlite = new SQLiteDatabase(resolveLocalD1Path(explicitDbPath), {
    readonly: true,
  })
  try {
    return sqlite
      .query(
        `
          SELECT a.id AS canonicalId, a.districtId, a.geometry,
            i.streetName, i.streetNumber
          FROM address2d a
          LEFT JOIN address2dI18n i
            ON i.snapshotId = a.snapshotId
           AND i.addressId = a.id
           AND i.locale = 'en'
          WHERE a.snapshotId = ?
        `,
      )
      .all(snapshotId) as OvertureAddressLookupRow[]
  } finally {
    sqlite.close()
  }
}

async function loadOvertureAddressSnapshotIdFromWrangler(
  target: Extract<DivisionLookupSource, { kind: 'wrangler' }>,
  overtureRelease: string,
) {
  const release = sqlLiteral(overtureRelease)
  const rows = await runWranglerD1Query<{ snapshotId?: string }>(
    target,
    `
      SELECT s.id AS snapshotId
      FROM snapshots s
      INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
      INNER JOIN releases r ON r.id = ss.sourceReleaseId
      INNER JOIN datasets d ON d.id = r.datasetId
      INNER JOIN publishers p ON p.id = d.publisherId
      WHERE s.resourceType = 'address'
        AND s.status = 'published'
        AND p.code = 'overture'
        AND (r.code = ${release} OR r.cohortKey = ${release})
      ORDER BY CASE WHEN r.code = ${release} THEN 0 ELSE 1 END, s.revision DESC
      LIMIT 1
    `,
  )
  const snapshotId = rows[0]?.snapshotId
  if (!snapshotId) {
    throw new Error(
      `Published Overture address snapshot not found: ${overtureRelease}.`,
    )
  }
  return snapshotId
}

async function loadOvertureAddressRowsFromWrangler(
  target: Extract<DivisionLookupSource, { kind: 'wrangler' }>,
  snapshotId: string,
) {
  return runWranglerD1Query<OvertureAddressLookupRow>(
    target,
    `
      SELECT a.id AS canonicalId, a.districtId, a.geometry,
        i.streetName, i.streetNumber
      FROM address2d a
      LEFT JOIN address2dI18n i
        ON i.snapshotId = a.snapshotId
       AND i.addressId = a.id
       AND i.locale = 'en'
      WHERE a.snapshotId = ${sqlLiteral(snapshotId)}
    `,
  )
}

async function runWranglerD1Query<TRow>(
  target: Extract<DivisionLookupSource, { kind: 'wrangler' }>,
  command: string,
): Promise<TRow[]> {
  const process = Bun.spawn({
    cmd: [
      'bun',
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
      command,
    ],
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
      `Failed to query ${target.databaseName}.\n${stderr.trim() || stdout.trim()}`,
    )
  }
  const payload = JSON.parse(stdout) as Array<{ results?: TRow[]; success?: boolean }>
  const first = payload[0]
  if (!first?.success || !Array.isArray(first.results)) {
    throw new Error(`Unexpected Wrangler D1 response for ${target.databaseName}.`)
  }
  return first.results
}

function parsePointGeometry(value: unknown) {
  const geometry =
    typeof value === 'string'
      ? (JSON.parse(value) as { coordinates?: [number, number]; type?: string })
      : (value as { coordinates?: [number, number]; type?: string } | null)
  return geometry?.type === 'Point' && Array.isArray(geometry.coordinates)
    ? geometry.coordinates
    : null
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
  const parts = [
    asOptionalString(address.BuildingName),
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
  const streetLine = compactAddress(
    [
      joinStreetNumberRange(street.BuildingNoFrom, street.BuildingNoTo, '-'),
      asOptionalString(street.StreetName),
    ],
    ' ',
  )
  const parts = [
    asOptionalString(address.BuildingName),
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
