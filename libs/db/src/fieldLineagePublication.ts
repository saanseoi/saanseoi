import type { CurrentFieldRule } from './fieldLineageCurrentRules'
import type { ProducerSpecification } from './fieldLineageProducer'

const addressApi = 'apps/atlas-api/src/services/addresses.ts'
const addressReader = 'apps/atlas-api/src/db/addresses.ts'
const divisionReader = 'apps/atlas-api/src/db/divisions.ts'
const statisticReader = 'apps/atlas-api/src/db/statistics.ts'

/** Publication metadata and response joins are selected from the bound snapshot. */
export function publicationFieldRule(
  resource: string,
  apiField: string,
): CurrentFieldRule | null {
  const field = apiField.replace(/^attributes\./, '')
  const make = (
    path: string,
    symbol: string,
    expression: string,
    inputs: string[],
    description: string,
  ): CurrentFieldRule => ({
    implementation: { path, symbol },
    expression,
    inputs,
    human: { kind: 'lookup', title: field, description },
  })
  if (field === 'createdAt' && ['address', 'division', 'statistic'].includes(resource))
    return make(
      resource === 'address'
        ? addressReader
        : resource === 'division'
          ? divisionReader
          : statisticReader,
      'createdAt',
      'selectedContentVersion.createdAt',
      ['selectedContentVersion'],
      'Read the creation timestamp stored on the exact content version selected by this release. This is a materialisation timestamp, not a publisher date.',
    )
  if (
    field === 'snapshotId' &&
    ['address', 'division', 'divisionArea', 'divisionBoundary'].includes(resource)
  )
    return make(
      resource === 'address' ? addressReader : divisionReader,
      'snapshotId',
      'Selected response record snapshotId from the release membership or exact history replay.',
      ['snapshotId'],
      'Identify the snapshot selected for this resource in the requested release.',
    )
  if (resource !== 'address') return null
  if (field === 'datasetCode')
    return make(
      addressApi,
      'createAddressResource',
      'activeSnapshot.datasetBySnapshot.get(address.snapshotId); missing binding is an error.',
      ['snapshotId', 'datasetCode'],
      'Look up the owning dataset of this Address snapshot in the selected release.',
    )
  if (field === 'address3dCoverage')
    return make(
      'libs/db/src/address3d.ts',
      'resolveAddress3dCoverage',
      'resolveAddress3dCoverage(selectedAddressRecord, selectedAddressCollections)',
      ['selectedAddressRecord', 'selectedAddressCollections'],
      'Prefer a collection owned directly by this Address. Otherwise use its parent collection only when this Address is listed as an unresolved section. With neither, report no coverage.',
    )
  if (field === 'relationships.units')
    return make(
      addressApi,
      'createAddressResource',
      'coverage.kind === "none" ? {data:null,meta:{address3dCoverage:coverage}} : {data:{type:"address3d",id:coverage.address3dId},meta:{address3dCoverage:coverage}}',
      ['addressCoverage'],
      'Link to the selected Address3D collection and include its coverage. Return a null relationship when coverage is absent.',
    )
  if (field === 'relationships.hierarchy')
    return make(
      addressApi,
      'addressHierarchyIds',
      'Select countryId, islandId, areaId, districtId, townId, ruralAreaId, macrohoodId, neighbourhoodId, villageId, microhoodId and hamletId in that order; remove empty values.',
      ['selectedAddressRecord'],
      'Link the non-empty Division identities stored on the selected Address, in the response hierarchy order.',
    )
  return null
}

