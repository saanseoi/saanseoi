import type { ProducerSpecification } from './fieldLineageProducer'
import instructionTypes from '../../../fixtures/meta/fieldLineage/als-instruction-types.json'
const dir = 'apps/harbour-cli/src/lib/sources/hkgov/dpo/'
const core = 'libs/core/src/pipeline/services/addresses/'

// Order is significant: later operations consume the surviving inventory, including synthetic rows.
export const alsInventoryTransforms = [
  [
    'applyReviewedBlockDetailBackfills',
    'hkgovAlsBlockDetailBackfills',
    'curation',
    'Backfill reviewed bilingual block components under source identity/version guards.',
  ],
  [
    'applyReviewedSchoolReconciliations',
    'hkgovAlsSchoolReconciliations',
    'curation',
    'Reconcile reviewed school premises and their identities.',
  ],
  [
    'applyReviewedHouseStreetIdentities',
    'hkgovAlsHouseStreetIdentities',
    'curation',
    'Apply reviewed house/street canonical identities.',
  ],
  [
    'applyReviewedStreetEstateComplexes',
    'hkgovAlsStreetEstateComplexes',
    'curation',
    'Materialise reviewed street/estate complex relationships.',
  ],
  [
    'linkReviewedHouseStreetParents',
    'hkgovAlsHouseStreetIdentities',
    'curation',
    'Resolve reviewed parent links after house/street identities.',
  ],
  [
    'suppressReviewedYueWanPremise',
    'hkgovAlsYueWanSuppression',
    'curation',
    'Suppress the specifically reviewed duplicate premise.',
  ],
  [
    'applyReviewedComplexPromotions',
    'hkgovAlsComplexPromotions',
    'curation',
    'Promote reviewed complexes, including synthetic parent rows and component edits.',
  ],
  [
    'applyReviewedEstateComplexes',
    'hkgovAlsEstateComplexDecisions',
    'curation',
    'Apply accepted estate complex ownership and structure.',
  ],
  [
    'applyApprovedIssueBatch',
    'hkgovAlsApprovedIssueBatch',
    'curation',
    'Apply approved issue instructions; unreviewed guard failures block.',
  ],
  [
    'applyAlsPremiseConsolidations',
    'hkgovAlsPremiseConsolidations',
    'curation',
    'Fold reviewed duplicate premises and their source evidence.',
  ],
  [
    'retainNamedPremises',
    'hkgovAlsNamedPremiseRetentions',
    'curation',
    'Retain explicitly reviewed named premise identities.',
  ],
  [
    'applyReviewedPremiseRenames',
    'hkgovAlsPremiseRenames',
    'curation',
    'Apply reviewed bilingual premise renames with expected-value guards.',
  ],
  [
    'applyReviewedBuildingOverrides',
    'hkgovAlsBuildingOverrides',
    'curation',
    'Apply reviewed building component replacements.',
  ],
  [
    'applyReviewedIdentityComponentBackfills',
    'hkgovAlsIdentityComponentBackfills',
    'curation',
    'Restore identity components using reviewed source assertions.',
  ],
  [
    'applyReviewedAlsPremiseRetentions',
    'hkgovAlsReviewedPremiseRetentions',
    'curation',
    'Apply the selected retained-premise instructions and aliases.',
  ],
  [
    'applyReviewedAlsDerivedHierarchy',
    'hkgovAlsReviewHierarchy',
    'curation',
    'Apply reviewed duplicate suppression and derived parent relationships from the review program.',
  ],
  [
    'recordReviewedAlsCoalescences',
    'hkgovAlsReviewHierarchy',
    'curation',
    'Record guarded identity coalescence evidence for the declared cohort.',
  ],
  [
    'applyReviewedAlsParents',
    'hkgovAlsReviewProgram',
    'curation',
    'Apply declared parent assignments from the validated review program under source-version and identity guards.',
  ],
] as const
const tailTransforms = [
  [
    'applyAlsEstateNames',
    'hkgovAlsEstateNames',
    'curation',
    'Apply the reviewed estate-name assignments.',
  ],
  [
    'applyAlsLocalities',
    'hkgovAlsLocalities',
    'curation',
    'Apply reviewed locality assignments.',
  ],
  [
    'restoreAlsEstateComponents',
    'hkgovAlsEstateComponents',
    'curation',
    'Restore reviewed missing estate components.',
  ],
  [
    'restoreAlsEstateGaps',
    'hkgovAlsEstateGapRestorations',
    'curation',
    'Restore estate gaps; update resolved identity records for reviewed continuity.',
  ],
  [
    'applyAlsNestedPremises',
    'hkgovAlsNestedPremises',
    'curation',
    'Establish reviewed nested-premise parent relationships.',
  ],
  [
    'suppressAlsUnnamedPremises',
    'hkgovAlsUnnamedPremiseSuppressions',
    'curation',
    'Suppress reviewed unnamed premises.',
  ],
  [
    'backfillAlsCoordinates',
    'hkgovAlsCoordinateBackfills',
    'curation',
    'Apply reviewed coordinate sources after identity and locality changes.',
  ],
  [
    'backfillOiHei',
    'hkgovAlsOiHeiBackfill',
    'curation',
    'Apply the guarded Oi Hei coordinate backfill.',
  ],
  [
    'finishReviewedAlsPremiseRetentions',
    'hkgovAlsReviewedPremiseRetentions',
    'curation',
    'Finish retained-premise changes before final hierarchy and membership.',
  ],
  ...alsInventoryTransforms.slice(15),
] as const

