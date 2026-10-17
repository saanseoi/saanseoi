import type { ProducerSpecification } from './fieldLineageProducer'

const places = 'apps/harbour-cli/src/lib/pipeline/places/'
const als = 'apps/harbour-cli/src/lib/sources/hkgov/dpo/'
const receiptGuards = [
  'Resolve the exact recorded dependency snapshot, then its prepared publication receipt scope. A current scope without the selected snapshot receipt is not a substitute.',
  'Use retained history replay when the selected projection is not serving. Missing exact content or an incomplete receipt blocks processing.',
]

export function companionProducer(
  path: string,
  family: 'place' | 'address',
): ProducerSpecification | null {
  if (path === 'dependencySelection')
    return {
      inputs: [],
      reads: {
        captured: {
          stage: 'registry',
          collection: 'processingContext',
          path: 'snapshotDependencies',
          role: 'selection',
        },
      },
      implementation: {
        path: `${places}processLocalPlaceSqlUploadPreparation.ts`,
        symbol: 'resolvePlaceSnapshots',
      },
      expression:
        'Read the producer snapshot dependency IDs recorded by preparation; replay always selects these exact IDs.',
      selectionAtPreparation:
        family === 'place'
          ? 'Prefer the recorded published Address dependency. For a new preparation, choose latest hkgov-dpo Address at/before the cohort, otherwise earliest at/after it; Division and DivisionArea must be the exact dependencies recorded by that Address snapshot.'
          : 'ALS selects the latest published reviewed SaanSeoi Division edition, falling back to the exact Overture cohort. Select the matching DivisionArea variant/cohort/revision and record both IDs.',
      additionalImplementations: [
        {
          path: `${places}placeSnapshotDependencies.ts`,
          symbol: 'resolvePlaceDivisionDependency',
        },
        { path: `${als}hkgovAlsDivisions.ts`, symbol: 'loadDivisionLookupMaps' },
      ],
      guards: [
        'Require published dependencies; do not repeat temporal selection when explaining a retained release.',
      ],
    }
  const reads: Record<
    string,
    { role: string; collection: string; fields: string; symbol?: string; file?: string }
  > = {
    officialAddresses: {
      role: 'address',
      collection: 'address2d',
      fields:
        'id,parentAddressId,geometry,divisionSnapshotId,countryId,islandId,areaId,districtId,townId,ruralAreaId,macrohoodId,villageId,neighbourhoodId,hamletId,microhoodId',
    },
    officialAddressDefinitions: {
      role: 'address',
      collection: 'address2dI18n',
      fields:
        'addressId,locale,formattedAddress,buildingName,estateName,blockExpression,phaseExpression,streetName,buildingNumberExpression,buildingNumberFrom,buildingNumberTo',
    },
    selectedDivisions: {
      role: 'division',
      collection: 'divisions',
      fields: 'id,class,level,hierarchies,i18n',
      file: 'processLocalPlaceSqlUploadPreparation.ts',
      symbol: 'stageEnrichedPlaces',
    },
    selectedDivisionNames: {
      role: 'division',
      collection: 'divisionsI18n',
      fields: 'divisionId,locale,name',
      file: 'placeSearchDependencies.ts',
      symbol: 'createPlaceSearchDependencies',
    },
    selectedDivisionAreas: {
      role: 'divisionArea',
      collection: 'divisionAreas',
      fields: 'divisionId,geometry',
      file: 'processLocalPlaceSqlUploadPreparation.ts',
      symbol: 'stageEnrichedPlaces',
    },
    selectedAddress3dCollections: {
      role: 'address',
      collection: 'address3d',
      fields: 'address2dId,id,membership,units,i18n',
      file: 'placeAddress3d.ts',
      symbol: 'loadCollection',
    },
  }
  const selected = reads[path]
  if (selected)
    return {
      inputs: ['dependencySelection'],
      reads: {
        rows: {
          stage: 'canonical',
          collection: selected.collection,
          path: '$',
          dependency: selected.role,
        },
      },
      implementation: {
        path:
          family === 'address' && selected.role.startsWith('division')
            ? `${als}hkgovAlsDivisions.ts`
            : `${places}${selected.file ?? 'processLocalPlaceSqlUploadSupplementary.ts'}`,
        symbol:
          family === 'address' && selected.role.startsWith('division')
            ? 'loadDivisionLookupMaps'
            : (selected.symbol ?? 'prepareSupplementaryAddressesLocked'),
      },
      expression: `Select ${selected.fields} from ${selected.collection} for dependencySelection.${selected.role}; retain the declared snapshotId separately from its physical receipt scopeId.`,
      steps:
        path === 'officialAddressDefinitions'
          ? ['Include only en and zh-hant definitions for address matching.']
          : [],
      guards: [
        ...receiptGuards,
        ...(path === 'selectedDivisionAreas'
          ? [
              'Require a DivisionArea receipt with both preparedAt and publicationToken.',
            ]
          : []),
      ],
      upstreamLineage: {
        resourceType: selected.role,
        key: 'dependencySelection snapshotId + record identity + exact version',
        fields: selected.fields.split(','),
      },
      additionalImplementations: [
        {
          path: `${places}processLocalPlaceSqlUploadPreparation.ts`,
          symbol: 'stageEnrichedPlaces',
        },
      ],
    }
  if (path === 'predecessorPlaceHistory')
    return {
      inputs: [],
      reads: {
        predecessor: {
          stage: 'registry',
          collection: 'processingContext',
          path: 'publicationPrevious',
          role: 'selection',
        },
        versions: {
          stage: 'canonical',
          collection: 'places,placesI18n',
          path: '$',
          dependency: 'place-predecessor',
        },
      },
      implementation: {
        path: `${places}placeHistoryBaseline.ts`,
        symbol: 'loadCurrentPlaceHistory',
      },
      expression:
        'resolveSnapshotVersionState(predecessor replay plan); fetch exact recordId/locale/versionHash on assigned shards and join locales by placeId.',
      steps: [
        'With no predecessor the replay is empty.',
        'Compare resolved IDs with serving predecessor membership and retain its Division links.',
      ],
      guards: [
        'Reject unassigned or duplicate shards, missing/duplicate exact versions, locale rows without their base and serving membership disagreement.',
      ],
    }
  if (path === 'previousAddressLinks')
    return {
      inputs: ['sourceVersion', 'sourceReleaseId'],
      reads: {
        history: {
          stage: 'canonical',
          collection: 'places',
          path: '$',
          dependency: 'place-address-history',
        },
      },
      implementation: {
        path: `${places}processLocalPlaceSqlUploadSupplementary.ts`,
        symbol: 'prepareSupplementaryAddressesLocked',
      },
      expression:
        'For each placeId select the lexicographically greatest lastSeenMonth:createdAt among linked history rows with lastSeenMonth <= sourceVersion.slice(0,7) and resourceReleaseId != incoming resourceReleaseId.',
      steps: [
        'Return addressId, addressSnapshotId and addressFingerprint(previous.addresses strings). This is distinct from exact serving-predecessor content selection.',
      ],
    }
  if (path === 'addressDependencyHash')
    return {
      inputs: ['selectedAddress', 'unitReference', 'dependencySelection'],
      reads: {
        localisations: {
          stage: 'canonical',
          collection: 'address2dI18n,address3dI18n',
          path: '$',
          dependency: 'address',
        },
      },
      implementation: {
        path: `${places}placeSearchDependencies.ts`,
        symbol: 'createPlaceSearchDependencies',
      },
      expression:
        'No selected base => null; otherwise createHash({base: stableBase, ownerId, unit, locales: sortedLocalisations, unitLocales: sortedUnitLocalisations}).',
      steps: [
        'Load exact selected Address base/locales and matched Address3D unit/owner. Supplementary rows/locales come from the newly materialised supplementary inventory.',
        'Exclude snapshotId, divisionSnapshotId, streetSnapshotId, createdAt, updatedAt and sources from base; exclude snapshotId/createdAt/updatedAt from Address locale rows.',
        'Sort locales by locale; retain only the selected unit localisation in each collection locale. No base produces null.',
      ],
    }
  if (path === 'selectedAddressSnapshotId')
    return {
      inputs: ['resolution', 'dependencySelection'],
      reads: {
        supplementary: {
          stage: 'registry',
          collection: 'processingContext',
          path: 'supplementarySnapshotId',
          role: 'selection',
        },
      },
      implementation: {
        path: `${places}processLocalPlaceSqlUploadPreparation.ts`,
        symbol: 'stageEnrichedPlaces',
      },
      expression:
        'resolution.tier === "supplementary" ? supplementarySnapshotId : dependencySelection.address',
    }
  if (path === 'divisionAssociation')
    return {
      inputs: ['divisionMembership', 'dependencySelection'],
      implementation: {
        path: `${places}processLocalPlaceSqlUploadPreparation.ts`,
        symbol: 'stageEnrichedPlaces',
      },
      expression:
        '{divisionSnapshotId: dependencySelection.division, divisionAreaSnapshotId: dependencySelection.divisionArea, evidence: divisionMembership.evidence.filter(row => Object.values(divisionMembership.references).includes(row.divisionId))}',
    }
  if (path === 'divisionMaps')
    return {
      inputs: ['selectedDivisions', 'selectedDivisionAreas', 'dependencySelection'],
      implementation: {
        path: `${als}hkgovAlsDivisions.ts`,
        symbol: 'buildDivisionLookupMaps',
      },
      expression:
        'Build locale-normalised area/district/country maps with ambiguity sets, town and landform lookups; attach createDivisionMembership(divisions, areas) and exact snapshot IDs.',
      guards: [
        'Ambiguous names must not silently select a Division. Spatial membership uses the selected area inventory.',
      ],
    }
  return null
}