export function publicationProducer(
  resource: string,
  path: string,
): ProducerSpecification | null {
  if (resource === 'division' && path === 'divisionCodesByCanonicalId')
    return {
      inputs: [],
      reads: {
        assignments: {
          stage: 'registry',
          collection: 'divisionCodes',
          path: 'hkgov-pland-new-town',
        },
      },
      implementation: {
        path: 'apps/harbour-cli/src/lib/pipeline/divisions/processLocalHkgovPlandDivisionSqlUploadPreparation.ts',
        symbol: 'loadPlandNewTownDivisionCodes',
      },
      expression:
        'Index retained hkgov-pland-new-town assignments by canonicalId; reject duplicate canonical targets.',
      human: {
        kind: 'lookup',
        title: 'New Town codes',
        description:
          'Use the registered New Town code assigned to this canonical Division identity.',
      },
    }
  if (path === 'selectedContentVersion') {
    const file =
      resource === 'address'
        ? addressReader
        : resource === 'division'
          ? divisionReader
          : statisticReader
    return {
      inputs: ['snapshotId'],
      reads: {
        version: {
          stage: 'canonical',
          collection: `selected-${resource}-version`,
          path: 'createdAt',
        },
      },
      implementation: { path: file, symbol: 'createdAt' },
      expression:
        'Read the persisted creation timestamp of the content version selected by the bound snapshot and record identity.',
      guards: [
        'Require exact snapshot membership and content version; never substitute current content for historical content or generate a new clock value.',
      ],
      human: {
        kind: 'select',
        title: 'Selected content version',
        description:
          'Use the stored content version belonging to this release and record identity.',
      },
    }
  }
  if (resource === 'address' && path === 'selectedAddressRecord')
    return {
      inputs: ['snapshotId'],
      reads: {
        record: {
          stage: 'canonical',
          collection: 'selected-address-version',
          path: '$',
        },
      },
      implementation: { path: addressReader, symbol: 'mapAddressRow' },
      expression:
        'Read the exact Address version selected by snapshot membership, including its parent and materialised Division identities.',
      human: {
        kind: 'select',
        title: 'Selected Address',
        description:
          'Use this release’s Address identity, parent and Division associations.',
      },
    }
  if (resource === 'address' && path === 'selectedAddressCollections')
    return {
      inputs: ['selectedAddressRecord', 'snapshotId'],
      reads: {
        collections: {
          stage: 'canonical',
          collection: 'address3d',
          path: '$',
        },
      },
      implementation: {
        path: 'apps/atlas-api/src/db/address3d.ts',
        symbol: 'attachAddress3dCoverage',
      },
      expression:
        'Select collections owned by the Address or its immediate parent from the same Address snapshot. Use the prepared current scope or replay the exact historical collection versions.',
      guards: [
        'Require the selected snapshot; a collection from another release cannot establish coverage.',
      ],
      human: {
        kind: 'lookup',
        title: 'Address unit collections',
        description:
          'Look up this Address and its parent’s collections within the same selected snapshot.',
      },
    }
  if (resource === 'address' && path === 'addressCoverage')
    return {
      inputs: ['selectedAddressRecord', 'selectedAddressCollections'],
      implementation: {
        path: 'libs/db/src/address3d.ts',
        symbol: 'resolveAddress3dCoverage',
      },
      expression:
        'resolveAddress3dCoverage(selectedAddressRecord, selectedAddressCollections)',
      human: {
        kind: 'select',
        title: 'Unit coverage',
        description:
          'Prefer direct established coverage, then a parent collection explicitly containing this unresolved section, otherwise no coverage.',
      },
    }
  if (resource === 'place' && path === 'addressRole')
    return {
      inputs: ['snapshotId'],
      reads: {
        place: {
          stage: 'canonical',
          collection: 'selected-place-version',
          path: 'addressRole',
        },
      },
      implementation: {
        path: 'apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadRows.ts',
        symbol: 'buildPlaceSql',
      },
      expression:
        'Persist null for an unlinked Place; otherwise supplementaryAddress when the accepted Address snapshot equals the selected supplementary snapshot, and address for the selected official snapshot.',
      guards: [
        'A linked Address snapshot must equal one of the publication’s two selected Address dependencies.',
      ],
      human: {
        kind: 'select',
        title: 'Address role',
        description:
          'Use the retained official or supplementary role of the accepted Address; an unlinked Place has no role.',
      },
    }
  if (resource === 'place' && path === 'placePublicationState')
    return {
      inputs: ['snapshotId'],
      reads: {
        receipt: {
          stage: 'registry',
          collection: 'placePublicationState',
          path: '$',
        },
      },
      implementation: {
        path: 'libs/core/src/pipeline/services/places/publicationDependencies.ts',
        symbol: 'placeAddressSnapshotSql',
      },
      expression:
        'Select the publication receipt for the bound Place snapshot and scope; read its official and supplementary Address snapshot identities.',
      guards: [
        'Never substitute another publication receipt or the latest Address snapshot.',
      ],
      human: {
        kind: 'lookup',
        title: 'Published Address dependencies',
        description:
          'Read the exact official and supplementary Address snapshots selected by this Place publication.',
      },
    }
  return null
}
