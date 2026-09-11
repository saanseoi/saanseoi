import {
  validateApiFieldInputs,
  type ApiFieldInput,
  type PublisherFields,
} from './apiFieldInputs'
import apiDivisionsV01FixtureOverture112To115 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-1.12-to-1.15.json'
import apiDivisionsV01FixtureOverture116To118 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-1.16-to-1.18.json'
import apiDivisionsV01FixturePlandNewTown2006 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-new-town-2006.json'
import apiDivisionsV01FixturePlandPu2001 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2001.json'
import apiDivisionsV01FixturePlandPu2021 from '../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-hkgov-pland-pu-2021.json'
import apiAddressesV01FixtureOfficialLineage from '../../../fixtures/meta/apiFields/api-addresses-v0.1@official-lineage.json'
import apiPlacesV01FixtureOverture112To118 from '../../../fixtures/meta/apiFields/api-places-v0.1@overture-1.12-to-1.18.json'
import apiStatisticsV01FixtureCenstatd from '../../../fixtures/meta/apiFields/api-stats-v0.1@censtatd-v1.json'

import type { ProvenanceContributionType } from './constants/schema'
import { computeVersionHash } from './versioning'

const populationHouseholdsDistrictDataset =
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
const permanentLivingQuartersDataset =
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'

export type ApiFieldFixtureField = {
  apiField: string
  resourceType: string
  /** Geometry-source selector; omitted for fields independent of a variant. */
  variant?: string | null
  sourceDatasetCode: string
  inputs: ApiFieldInput[]
  processingRuleIds?: string[]
  resolverCode: string
  contributionType: ProvenanceContributionType
  priority: number
  confidence?: number | null
}

export type ApiFieldFixture = {
  versionHash: string
  apiVersion: string
  /** Domain this mapping applies to. */
  domainCode: string
  lineageAnchors: ApiFieldFixtureLineageAnchor[]
  schemaVersion: string
  rulesetVersion: string
  publisherFields: PublisherFields
  fields: ApiFieldFixtureField[]
}

export type ApiFieldFixtureLineageAnchor = {
  /** Immutable snapshot at which this mapping applies on one lineage branch. */
  snapshotVersion: string
  /** Exact release-set source signature for this branch anchor. */
  sourceSchemas: Record<string, string>
}

/**
 * Permanent Living Quarters supplies the same C&SD area variant as the annual
 * district dataset, but Geographic Divisions can be initialised before that
 * annual source is available. Keep its exact release signature distinct.
 */
function derivePermanentLivingQuartersFixture(
  fixture: ApiFieldFixture,
): ApiFieldFixture {
  const derivedFixture = {
    ...fixture,
    publisherFields: {
      ...fixture.publisherFields,
      [permanentLivingQuartersDataset]:
        fixture.publisherFields[populationHouseholdsDistrictDataset]!,
    },
    lineageAnchors: fixture.lineageAnchors.flatMap(anchor => {
      if (
        anchor.sourceSchemas[permanentLivingQuartersDataset] !== '1.0' ||
        anchor.sourceSchemas[populationHouseholdsDistrictDataset] !== '1.0'
      ) {
        return []
      }

      const { [populationHouseholdsDistrictDataset]: _omitted, ...sourceSchemas } =
        anchor.sourceSchemas
      return [{ ...anchor, sourceSchemas }]
    }),
    fields: fixture.fields.map(field =>
      field.sourceDatasetCode === populationHouseholdsDistrictDataset
        ? { ...field, sourceDatasetCode: permanentLivingQuartersDataset }
        : field,
    ),
  }

  return {
    ...derivedFixture,
    versionHash: computeVersionHash(derivedFixture),
  }
}

/**
 * Population and Household Statistics can provide the canonical C&SD district
 * geometry before Permanent Living Quarters is available. Its field mapping is
 * the same as the complete Population and Household branch; only the source
 * signature differs.
 */
