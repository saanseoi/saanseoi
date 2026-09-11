import {
  validateApiFieldInputs,
  type ApiFieldInput,
  type PublisherFields,
} from './apiFieldInputs'
import apiDivisionsV01FixtureOverture112To115Document from '../../../fixtures/meta/apiFields/api-divisions-v0.1@geographic-v1.json'
import apiDivisionsV01FixtureOverture116To118Document from '../../../fixtures/meta/apiFields/api-divisions-v0.1@geographic-v2.json'
import apiDivisionsV01FixturePlandNewTown2006Document from '../../../fixtures/meta/apiFields/api-divisions-v0.1@hkgov-pland-new-town-v1.json'
import apiDivisionsV01FixturePlandPu2001Document from '../../../fixtures/meta/apiFields/api-divisions-v0.1@hkgov-pland-pu-v1.json'
import apiDivisionsV01FixturePlandPu2021Document from '../../../fixtures/meta/apiFields/api-divisions-v0.1@hkgov-pland-pu-v2.json'
import apiAddressesV01FixtureOfficialLineageDocument from '../../../fixtures/meta/apiFields/api-addresses-v0.1@saanseoi-v1.json'
import apiPlacesV01FixtureOverture112To118Document from '../../../fixtures/meta/apiFields/api-places-v0.1@overture-v1.json'
import apiStatisticsV01FixtureCenstatdDocument from '../../../fixtures/meta/apiFields/api-stats-v0.1@government-v1.json'

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
  mappingVersion: number
  publisherSchemaRanges: Record<string, { min: string; max: string }>
  sourceCompositions: Array<{
    datasetCodes: string[]
    anchorSnapshotVersions: string[]
  }>
  lineageAnchors: ApiFieldFixtureLineageAnchor[]
  schemaVersion: string
  rulesetVersion: string
  publisherFields: PublisherFields
  fields: ApiFieldFixtureField[]
}

/** Authored fixtures declare resource scope once, outside individual fields. */
export type ApiFieldFixtureDocument = Omit<ApiFieldFixture, 'fields'> &
  (
    | {
        resourceType: string
        fields: Omit<ApiFieldFixtureField, 'resourceType'>[]
        resources?: never
      }
    | {
        resourceType?: never
        fields?: never
        resources: Array<{
          resourceType: string
          fields: Omit<ApiFieldFixtureField, 'resourceType'>[]
        }>
      }
  )

/** Resolve resource scope for publication; rule definitions remain external. */
export function expandApiFieldFixture(
  document: ApiFieldFixtureDocument,
): ApiFieldFixture {
  if (document.versionHash !== computeVersionHash(document))
    throw new Error('API field fixture hash does not match its contents.')
  if (!Number.isInteger(document.mappingVersion) || document.mappingVersion < 1)
    throw new Error('Mapping version must be a positive integer.')
  for (const range of Object.values(document.publisherSchemaRanges)) {
    if (comparePublisherSchemaVersions(range.min, range.max) > 0)
      throw new Error('Publisher schema range is reversed.')
  }
  const anchors = new Set(document.lineageAnchors.map(anchor => anchor.snapshotVersion))
  if (anchors.size !== document.lineageAnchors.length)
    throw new Error('Duplicate API-field lineage anchor.')
  const referenced = new Set<string>()
  for (const composition of document.sourceCompositions) {
    if (
      !composition.datasetCodes.length ||
      new Set(composition.datasetCodes).size !== composition.datasetCodes.length ||
      composition.datasetCodes.some(
        code => !Object.hasOwn(document.publisherSchemaRanges, code),
      )
    )
      throw new Error('Invalid API-field source composition.')
    if (
      !composition.anchorSnapshotVersions.length ||
      new Set(composition.anchorSnapshotVersions).size !==
        composition.anchorSnapshotVersions.length
    )
      throw new Error('Invalid composition anchor references.')
    for (const snapshot of composition.anchorSnapshotVersions) {
      if (!anchors.has(snapshot))
        throw new Error(`Unknown composition anchor: ${snapshot}`)
      referenced.add(snapshot)
    }
  }
  if (referenced.size !== anchors.size)
    throw new Error('Unreferenced API-field lineage anchor.')
  const { resourceType, fields, resources, ...metadata } = document
  const groups = resources ?? [{ resourceType: resourceType!, fields: fields! }]
  if (
    !groups.length ||
    new Set(groups.map(group => group.resourceType)).size !== groups.length
  )
    throw new Error('API field fixture requires unique resource groups.')
  const expanded = {
    ...metadata,
    fields: groups.flatMap(group => {
      if (!group.resourceType || !Array.isArray(group.fields))
        throw new Error('API field fixture requires resource scope and fields.')
      return group.fields.map(field => {
        if (Object.hasOwn(field, 'resourceType'))
          throw new Error('Declare resourceType on the fixture or resource group.')
        return { ...field, resourceType: group.resourceType }
      })
    }),
  }
  return { ...expanded, versionHash: computeVersionHash(expanded) }
}

