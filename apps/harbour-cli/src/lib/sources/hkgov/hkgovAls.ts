import { globSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { parquetWriteFile } from 'hyparquet-writer'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import { applyAlsEstateNames } from './hkgovAlsEstateNames'
import {
  buildAls2dBackfillFeatures,
  labelAls2dBackfillRows,
} from './hkgovAls2dBackfills'
import { fileSha256 } from '../../addressSql/address3dImport'
import { buildHkgovAlsProvisionalId } from './hkgovAlsIdentity.ts'
import {
  emptyHkgovAlsIdentityDecisions,
  emptyHkgovAlsIdentityHistory,
  resolveHkgovAlsIdentityDrift,
} from './hkgovAlsDrift.ts'
import {
  collectHkgovAlsRomanNumeralBuildingNameFamilies,
  collectHkgovAlsRomanNumeralPremiseNumberFamilies,
  normaliseHkgovAlsBuildingNameRomanNumeral,
  normaliseHkgovAlsPremiseStructure,
} from './hkgovAlsPremiseNormalisation.ts'
import type {
  HkgovAlsGeoJson,
  HkgovAlsSourceFeature,
  PrepareHkgovAlsOptions,
  PreparedHkgovAlsResult,
} from './hkgovAlsTypes.ts'
import { loadDivisionLookupMaps } from './hkgovAlsDivisions.ts'
import {
  assertUniquePreparedRowIds,
  buildHkgovAlsDivisionQuality,
  buildHkgovAlsProcessingActions,
  consolidateEquivalentHkgovAlsPremises,
  consolidateRowsSharingResolvedId,
  dedupeHkgovAlsSourceFeatures,
} from './hkgovAlsEvidence.ts'
import {
  asOptionalString,
  collectHkgovAlsNumericPhaseFamilies,
  int32Column,
  jsonColumn,
  normaliseHkgovAlsFeature,
  stringColumn,
} from './hkgovAlsNormalisation.ts'

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
  sourceFeatures.push(
    ...buildAls2dBackfillFeatures(sourceFeatures, options.sourceVersion),
  )
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
  const numericPhaseFamilies = collectHkgovAlsNumericPhaseFamilies(
    uniqueSourceFeatures.map(sourceFeature => sourceFeature.feature),
  )
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
      numericPhaseFamilies,
    ),
  )
  labelAls2dBackfillRows(rows)
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
  const has3d = globSync(resolve(sourceDir, 'als_addresses_3d_*.geojson')).length > 0
  if (options.writeOutput !== false && has3d) {
    await prepareAls3dCollections({
      sourceDir,
      sourceVersion: options.sourceVersion,
      outputFile,
      rows,
    })
    assertUniquePreparedRowIds(rows)
  }
  applyAlsEstateNames(rows, options.sourceVersion)
  if (options.writeOutput !== false)
    parquetWriteFile({
      filename: outputFile,
      rowGroupSize: 5000,
      columnData: [
        stringColumn(
          'parentAddressId',
          rows.map(row => row.parentAddressId ?? null),
        ),
        stringColumn(
          'curatedGranularity',
          rows.map(row => row.curatedGranularity ?? null),
        ),
        stringColumn(
          'hierarchyCuration',
          rows.map(row => row.hierarchyCuration ?? null),
        ),
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
          'zhHantPhaseName',
          rows.map(row => row.zhHantPhaseName),
        ),
        stringColumn(
          'zhHantPhaseRef',
          rows.map(row => row.zhHantPhaseRef),
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
          'enPhaseName',
          rows.map(row => row.enPhaseName),
        ),
        stringColumn(
          'enPhaseRef',
          rows.map(row => row.enPhaseRef),
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

  if (options.writeOutput !== false && has3d) {
    await writeFile(
      `${outputFile}.address3d.meta.json`,
      JSON.stringify({
        sourceVersion: options.sourceVersion,
        parquetSha256: await fileSha256(outputFile),
        sidecarSha256: await fileSha256(`${outputFile}.address3d.jsonl`),
      }),
    )
  }

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

export type {
  HkgovAlsSourceDuplicateGroup,
  HkgovAlsSourceFeature,
  HkgovAlsDivisionMatchStatus,
  HkgovAlsDivisionQualityIssue,
  HkgovAlsDivisionQuality,
} from './hkgovAlsTypes.ts'

export {
  collectHkgovAlsNumericPhaseFamilies,
  formatZhPremisesAddress,
  formatEnPremisesAddress,
} from './hkgovAlsNormalisation.ts'

export {
  buildHkgovAlsProcessingActions,
  dedupeHkgovAlsSourceFeatures,
  consolidateEquivalentHkgovAlsPremises,
  buildHkgovAlsDivisionQuality,
} from './hkgovAlsEvidence.ts'

export {
  resolveDivisionLookupSource,
  resolveDivisionSnapshotSource,
} from './hkgovAlsDivisions.ts'