function derivePopulationHouseholdsFixture(fixture: ApiFieldFixture): ApiFieldFixture {
  const derivedFixture = {
    ...fixture,
    lineageAnchors: fixture.lineageAnchors.flatMap(anchor => {
      if (
        anchor.sourceSchemas[populationHouseholdsDistrictDataset] !== '1.0' ||
        anchor.sourceSchemas[permanentLivingQuartersDataset] !== '1.0'
      ) {
        return []
      }

      const { [permanentLivingQuartersDataset]: _omitted, ...sourceSchemas } =
        anchor.sourceSchemas
      return [{ ...anchor, sourceSchemas }]
    }),
  }

  return {
    ...derivedFixture,
    versionHash: computeVersionHash(derivedFixture),
  }
}

/** ALS and Places are independently released. A combined Address set retains
 * the ALS lineage anchor and records the selected Places schema separately.
 * Only schema versions already covered by the Places mapping are supported.
 */
function deriveCuratedAddressFixture(): ApiFieldFixture {
  const official = apiAddressesV01FixtureOfficialLineage as ApiFieldFixture
  const placeSchemas = [
    ...new Set(
      apiPlacesV01FixtureOverture112To118.lineageAnchors.map(
        anchor => anchor.sourceSchemas['ds-hk-overture-place'],
      ),
    ),
  ]
  const fixture = {
    ...official,
    publisherFields: {
      ...official.publisherFields,
      'ds-hk-overture-place': { 'properties.addresses': 'addresses[]' },
    },
    lineageAnchors: official.lineageAnchors.flatMap(anchor =>
      placeSchemas.map(version => ({
        ...anchor,
        sourceSchemas: { ...anchor.sourceSchemas, 'ds-hk-overture-place': version },
      })),
    ),
    fields: [
      ...official.fields,
      ...['id', 'attributes.i18n', 'attributes.sources', 'relationships'].map(
        apiField => ({
          apiField,
          resourceType: 'address',
          sourceDatasetCode: 'ds-hk-overture-place',
          inputs: [
            {
              origin: 'source' as const,
              fieldPath: 'properties.addresses',
            },
            { origin: 'curation' as const, fieldPath: 'overture-place-address' },
          ],
          processingRuleIds: ['normalise-overture-places'],
          resolverCode: 'resolve-place-addresses',
          contributionType: 'resolver-input' as const,
          priority: 10,
        }),
      ),
    ],
  }
  return { ...fixture, versionHash: computeVersionHash(fixture) }
}

const apiFieldFixtures: ApiFieldFixture[] = [
  apiDivisionsV01FixtureOverture112To115 as unknown as ApiFieldFixture,
  derivePopulationHouseholdsFixture(
    apiDivisionsV01FixtureOverture112To115 as unknown as ApiFieldFixture,
  ),
  derivePermanentLivingQuartersFixture(
    apiDivisionsV01FixtureOverture112To115 as unknown as ApiFieldFixture,
  ),
  apiDivisionsV01FixtureOverture116To118 as unknown as ApiFieldFixture,
  derivePopulationHouseholdsFixture(
    apiDivisionsV01FixtureOverture116To118 as unknown as ApiFieldFixture,
  ),
  derivePermanentLivingQuartersFixture(
    apiDivisionsV01FixtureOverture116To118 as unknown as ApiFieldFixture,
  ),
  apiDivisionsV01FixturePlandNewTown2006 as ApiFieldFixture,
  apiDivisionsV01FixturePlandPu2001 as ApiFieldFixture,
  apiDivisionsV01FixturePlandPu2021 as ApiFieldFixture,
  apiAddressesV01FixtureOfficialLineage as ApiFieldFixture,
  deriveCuratedAddressFixture(),
  apiPlacesV01FixtureOverture112To118 as ApiFieldFixture,
  apiStatisticsV01FixtureCenstatd as unknown as ApiFieldFixture,
]

