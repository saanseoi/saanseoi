import { applyReviewedStructuredComponents } from './hkgovAlsStructuredComponents'
import { alsReviewPolicy, alsReviewScope } from './hkgovAlsReviewPolicy'
import { classifyReviewedAlsPremises } from './hkgovAlsReviewHierarchy'
import { applyReviewedAlsFrontages } from './hkgovAlsReviewFrontages'
import { validateReviewedAlsInventories } from './hkgovAlsReviewInventories'
import { recordReviewedAlsCoalescences } from './hkgovAlsReviewHierarchy'
import { applyReviewedAlsDerivedHierarchy } from './hkgovAlsReviewHierarchy'
import { applyReviewedAlsParents } from './hkgovAlsReviewProgram'
import {
  applyReviewedAlsIdentityAliases,
  validateReviewedAlsSources,
} from './hkgovAlsReviewProgram'
import { applyConfidentAlsContinuityFromHistory } from './hkgovAlsConfidentContinuity'

import {
  collectAlsReviewIssues,
  AlsCurationReviewError,
  type AlsPendingIssue,
} from './hkgovAlsReviewIssue'
import { writeAlsReviewCache, writeAlsReviewFailureCache } from './hkgovAlsReviewCache'
import { applyAlsDivisionMembership } from './hkgovAlsDivisionMembership'
import {
  retainReviewedAlsPremises,
  applyReviewedAlsPremiseRetentions,
  finishReviewedAlsPremiseRetentions,
} from './hkgovAlsReviewedPremiseRetentions'
import { applyReviewedBuildingOverrides } from './hkgovAlsBuildingOverrides'

import { applyReviewedBlockDetailBackfills } from './hkgovAlsBlockDetailBackfills'
import { applyReviewedIdentityComponentBackfills } from './hkgovAlsIdentityComponentBackfills'
import {
  applyReviewedHouseStreetIdentities,
  linkReviewedHouseStreetParents,
} from './hkgovAlsHouseStreetIdentities'
import { applyReviewedPremiseRenames } from './hkgovAlsPremiseRenames'
import { globSync } from 'node:fs'
import {
  captureAlsPublisherSources,
  alsSourceLocator,
} from '@repo/core/pipeline/services/sources/alsSourcePayload'
import preparationFixture from '../../../../../../../fixtures/meta/processing-rules/assembly/address-preparation.json'
import curationFixture from '../../../../../../../fixtures/meta/processing-rules/assembly/address-curation.json'
import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import { alsAuditFixtures } from './hkgovAlsAuditFixtures'
import { createAlsAuditGuards } from './hkgovAlsAuditGuards'
import { freezeRegisteredRule } from '../../../api/retainedRule'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { writeAlsParquet } from './hkgovAlsParquet'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import {
  buildAlsMembership,
  writeAlsMembership,
  type AlsMembershipCollection,
  type AlsMembershipSource,
} from './hkgovAlsMembership'
import { applyReviewedStreetEstateComplexes } from './hkgovAlsStreetEstateComplexes'
import { suppressReviewedYueWanPremise } from './hkgovAlsYueWanSuppression'
import {
  retainAlsCommercialPremises,
  labelAlsCommercialRetentions,
} from './hkgovAlsCommercialRetentions'
import { retainAlsHouses, labelAlsHouseRetentions } from './hkgovAlsHouseRetentions'
import { applyAlsEstateNames } from './hkgovAlsEstateNames'
import { applyAlsLocalities } from './hkgovAlsLocalities'
import { backfillAlsCoordinates } from './hkgovAlsCoordinateBackfills'
import { backfillOiHei } from './hkgovAlsOiHeiBackfill'
import {
  reconstructReviewedEstateComplexes,
  applyReviewedEstateComplexes,
} from './hkgovAlsEstateComplexDecisions'
import { restoreAlsEstateComponents } from './hkgovAlsEstateComponents'
import { restoreAlsEstateGaps } from './hkgovAlsEstateGapRestorations'
import { applyAlsNestedPremises } from './hkgovAlsNestedPremises'
import {
  reconstructAlsPremises,
  labelAlsPremiseReconstructions,
} from './hkgovAlsPremiseReconstructions'
import { applyAlsPremiseConsolidations } from './hkgovAlsPremiseConsolidations'
import { applyApprovedIssueBatch } from './hkgovAlsApprovedIssueBatch'
import { coalesceAlsAliasedPremises } from './hkgovAlsAliasedPremiseCoalescences'
import { retainNamedPremises } from './hkgovAlsNamedPremiseRetentions'
import { suppressAlsUnnamedPremises } from './hkgovAlsUnnamedPremiseSuppressions'
import {
  buildAls2dBackfillFeatures,
  labelAls2dBackfillRows,
} from './hkgovAls2dBackfills'
import { applyReviewedSchoolReconciliations } from './hkgovAlsSchoolReconciliations'
import { applyReviewedComplexPromotions } from './hkgovAlsComplexPromotions'
import { fileSha256 } from '../../../pipeline/addresses/address3dImport'
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