export type ApiFieldFixtureLineageAnchor = {
  /** Immutable snapshot at which this mapping applies on one lineage branch. */
  snapshotVersion: string
}

const apiDivisionsV01FixtureOverture112To115 = expandApiFieldFixture(
  apiDivisionsV01FixtureOverture112To115Document as unknown as ApiFieldFixtureDocument,
)
const apiDivisionsV01FixtureOverture116To118 = expandApiFieldFixture(
  apiDivisionsV01FixtureOverture116To118Document as unknown as ApiFieldFixtureDocument,
)
const apiDivisionsV01FixturePlandNewTown2006 = expandApiFieldFixture(
  apiDivisionsV01FixturePlandNewTown2006Document as unknown as ApiFieldFixtureDocument,
)
const apiDivisionsV01FixturePlandPu2001 = expandApiFieldFixture(
  apiDivisionsV01FixturePlandPu2001Document as unknown as ApiFieldFixtureDocument,
)
const apiDivisionsV01FixturePlandPu2021 = expandApiFieldFixture(
  apiDivisionsV01FixturePlandPu2021Document as unknown as ApiFieldFixtureDocument,
)
const apiAddressesV01FixtureOfficialLineage = expandApiFieldFixture(
  apiAddressesV01FixtureOfficialLineageDocument as unknown as ApiFieldFixtureDocument,
)
const apiPlacesV01FixtureOverture112To118 = expandApiFieldFixture(
  apiPlacesV01FixtureOverture112To118Document as unknown as ApiFieldFixtureDocument,
)
const apiStatisticsV01FixtureCenstatd = expandApiFieldFixture(
  apiStatisticsV01FixtureCenstatdDocument as unknown as ApiFieldFixtureDocument,
)

function deriveSourceCompositions(fixture: ApiFieldFixture, omittedDataset: string) {
  const sourceCompositions = fixture.sourceCompositions
    .filter(composition =>
      [permanentLivingQuartersDataset, populationHouseholdsDistrictDataset].every(
        code => composition.datasetCodes.includes(code),
      ),
    )
    .map(composition => ({
      ...composition,
      datasetCodes: composition.datasetCodes.filter(code => code !== omittedDataset),
    }))
  const anchors = new Set(
    sourceCompositions.flatMap(composition => composition.anchorSnapshotVersions),
  )
  return {
    sourceCompositions,
    lineageAnchors: fixture.lineageAnchors.filter(anchor =>
      anchors.has(anchor.snapshotVersion),
    ),
  }
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
    ...deriveSourceCompositions(fixture, populationHouseholdsDistrictDataset),
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
    ...deriveSourceCompositions(fixture, permanentLivingQuartersDataset),
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
  const fixture = {
    ...official,
    publisherSchemaRanges: {
      ...official.publisherSchemaRanges,
      'ds-hk-overture-place':
        apiPlacesV01FixtureOverture112To118.publisherSchemaRanges[
          'ds-hk-overture-place'
        ]!,
    },
    publisherFields: {
      ...official.publisherFields,
      'ds-hk-overture-place': { 'properties.addresses': 'addresses[]' },
    },
    sourceCompositions: official.sourceCompositions.map(composition => ({
      ...composition,
      datasetCodes: [...composition.datasetCodes, 'ds-hk-overture-place'].sort(),
    })),
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
            { origin: 'curation' as const, fieldPath: 'overturePlaceAddress' },
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
    publisherSchemaRanges: structuredClone(fixture.publisherSchemaRanges),
    lineageAnchors: structuredClone(fixture.lineageAnchors),
    sourceCompositions: structuredClone(fixture.sourceCompositions),
    fields: fixture.fields.map(cloneApiFieldFixtureField),
  }
}

export function comparePublisherSchemaVersions(left: string, right: string) {
  const parse = (value: string) => {
    if (!/^\d+(?:\.\d+)*$/.test(value))
      throw new Error(`Invalid publisher schema version: ${value}`)
    return value.split('.').map(Number)
  }
  const a = parse(left),
    b = parse(right)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0)
    if (difference) return difference
  }
  return 0
}

function supportsSourceSchemas(
  fixture: ApiFieldFixture,
  anchor: ApiFieldFixtureLineageAnchor,
  selected: Record<string, string>,
) {
  return fixture.sourceCompositions.some(
    composition =>
      composition.anchorSnapshotVersions.includes(anchor.snapshotVersion) &&
      composition.datasetCodes.length === Object.keys(selected).length &&
      composition.datasetCodes.every(dataset => {
        const version = selected[dataset]
        const range = fixture.publisherSchemaRanges[dataset]
        return (
          version !== undefined &&
          range !== undefined &&
          comparePublisherSchemaVersions(version, range.min) >= 0 &&
          comparePublisherSchemaVersions(version, range.max) <= 0
        )
      }),
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
        supportsSourceSchemas(fixture, anchor, args.sourceSchemas) &&
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
          ) || right.fixture.mappingVersion - left.fixture.mappingVersion,
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