function reviewedRead(): NonNullable<ProducerSpecification['reads']> {
  return {
    instructions: {
      stage: 'audit',
      collection: 'retainedInstructions',
      path: 'alsAuditFixtures',
      role: 'value',
    },
  }
}
const preparedFields = new Set([
  'id',
  'canonicalId',
  'geometry',
  'identifiers',
  'parentAddressId',
  'hierarchyCuration',
  'curatedGranularity',
  'divisionSnapshotId',
  'engPremisesAddressJson',
  'chiPremisesAddressJson',
  ...['en', 'zhHant'].flatMap(locale =>
    [
      'FormattedAddress',
      'BuildingName',
      'EstateName',
      'BlockDescriptor',
      'BlockNumber',
      'PhaseName',
      'PhaseRef',
      'StreetName',
      'StreetNumberFrom',
      'StreetNumberTo',
      'VillageName',
      'VillageNumberFrom',
      'VillageNumberTo',
    ].map(field => locale + field),
  ),
])

export function alsPreparedProducer(path: string): ProducerSpecification | null {
  if (preparedFields.has(path))
    return {
      inputs: ['alsCorrectedRow'],
      implementation: {
        path: `${core}normalisation.ts`,
        symbol: 'normaliseAddressRowForPipelineInternal',
      },
      expression: `alsCorrectedRow.row[${JSON.stringify(path)}]`,
      steps: [
        'Select the final surviving prepared row after inventory, identity, hierarchy and coordinate operations; component corrections apply to a copy before canonical projection.',
      ],
    }
  if (path === 'alsRawFeatures')
    return {
      inputs: [],
      reads: { archive: { stage: 'raw', collection: 'archive', path: '$' } },
      implementation: {
        path: `${dir}hkgovAls.ts`,
        symbol: 'prepareHkgovAlsAddressParquetInternal',
      },
      expression:
        'Sort district 2D als_addresses_(..._district).geojson files; flatten features with sourceFile and one-based feature index.',
      guards: [
        'Exclude separate 3D files. Require at least one district file and feature. Capture publisher assertions before corrections or synthetic additions.',
      ],
    }
  if (path === 'alsRetainedFeatures')
    return {
      inputs: ['alsRawFeatures', 'sourceVersion'],
      reads: reviewedRead(),
      layer: 'curation',
      instructionSelector: {
        fixtureTypes: instructionTypes.hkgovAlsAuditFixtures,
        documentSet: 'alsAuditFixtures',
      },
      implementation: {
        path: `${dir}hkgovAls.ts`,
        symbol: 'prepareHkgovAlsAddressParquetInternal',
      },
      expression:
        'Validate cohort source assumptions; retain reviewed premises/commercial premises/houses, reconstruct estate complexes and premises, append reviewed 2D backfill features; deduplicate equivalent publisher features.',
      steps: [
        'Preserve captured publisher sources and label every reconstructed/retained row with its instruction identity.',
        'A mismatching expected source assertion is a blocking review guard, never a reason to apply an instruction approximately.',
      ],
      additionalImplementations: [
        'hkgovAlsReviewedPremiseRetentions',
        'hkgovAlsCommercialRetentions',
        'hkgovAlsHouseRetentions',
        'hkgovAlsPremiseReconstructions',
        'hkgovAls2dBackfills',
        'hkgovAlsEstateComplexDecisions',
      ].map(file => ({ path: `${dir}${file}.ts`, symbol: 'export' })),
    }
  if (path === 'alsBaselineRows')
    return {
      inputs: ['alsRetainedFeatures', 'divisionMaps', 'sourceVersion'],
      reads: reviewedRead(),
      implementation: {
        path: `${dir}hkgovAlsNormalisation.ts`,
        symbol: 'normaliseHkgovAlsFeature',
      },
      expression:
        'Map the deduplicated inventory through normaliseHkgovAlsFeature with release-wide Roman-number/phase families and selected Division maps.',
      steps: [
        'Collect English building/premise-number and numeric phase families across the release. Honour postProcessPremiseStructure, default true.',
        'Resolve guarded Lin Tsui geometry and CSU corrections before identity construction. Use corrected CSU then GeoAddress; require an identity building key.',
        'Normalise bilingual premise structure; prefer street then village numbers; use named locality and district matching for initial town/landform references.',
        'Build premise continuity/identity keys from corrected premise components, route kind/name, numbers and coordinates; derive the provisional canonical ID.',
        'Preserve raw Eng/ChiPremisesAddress JSON separately from flattened canonical components. Format English with comma/space and Chinese without separators; retain raw publisher evidence and applied correction IDs.',
      ],
      additionalImplementations: [
        { path: `${dir}hkgovAlsIdentity.ts`, symbol: 'buildHkgovAlsPremiseIdentity' },
        {
          path: `${dir}hkgovAlsPremiseNormalisation.ts`,
          symbol: 'normaliseHkgovAlsPremiseStructure',
        },
        { path: `${dir}hkgovAlsCsuCorrections.ts`, symbol: 'resolveAlsCsuCorrection' },
        { path: `${dir}hkgovAlsLinTsui.ts`, symbol: 'resolveLinTsui' },
      ],
    }
  const match = /^als(Initial|Final)Transform(\d+)$/.exec(path)
  if (match) {
    const list = match[1] === 'Initial' ? alsInventoryTransforms : tailTransforms
    const index = Number(match[2]),
      transform = list[index]
    if (!transform) return null
    return {
      inputs: [
        index
          ? `als${match[1]}Transform${index - 1}`
          : match[1] === 'Initial'
            ? 'alsBaselineRows'
            : 'alsIdentityRows',
        'sourceVersion',
      ],
      reads: reviewedRead(),
      layer: transform[2],
      implementation: { path: `${dir}${transform[1]}.ts`, symbol: transform[0] },
      expression: `${transform[0]}(survivingRows, sourceVersion); preserve untouched rows and return the mutated inventory.`,
      steps: [
        transform[3],
        'Select instructions and branches by their exact source-version, identity and expected-component guards. Retain instruction IDs for reviewed edits; automatic branches retain counts.',
      ],
      guards: [
        'A guard failure is an error, not fallback to another candidate. Row insertions/deletions and aliases participate in subsequent inventory operations.',
      ],
      instructionSelector: {
        fixtureTypes:
          (instructionTypes as Record<string, string[]>)[transform[1]] ?? [],
        documentSet: 'alsAuditFixtures',
        implementation: transform[1],
        identity: 'row.id / CSU / GeoAddress as declared by the instruction',
        sourceVersion: 'sourceVersion',
      },
    }
  }
  if (path === 'alsIdentityRows')
    return {
      inputs: [
        `alsInitialTransform${alsInventoryTransforms.length - 1}`,
        'sourceVersion',
      ],
      reads: {
        ...reviewedRead(),
        identity: {
          stage: 'audit',
          collection: 'retainedInstructions',
          path: 'alsIdentityHistoryAndDecisions',
        },
        archive3d: { stage: 'raw', collection: 'archive', path: '3d' },
      },
      layer: 'curation',
      instructionSelector: {
        fixtureTypes: instructionTypes.hkgovAlsAuditFixtures,
        documentSet: 'alsAuditFixtures',
      },
      implementation: {
        path: `${dir}hkgovAls.ts`,
        symbol: 'prepareHkgovAlsAddressParquetInternal',
      },
      expression:
        'Consolidate equivalent premises, resolve identity drift, coalesce aliases, prepare Address3D collections and remove consumed alias-owner rows.',
      steps: [
        'Capture reviewed identity aliases, consolidate equivalent premises and require unique IDs. Resolve continuity/identity against the retained history and explicit drift decisions.',
        'For resolved identities replace id/canonicalId, retain provisional identityAlias and match method. Consolidate rows sharing the resolved ID and attach reviewed aliases.',
        'Coalesce aliased premises, then build 3D collections from publisher source and reviewed instructions. Remove rows owned by a surviving alias and recheck unique IDs.',
      ],
      additionalImplementations: [
        { path: `${dir}hkgovAlsDrift.ts`, symbol: 'resolveHkgovAlsIdentityDrift' },
        { path: `${dir}hkgovAls3dPreparation.ts`, symbol: 'prepareAls3dCollections' },
        {
          path: `${dir}hkgovAlsAliasedPremiseCoalescences.ts`,
          symbol: 'coalesceAlsAliasedPremises',
        },
      ],
    }
  if (path === 'alsFinalRows')
    return {
      inputs: [`alsFinalTransform${tailTransforms.length - 1}`, 'divisionMaps'],
      implementation: {
        path: `${dir}hkgovAlsDivisionMembership.ts`,
        symbol: 'applyAlsDivisionMembership',
      },
      expression:
        'Resolve every surviving row against selected Division geometry after all coordinate/locality/hierarchy changes; assign divisionFields and retain membership evidence.',
      guards: [
        'Require a Division geometry index and unique final canonical identities.',
      ],
    }
  if (path === 'alsSelectedRow')
    return {
      inputs: ['alsFinalRows'],
      reads: {
        identity: {
          stage: 'request',
          collection: 'selectedRecord',
          path: 'id',
          role: 'selection',
        },
      },
      implementation: {
        path: `${dir}hkgovAls.ts`,
        symbol: 'prepareHkgovAlsAddressParquetInternal',
      },
      expression:
        'Select the unique surviving row by canonicalId/id. Suppressed or merged-away identities emit no independent Address. Synthetic rows follow the same selection.',
    }
  if (path === 'alsCorrectedRow')
    return {
      inputs: ['alsSelectedRow', 'sourceVersion'],
      reads: {
        instructions: {
          stage: 'audit',
          collection: 'retainedInstructions',
          path: 'hkgov-dpo-address-components.corrections',
        },
      },
      layer: 'curation',
      instructionSelector: { fixtureTypes: ['hkgov-dpo-address-components'] },
      implementation: {
        path: `${core}componentCorrections.ts`,
        symbol: 'correctHkgovAddressComponents',
      },
      expression:
        'Return {row, applied}; copy only when a reviewed component correction applies.',
      guards: [
        'Match CSU and known GeoAddress, inclusive source-version range and every expected field. Only en/zhHant building/estate names may be overridden. Preserve the source building label when reassigning it to estate; reject excluded names.',
      ],
    }
  if (path === 'componentCorrections' || path === 'i18n')
    return {
      inputs: ['alsCorrectedRow', 'sourceVersion'],
      implementation: {
        path: `${core}normalisation.ts`,
        symbol: 'normalisePreparedHkgovAddressRow',
      },
      expression:
        path === 'componentCorrections'
          ? 'alsCorrectedRow.applied'
          : 'normalisePreparedHkgovAddressRow(alsCorrectedRow.row, sourceVersion, alsCorrectedRow.applied).i18n',
      steps: [
        'Emit en/zh-hant locale rows only with formattedAddress. Derive number, block and phase components using the canonical Address normaliser.',
      ],
    }
  if (path === 'divisionRelationships')
    return {
      inputs: ['alsCorrectedRow'],
      implementation: {
        path: 'apps/atlas-api/src/db/addresses.ts',
        symbol: 'addressDivisionRelationshipsFromDedicatedIds',
      },
      expression:
        'Project non-empty canonical countryId, islandId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, microhoodId, villageId and hamletId; associate each with its declared role and retained divisionSnapshotId.',
    }
  return null
}