export const alsPreparationRule = registerRule(
  ruleDeclarationFromFixture(preparationFixture),
  (options: PrepareHkgovAlsOptions) => alsCurationRule.execute(options),
)

export const alsCurationRule = registerRule(
  ruleDeclarationFromFixture(curationFixture),
  (options: PrepareHkgovAlsOptions) =>
    collectAlsReviewIssues(async issues => {
      try {
        return await prepareHkgovAlsAddressParquetInternal(options, issues)
      } catch (error) {
        const pending = [
          ...issues,
          ...(error instanceof AlsCurationReviewError ? [error.issue] : []),
        ]
        if (pending.length && options.writeOutput !== false)
          await writeAlsReviewFailureCache(
            resolve(options.outputFile),
            options.sourceVersion,
            pending,
          )
        throw error
      }
    }),
)

export function prepareHkgovAlsAddressParquet(options: PrepareHkgovAlsOptions) {
  return alsPreparationRule.execute(options)
}

async function prepareHkgovAlsAddressParquetInternal(
  options: PrepareHkgovAlsOptions,
  reviewIssues: AlsPendingIssue[],
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
    historyShards: options.historyShards,
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
  const publisherSources = await captureAlsPublisherSources(
    sourceFeatures,
    options.sourceVersion,
  )
  validateReviewedAlsSources(sourceFeatures, options.sourceVersion)
  const reviewedPremiseRetentions = retainReviewedAlsPremises(
    sourceFeatures,
    options.sourceVersion,
  )
  const auditGuards = createAlsAuditGuards()
  const retainedCommercialPremises = retainAlsCommercialPremises(
    sourceFeatures,
    options.sourceVersion,
  )
  reconstructReviewedEstateComplexes(sourceFeatures, options.sourceVersion)
  const retainedHouses = retainAlsHouses(sourceFeatures, options.sourceVersion)
  const reconstructedPremises = reconstructAlsPremises(
    sourceFeatures,
    options.sourceVersion,
  )
  sourceFeatures.push(
    ...buildAls2dBackfillFeatures(sourceFeatures, options.sourceVersion),
  )
  const {
    duplicateGroups: sourceDuplicateFeatureGroups,
    features: uniqueSourceFeatures,
  } = dedupeHkgovAlsSourceFeatures(sourceFeatures)
  const uniqueSourceFeatureCount = uniqueSourceFeatures.length
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
  // Publisher evidence is retained separately; release the original parsed
  // feature containers before preparing the much larger combined 3D inventory.
  sourceFeatures.length = 0
  uniqueSourceFeatures.length = 0
  Bun.gc(true)
  applyReviewedBlockDetailBackfills(rows, options.sourceVersion)
  labelAls2dBackfillRows(rows)
  applyReviewedSchoolReconciliations(rows, options.sourceVersion)
  applyReviewedHouseStreetIdentities(rows, options.sourceVersion)
  applyReviewedStreetEstateComplexes(rows, options.sourceVersion)
  linkReviewedHouseStreetParents(rows, options.sourceVersion)
  suppressReviewedYueWanPremise(rows, options.sourceVersion)
  applyReviewedComplexPromotions(rows, options.sourceVersion)
  labelAlsCommercialRetentions(rows, retainedCommercialPremises)
  applyReviewedEstateComplexes(rows, options.sourceVersion)
  labelAlsHouseRetentions(rows, retainedHouses)
  labelAlsPremiseReconstructions(rows, reconstructedPremises)
  applyApprovedIssueBatch(rows, options.sourceVersion, options.skipCurationChecks)
  applyAlsPremiseConsolidations(rows, options.sourceVersion)
  retainNamedPremises(rows, options.sourceVersion)
  applyReviewedPremiseRenames(rows, options.sourceVersion)
  applyReviewedBuildingOverrides(rows, options.sourceVersion)
  applyReviewedIdentityComponentBackfills(rows, options.sourceVersion)
  applyReviewedAlsPremiseRetentions(rows, reviewedPremiseRetentions)
  applyReviewedAlsDerivedHierarchy(rows, options.sourceVersion)
  recordReviewedAlsCoalescences(rows, options.sourceVersion)
  applyReviewedAlsParents(rows, options.sourceVersion, 'hierarchy')
  applyReviewedAlsParents(rows, options.sourceVersion, 'initial-hierarchy')
  applyReviewedAlsFrontages(rows, options.sourceVersion)
  const reviewedAliases = await applyConfidentAlsContinuityFromHistory(
    rows,
    outputFile,
    options.sourceVersion,
    options.identityHistory ?? emptyHkgovAlsIdentityHistory(),
  )
  for (const row of rows) {
    if (
      alsReviewPolicy.retentionAliasFiles.includes(
        JSON.parse(row.sources).hkgovAlsReviewedPremiseRetention?.curationFile,
      ) &&
      row.identityAlias &&
      row.identityAlias !== row.id
    )
      reviewedAliases.set(row.identityAlias, row.id)
  }
  for (const row of rows) {
    const decision = JSON.parse(row.sources).hkgovAlsReviewedIdentityCoalescence
    if (alsReviewPolicy.coalescenceAliasFiles.includes(decision?.curationFile))
      for (const alias of decision.aliasIds) reviewedAliases.set(alias, row.id)
  }
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
  const confidentKeys = new Set(
    rows
      .filter(
        row =>
          row.identityMatchMethod ===
          alsReviewScope('confident-continuity', options.sourceVersion)?.id,
      )
      .map(row => row.identityKey),
  )
  const drift = resolveHkgovAlsIdentityDrift(
    identityRecords.filter(record => !confidentKeys.has(record.identityKey)),
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
  const retainedResolvedRows = new Set(resolvedIdDistinctRows)
  const consolidatedParentVariants = rows.filter(row => !retainedResolvedRows.has(row))
  rows.splice(0, rows.length, ...resolvedIdDistinctRows)
  for (const [alias, owner] of applyReviewedAlsIdentityAliases(
    rows,
    options.sourceVersion,
  ))
    reviewedAliases.set(alias, owner)
  const aliasesByCanonical = new Map<string, string[]>()
  for (const [alias, id] of reviewedAliases)
    aliasesByCanonical.set(id, [...(aliasesByCanonical.get(id) ?? []), alias])
  for (const row of rows) {
    const aliases = aliasesByCanonical.get(row.id) ?? []
    if (aliases.length)
      row.sources = JSON.stringify({
        ...JSON.parse(row.sources),
        reviewedIdentityAliases: aliases,
      })
  }
  assertUniquePreparedRowIds(rows)
  const aliasOwnerIds = coalesceAlsAliasedPremises(
    rows,
    options.sourceVersion,
    options.skipCurationChecks,
  )

  await mkdir(dirname(outputFile), { recursive: true })
  const inventoryMembership: {
    collections: AlsMembershipCollection[]
    sources: AlsMembershipSource[]
  } = { collections: [], sources: [] }
  await prepareAls3dCollections({
    publisherSources: publisherSources.values(),
    sourceDir,
    sourceVersion: options.sourceVersion,
    outputFile,
    rows,
    aliasOwnerIds,
    reviewedAliases,
    consolidatedParentVariants,
    writeOutput: options.writeOutput,
    skipCurationChecks: options.skipCurationChecks,
    onGuardPassed: auditGuards.passed,
    membership: inventoryMembership,
  })
  Bun.gc(true)
  assertUniquePreparedRowIds(rows)
  if (aliasOwnerIds.size) {
    rows.splice(0, rows.length, ...rows.filter(row => !aliasOwnerIds.has(row.id)))
    assertUniquePreparedRowIds(rows)
  }
  applyAlsEstateNames(rows, options.sourceVersion)
  applyAlsLocalities(rows, options.sourceVersion)
  const estateComponents = restoreAlsEstateComponents(rows, options.sourceVersion)
  const estateGaps = restoreAlsEstateGaps(rows, options.sourceVersion, true)
  for (const row of rows) {
    if (row.identityMatchMethod !== 'reviewed-estate-gap-continuity') continue
    const record = resolvedIdentityRecords.find(r => r.identityKey === row.identityKey)
    if (record) {
      record.id = row.id
      record.summary = row.identitySummary
    }
  }
  applyAlsNestedPremises(rows, options.sourceVersion)
  suppressAlsUnnamedPremises(rows, options.sourceVersion, consolidatedParentVariants)
  const coordinateChanges = backfillAlsCoordinates(
    rows,
    options.sourceVersion,
    options.skipCurationChecks,
  )
  backfillOiHei(rows, options.sourceVersion, options.skipCurationChecks)
  assertUniquePreparedRowIds(rows)
  classifyReviewedAlsPremises(rows, options.sourceVersion, 'shops')
  finishReviewedAlsPremiseRetentions(rows)
  classifyReviewedAlsPremises(rows, options.sourceVersion, 'final-parents')
  applyReviewedAlsDerivedHierarchy(rows, options.sourceVersion)
  recordReviewedAlsCoalescences(rows, options.sourceVersion)
  applyReviewedAlsParents(rows, options.sourceVersion, 'hierarchy')
  applyReviewedStructuredComponents(rows, options.sourceVersion)
  applyAlsDivisionMembership(rows, divisionMaps)
  const divisionQuality = buildHkgovAlsDivisionQuality(rows)
  auditGuards.passed('unique-identities', rows.length)
  auditGuards.passed('coordinate-source', coordinateChanges.backfilled)
  auditGuards.passed(
    'component-gap',
    estateComponents.applications.length + estateGaps.applications.length,
  )
  if (options.writeOutput !== false)
    await writeAlsParquet({
      filename: outputFile,
      rows,
      columnData: rows => [
        jsonColumn(
          'publisherSource',
          rows.map(row =>
            JSON.stringify(
              publisherSources.get(
                alsSourceLocator({
                  sourceFile: row.sourceFile,
                  featureIndexOneBased: row.sourceFeatureIndexOneBased,
                }),
              ) ?? null,
            ),
          ),
        ),
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
        ...(
          [
            'ruralAreaId',
            'macrohoodId',
            'neighbourhoodId',
            'villageId',
            'microhoodId',
            'hamletId',
          ] as const
        ).map(field =>
          stringColumn(
            field,
            rows.map(row => row[field] ?? null),
          ),
        ),
        stringColumn(
          'townId',
          rows.map(row => row.townId ?? null),
        ),
        stringColumn(
          'landformId',
          rows.map(row => row.landformId ?? null),
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

  // Release temporary Parquet encodings before constructing the retained audit.
  Bun.gc(true)
  const curationApplications = [
    ...estateComponents.applications,
    ...estateGaps.applications,
  ]

  // This runs after every alias, hierarchy, suppression and coordinate correction,
  // using the same normaliser as ingestion. Identity drift records are earlier.
  const membershipData = buildAlsMembership({
    sourceVersion: options.sourceVersion,
    rows,
    publisherSources,
    collections: inventoryMembership.collections,
    sources3d: inventoryMembership.sources,
    aliases: new Map([...reviewedAliases, ...aliasOwnerIds]),
  })
  validateReviewedAlsInventories(membershipData, options.sourceVersion)
  if (options.writeOutput !== false) {
    const reviewSha256 = await writeAlsReviewCache(outputFile, options.sourceVersion, [
      ...reviewIssues,
      ...drift.candidates.map(evidence => ({ code: 'identity-drift', evidence })),
      ...curationApplications
        .filter(row => row.verification === 'unverified')
        .map(evidence => ({ code: 'unverified-curation', evidence })),
      ...divisionQuality.issues.map(evidence => ({
        code: 'division-linkage',
        evidence,
      })),
    ])
    await writeFile(
      `${outputFile}.address3d.meta.json`,
      JSON.stringify({
        sourceVersion: options.sourceVersion,
        reviewSha256,
        parquetSha256: await fileSha256(outputFile),
        sidecarSha256: await fileSha256(`${outputFile}.address3d.jsonl`),
      }),
    )
  }
  if (options.writeOutput !== false) {
    membershipData.preparedSha256 = await fileSha256(outputFile)
    membershipData.address3dSha256 = await fileSha256(`${outputFile}.address3d.jsonl`)
  }
  const membership = await writeAlsMembership(
    options.membershipFile ?? `${outputFile}.membership.json`,
    membershipData,
  )

  const processingActions = buildHkgovAlsProcessingActions({
    decisions: options.identityDecisions ?? emptyHkgovAlsIdentityDecisions(),
    identityEquivalentFeatureGroups,
    resolvedRows: rows,
    sourceDuplicateFeatureGroups,
  })
  if (options.writeOutput !== false) {
    await writeFile(
      `${outputFile}.audit.json`,
      JSON.stringify({
        schemaVersion: 1,
        sourceVersion: options.sourceVersion,
        preparedSha256: await fileSha256(outputFile),
        divisionSnapshotId: divisionMaps.snapshotId,
        divisionAreaSnapshotId: divisionMaps.areaSnapshotId,
        sourceFeatureCount,
        outputCount: rows.length,
        declarations: {
          preparation: await freezeRegisteredRule(alsPreparationRule.declaration),
          curation: await freezeRegisteredRule(alsCurationRule.declaration),
        },
        fixtures: alsAuditFixtures,
        guards: auditGuards.results(),
        processingActions,
      }),
    )
  }
  return {
    membership,
    curationApplications,
    deduplicatedFeatureCount: sourceFeatureCount - uniqueSourceFeatureCount,
    driftCandidates: drift.candidates,
    featureCount: sourceFeatureCount,
    identityConsolidatedFeatureCount:
      uniqueSourceFeatureCount - identityDistinctRows.length,
    identityEquivalentFeatureGroups,
    resolvedIdConsolidatedFeatureCount:
      identityDistinctRows.length - resolvedIdDistinctRows.length,
    identityRecords: resolvedIdentityRecords,
    outputFile,
    processingActions,
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