function cloneApiFieldFixtureField(field: ApiFieldFixtureField): ApiFieldFixtureField {
  return {
    ...field,
    inputs: structuredClone(field.inputs),
    ...(field.processingRuleIds
      ? { processingRuleIds: [...field.processingRuleIds] }
      : {}),
  }
}

function cloneApiFieldFixture(fixture: ApiFieldFixture): ApiFieldFixture {
  for (const field of fixture.fields) {
    if (
      !field.resourceType ||
      /^(address|division|divisionArea|divisionBoundary|place|statistic|statistic-field)\./.test(
        field.apiField,
      )
    )
      throw new Error(
        'API field must be resource-relative with an explicit resourceType.',
      )
    validateApiFieldInputs(
      field.inputs,
      fixture.publisherFields[field.sourceDatasetCode],
    )
  }
  return {
    ...fixture,
    publisherFields: structuredClone(fixture.publisherFields),
    lineageAnchors: fixture.lineageAnchors.map(anchor => ({
      ...anchor,
      sourceSchemas: { ...anchor.sourceSchemas },
    })),
    fields: fixture.fields.map(cloneApiFieldFixtureField),
  }
}

function haveEqualSourceSchemas(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every(
    (key, index) => key === rightKeys[index] && left[key] === right[key],
  )
}

function closestMatchingAnchorDepth(
  fixture: ApiFieldFixture,
  matchingAnchorIndexes: number[],
  lineageSnapshotVersions: string[],
) {
  return Math.max(
    ...matchingAnchorIndexes.map(index => {
      const anchor = fixture.lineageAnchors[index]
      return anchor ? lineageSnapshotVersions.lastIndexOf(anchor.snapshotVersion) : -1
    }),
  )
}

export function listApiFieldFixtures() {
  return apiFieldFixtures.map(cloneApiFieldFixture)
}

export function resolveApiFieldFixture(args: {
  apiVersion: string
  domainCode: string
  /** Snapshot codes from the primary snapshot's lineage root to itself. */
  lineageSnapshotVersions: string[]
  schemaVersion: string
  rulesetVersion: string
  sourceSchemas: Record<string, string>
}) {
  const candidates = apiFieldFixtures
    .map(fixture => ({
      fixture,
      matchingAnchorIndexes: fixture.lineageAnchors.flatMap((anchor, index) =>
        haveEqualSourceSchemas(anchor.sourceSchemas, args.sourceSchemas) &&
        args.lineageSnapshotVersions.includes(anchor.snapshotVersion)
          ? [index]
          : [],
      ),
    }))
    .filter(
      ({ fixture, matchingAnchorIndexes }) =>
        fixture.apiVersion === args.apiVersion &&
        fixture.domainCode === args.domainCode &&
        fixture.schemaVersion === args.schemaVersion &&
        fixture.rulesetVersion === args.rulesetVersion &&
        matchingAnchorIndexes.length > 0,
    )
    .sort(
      (left, right) =>
        closestMatchingAnchorDepth(
          right.fixture,
          right.matchingAnchorIndexes,
          args.lineageSnapshotVersions,
        ) -
        closestMatchingAnchorDepth(
          left.fixture,
          left.matchingAnchorIndexes,
          args.lineageSnapshotVersions,
        ),
    )

  const selected = candidates[0]
  if (!selected) return null

  const fixture = cloneApiFieldFixture(selected.fixture)
  // Bundled mappings cover several exact source signatures. Only sources in
  // this release set can contribute to its published provenance.
  fixture.fields = fixture.fields.filter(field =>
    Object.hasOwn(args.sourceSchemas, field.sourceDatasetCode),
  )
  fixture.publisherFields = Object.fromEntries(
    Object.entries(fixture.publisherFields).filter(([code]) =>
      Object.hasOwn(args.sourceSchemas, code),
    ),
  )
  fixture.versionHash = computeVersionHash(fixture)
  return fixture
}
