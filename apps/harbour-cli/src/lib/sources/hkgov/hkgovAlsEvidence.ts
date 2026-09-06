import type { HkgovAlsIdentityDecisions } from './hkgovAlsDrift.ts'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import type {
  HkgovAlsDivisionQuality,
  HkgovAlsFeature,
  HkgovAlsSourceDuplicateGroup,
  HkgovAlsSourceFeature,
  PreparedHkgovAlsRow,
} from './hkgovAlsTypes.ts'
import {
  asOptionalString,
  compactAddress,
  formatEnPremisesAddress,
  formatZhPremisesAddress,
  joinStreetNumberRange,
} from './hkgovAlsNormalisation.ts'

/**
 * A reviewed ALS drift decision can make two source variants in the *same*
 * release resolve to one canonical premise. Keep a single service record, favouring
 * the representation that carries the most structured premise detail. The full
 * official source JSON remains in the release input/history.
 */
export function consolidateRowsSharingResolvedId(rows: PreparedHkgovAlsRow[]) {
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

  for (const row of input.resolvedRows) {
    const phaseName = row.enPhaseRomanNumeralNormalisation
    if (!phaseName) continue
    actions.push({
      action: 'als_phase_roman_numeral_normalised',
      affectedRecordCount: 1,
      evidence: {
        canonicalRecord: summariseHkgovAlsProcessingRow(row),
        phaseName,
      },
      mode: 'automatic' as const,
      summary:
        'Styled an ALS phase name with the Arabic numbering used by its estate phase series.',
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

export function assertUniquePreparedRowIds(rows: PreparedHkgovAlsRow[]) {
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
