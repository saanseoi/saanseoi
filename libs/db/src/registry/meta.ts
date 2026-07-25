import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ResourceType } from '@repo/core'
import type {
  ApiFamilyType,
  ApiEndpointMethod,
  ApiVersionStatus,
  DataShardEnvironment,
  DataShardStatus,
  DataShardType,
  DatasetCategory,
  DatasetReleaseFrequency,
  DatasetReleaseType,
  DatasetTheme,
  ProfileName,
  ResolverCode,
} from '../constants/schema'
import { buildDeterministicUuidV5, computeVersionHash } from '../versioning'

const fixturesDir = new URL('../../../../fixtures/meta/', import.meta.url)
const nowSql = "cast(unixepoch('subsecond') * 1000 as integer)"
const PUBLISHER_ID_NAMESPACE = '9b7e6c3a-1ef4-5ba5-9b64-36f0b8b41ef1'
const LICENSE_ID_NAMESPACE = '76409a70-86d3-5277-8ab9-f8482fddad43'
const DATASET_ID_NAMESPACE = '8c8ab30f-3c0f-42c6-bef2-98c3e615f4a6'
const API_VERSION_ID_NAMESPACE = 'c289d557-af8a-59ef-a7d0-2861a00fc8bc'
const API_COMPOSITION_ID_NAMESPACE = 'ba6a345f-d57a-51d8-9256-bcda2275e6d3'
const API_ENDPOINT_ID_NAMESPACE = 'f27eaf73-6d20-578d-80d7-5e515447aa62'
const DATA_SHARD_ID_NAMESPACE = 'e7956160-6b36-521f-a0cb-ac3c0769b5c7'

export const metaRegistryRequiredTables = [
  'publishers',
  'publisherI18n',
  'licenses',
  'datasets',
  'datasetResourceTypes',
  'datasetI18n',
  'datasetTransforms',
  'apiVersions',
  'apiComposition',
  'apiCompositionMembers',
  'apiEndpoints',
  'dataShards',
  'identifierBridges',
] as const

export const initialProfiles: ProfileName[] = ['compact', 'default', 'full', 'map']

export const initialResolverCodes: ResolverCode[] = [
  'direct_copy',
  'join_lookup',
  'lookup_fk',
  'derive_bbox_from_geometry',
  'prefer_hkgov_then_overture',
  'prefer_overture_then_hkgov',
  'merge_first_non_empty',
  'normalise_whitespace',
]

type Locale = 'en' | 'zh-hant' | 'zh-hans'

type VersionedFixture<T> = T & {
  versionHash: string
}

type PublisherFixture = {
  versionHash: string
  code: string
  url?: string
  contactUrl?: string
  parentCode?: string
  i18n: Array<{
    locale: Locale
    name: string
    description?: string
  }>
}

type LicenseFixture = {
  versionHash: string
  code: string
  name: string
  url?: string
}

type DatasetFixture = {
  versionHash: string
  publisherCode: string
  code: string
  regionCode: string
  releaseType: DatasetReleaseType
  releaseFrequency: DatasetReleaseFrequency
  theme: DatasetTheme
  sourceVariant?: string
  resourceTypes: ResourceType[]
  licenseCode: string
  attribution?: string
  sourceUrl?: string
  category?: DatasetCategory
  i18n: Array<{
    locale: Locale
    name: string
    description?: string
  }>
  transforms?: Array<{
    code: string
    resourceType: ResourceType
    sourceVersion: string
    outputVariant: string
    derivation: Record<string, unknown>
  }>
}

type ApiVersionFixture = {
  versionHash: string
  code: string
  familyType: ApiFamilyType
  version: string
  status: ApiVersionStatus
  publishedAt?: string | null
  deprecatedAt?: string | null
  retiredAt?: string | null
}

type ApiEndpointFileFixture = {
  apiVersion: string
  versionHash: string
  endpoints: Array<{
    method: ApiEndpointMethod
    path: string
    operationId: string
  }>
}

type ApiCompositionMemberFixture = {
  resourceType: ResourceType
  variant?: string
  role: string
  isRequired: boolean
  cohortMatchingMode: string
  anchorResourceType?: ResourceType
  maxLagDays?: number
  priority: number
}

type ApiCompositionFixture = {
  versionHash: string
  apiVersion: string
  code: string
  version: number
  primaryResourceType: ResourceType
  status: string
  notes?: string
  members?: ApiCompositionMemberFixture[]
  domains?: Array<{
    code: string
    isDefault?: boolean
    i18n: Array<{
      locale: Locale
      name: string
      description?: string
    }>
    members: ApiCompositionMemberFixture[]
  }>
}

type DataShardFileFixture = {
  versionHash: string
  shards: Array<{
    bindingName: string
    shardType: DataShardType
    environment: DataShardEnvironment
    databaseName: string
    databaseId: string
    status: DataShardStatus
    regionCode?: string
    year?: string
  }>
}

type InitialPublisherSeed = VersionedFixture<{
  code: string
  url?: string
  contactUrl?: string
  parentCode?: string
}>

type InitialPublisherI18nSeed = {
  publisherCode: string
  locale: Locale
  name: string
  description?: string
}

type InitialLicenseSeed = VersionedFixture<LicenseFixture>

type InitialDatasetSeed = VersionedFixture<
  Omit<DatasetFixture, 'i18n' | 'transforms' | 'resourceTypes' | 'sourceVariant'> & {
    sourceVariant: string
  }
>

type InitialDatasetResourceTypeSeed = {
  datasetCode: string
  publisherCode: string
  resourceType: ResourceType
}

type InitialDatasetI18nSeed = {
  datasetCode: string
  publisherCode: string
  locale: Locale
  name: string
  description?: string
}

type InitialDatasetTransformSeed = {
  datasetCode: string
  publisherCode: string
  code: string
  resourceType: ResourceType
  sourceVersion: string
  outputVariant: string
  derivation: Record<string, unknown>
  versionHash: string
}

type InitialApiVersionSeed = VersionedFixture<ApiVersionFixture>

type InitialApiEndpointSeed = {
  apiVersion: string
  method: ApiEndpointMethod
  path: string
  operationId: string
  versionHash: string
}

type InitialApiCompositionSeed = VersionedFixture<{
  apiVersion: string
  code: string
  version: number
  primaryResourceType: ResourceType
  defaultDomainCode?: string
  i18n: Record<
    string,
    Array<{
      locale: Locale
      name: string
      description?: string
    }>
  >
  status: string
  notes?: string
}>

type InitialApiCompositionMemberSeed = {
  apiCompositionCode: string
  domainCode: string
  resourceType: ResourceType
  variant: string
  role: string
  isRequired: boolean
  cohortMatchingMode: string
  anchorResourceType?: ResourceType
  maxLagDays?: number
  priority: number
}

type InitialDataShardSeed = {
  bindingName: string
  shardType: DataShardType
  environment: DataShardEnvironment
  databaseName: string
  databaseId: string
  status: DataShardStatus
  versionHash: string
  regionCode?: string
  year?: string
}

export type MetaRegistrySyncEnvironment = Extract<
  DataShardEnvironment,
  'preview' | 'production'
>

function readFixtureDir<T>(relativeDir: string): Array<VersionedFixture<T>> {
  const absoluteDir = join(fixturesDir.pathname, relativeDir)

  return readdirSync(absoluteDir)
    .filter(fileName => fileName.endsWith('.json'))
    .sort()
    .map(fileName => {
      const fixture = JSON.parse(
        readFileSync(join(absoluteDir, fileName), 'utf8'),
      ) as VersionedFixture<T>
      const computedVersionHash = computeVersionHash(fixture)

      if (fixture.versionHash !== computedVersionHash) {
        throw new Error(
          `Fixture versionHash mismatch for ${relativeDir}/${fileName}: expected ${computedVersionHash}, received ${fixture.versionHash}.`,
        )
      }

      return {
        ...fixture,
        versionHash: computedVersionHash,
      }
    })
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function sqlNullable(value: string | undefined) {
  return value == null ? 'NULL' : sqlString(value)
}

function sqlDatasetId(publisherCode: string, datasetCode: string) {
  return sqlDeterministicId(
    DATASET_ID_NAMESPACE,
    `${publisherCode.trim()}:${datasetCode.trim()}`,
  )
}

function sqlDeterministicId(namespace: string, name: string) {
  return sqlString(buildDeterministicUuidV5(namespace, name.trim()))
}

function sqlTimestampMs(value: string) {
  return `cast(unixepoch(${sqlString(value)}, 'subsecond') * 1000 as integer)`
}

const publisherFixtures = readFixtureDir<PublisherFixture>('dataPublishers')
const datasetFixtures = readFixtureDir<DatasetFixture>('datasets')
const apiCompositionFixtures = readFixtureDir<ApiCompositionFixture>('apiCompositions')
const apiEndpointFixtures = readFixtureDir<ApiEndpointFileFixture>('apiEndpoints')
const dataShardFixtures = readFixtureDir<DataShardFileFixture>('dataShards')
const identifierBridgeFixtures = readFixtureDir<{
  resourceType: ResourceType
  sourceDatasetCode: string
  sourceReleaseCode: string
  cohortKey: string
  domain: string
  authority: string
  mappingMethod: string
  reviewStatus: string
  mappings: Array<{
    externalId: string
    externalCode?: string
    canonicalId: string
  }>
}>('identifierBridges')

export const initialPublishers: InitialPublisherSeed[] = publisherFixtures.map(
  fixture => ({
    code: fixture.code,
    url: fixture.url,
    contactUrl: fixture.contactUrl,
    parentCode: fixture.parentCode,
    versionHash: fixture.versionHash,
  }),
)

export const initialPublisherI18n: InitialPublisherI18nSeed[] =
  publisherFixtures.flatMap(fixture =>
    fixture.i18n.map(translation => ({
      publisherCode: fixture.code,
      locale: translation.locale,
      name: translation.name,
      description: translation.description,
    })),
  )

export const initialLicenses = readFixtureDir<InitialLicenseSeed>('dataLicenses')

export const initialDatasets: InitialDatasetSeed[] = datasetFixtures.map(fixture => ({
  versionHash: fixture.versionHash,
  publisherCode: fixture.publisherCode,
  code: fixture.code,
  regionCode: fixture.regionCode,
  releaseType: fixture.releaseType,
  releaseFrequency: fixture.releaseFrequency,
  theme: fixture.theme,
  sourceVariant: fixture.sourceVariant ?? 'default',
  licenseCode: fixture.licenseCode,
  attribution: fixture.attribution,
  sourceUrl: fixture.sourceUrl,
  category: fixture.category,
}))

export const initialDatasetResourceTypes: InitialDatasetResourceTypeSeed[] =
  datasetFixtures.flatMap(fixture =>
    fixture.resourceTypes.map(resourceType => ({
      datasetCode: fixture.code,
      publisherCode: fixture.publisherCode,
      resourceType,
    })),
  )

export const initialDatasetI18n: InitialDatasetI18nSeed[] = datasetFixtures.flatMap(
  fixture =>
    fixture.i18n.map(translation => ({
      datasetCode: fixture.code,
      publisherCode: fixture.publisherCode,
      locale: translation.locale,
      name: translation.name,
      description: translation.description,
    })),
)

export const initialDatasetTransforms: InitialDatasetTransformSeed[] =
  datasetFixtures.flatMap(fixture =>
    (fixture.transforms ?? []).map(transform => ({
      datasetCode: fixture.code,
      publisherCode: fixture.publisherCode,
      ...transform,
      versionHash: computeVersionHash({
        datasetCode: fixture.code,
        publisherCode: fixture.publisherCode,
        ...transform,
      }),
    })),
  )

export const initialApiVersions = readFixtureDir<InitialApiVersionSeed>('apiVersions')

export const initialApiCompositions: InitialApiCompositionSeed[] =
  apiCompositionFixtures.map(fixture => ({
    apiVersion: fixture.apiVersion,
    code: fixture.code,
    version: fixture.version,
    primaryResourceType: fixture.primaryResourceType,
    defaultDomainCode: fixture.domains?.find(domain => domain.isDefault)?.code,
    i18n: Object.fromEntries(
      (fixture.domains ?? []).map(domain => [domain.code, domain.i18n]),
    ),
    status: fixture.status,
    notes: fixture.notes,
    versionHash: fixture.versionHash,
  }))

export const initialApiCompositionMembers: InitialApiCompositionMemberSeed[] =
  apiCompositionFixtures.flatMap(fixture =>
    (fixture.domains
      ? fixture.domains.flatMap(domain =>
          domain.members.map(member => ({ domainCode: domain.code, member })),
        )
      : (fixture.members ?? []).map(member => ({ domainCode: 'default', member }))
    ).map(({ domainCode, member }) => ({
      apiCompositionCode: fixture.code,
      domainCode,
      resourceType: member.resourceType,
      variant: member.variant ?? 'default',
      role: member.role,
      isRequired: member.isRequired,
      cohortMatchingMode: member.cohortMatchingMode,
      anchorResourceType: member.anchorResourceType,
      maxLagDays: member.maxLagDays,
      priority: member.priority,
    })),
  )

export const initialApiEndpoints: InitialApiEndpointSeed[] =
  apiEndpointFixtures.flatMap(fixture =>
    fixture.endpoints.map(endpoint => ({
      apiVersion: fixture.apiVersion,
      method: endpoint.method,
      path: endpoint.path,
      operationId: endpoint.operationId,
      versionHash: fixture.versionHash,
    })),
  )

export const initialDataShards: InitialDataShardSeed[] = dataShardFixtures.flatMap(
  fixture =>
    fixture.shards.map(shard => ({
      bindingName: shard.bindingName,
      shardType: shard.shardType,
      environment: shard.environment,
      databaseName: shard.databaseName,
      databaseId: shard.databaseId,
      status: shard.status,
      versionHash: fixture.versionHash,
      regionCode: shard.regionCode,
      year: shard.year,
    })),
)

export const initialIdentifierBridges = identifierBridgeFixtures.flatMap(fixture =>
  fixture.mappings.map(mapping => ({
    ...mapping,
    resourceType: fixture.resourceType,
    sourceDatasetCode: fixture.sourceDatasetCode,
    sourceReleaseCode: fixture.sourceReleaseCode,
    cohortKey: fixture.cohortKey,
    domain: fixture.domain,
    authority: fixture.authority,
    mappingMethod: fixture.mappingMethod,
    reviewStatus: fixture.reviewStatus,
  })),
)

export function resolveInitialDataShardsForEnvironment(
  environment: DataShardEnvironment,
) {
  return initialDataShards.filter(shard => shard.environment === environment)
}

export function buildMetaRegistrySyncStatements(
  environment: MetaRegistrySyncEnvironment,
) {
  const statements: string[] = []

  for (const publisher of initialPublishers) {
    statements.push(
      `
INSERT INTO publishers (
  id, code, url, contactUrl, parentPublisherId, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlDeterministicId(PUBLISHER_ID_NAMESPACE, publisher.code)},
  ${sqlString(publisher.code)},
  ${sqlNullable(publisher.url)},
  ${sqlNullable(publisher.contactUrl)},
  ${
    publisher.parentCode
      ? `(SELECT id FROM publishers WHERE code = ${sqlString(publisher.parentCode)})`
      : 'NULL'
  },
  ${sqlString(publisher.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(code) DO UPDATE SET
  url = excluded.url,
  contactUrl = excluded.contactUrl,
  parentPublisherId = excluded.parentPublisherId,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE
  publishers.versionHash <> excluded.versionHash
  OR (
    publishers.parentPublisherId IS NULL
    AND excluded.parentPublisherId IS NOT NULL
  );`.trim(),
    )
  }

  for (const translation of initialPublisherI18n) {
    statements.push(
      `
INSERT INTO publisherI18n (
  publisherId, locale, name, description, createdAt, updatedAt
) VALUES (
  (SELECT id FROM publishers WHERE code = ${sqlString(translation.publisherCode)}),
  ${sqlString(translation.locale)},
  ${sqlString(translation.name)},
  ${sqlNullable(translation.description)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(publisherId, locale) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  updatedAt = excluded.updatedAt;`.trim(),
    )
  }

  for (const license of initialLicenses) {
    statements.push(
      `
INSERT INTO licenses (
  id, code, name, url, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlDeterministicId(LICENSE_ID_NAMESPACE, license.code)},
  ${sqlString(license.code)},
  ${sqlString(license.name)},
  ${sqlNullable(license.url)},
  ${sqlString(license.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(code) DO UPDATE SET
  name = excluded.name,
  url = excluded.url,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE licenses.versionHash <> excluded.versionHash;`.trim(),
    )
  }

  for (const bridge of initialIdentifierBridges) {
    statements.push(
      `
INSERT INTO identifierBridges (
  resourceType, cohortKey, domain, authority, externalId, externalCode,
  canonicalId, sourceDatasetCode, sourceReleaseCode,
  mappingMethod, reviewStatus, createdAt, updatedAt
) VALUES (
  ${sqlString(bridge.resourceType)},
  ${sqlString(bridge.cohortKey)},
  ${sqlString(bridge.domain)},
  ${sqlString(bridge.authority)},
  ${sqlString(bridge.externalId)},
  ${sqlNullable(bridge.externalCode)},
  ${sqlString(bridge.canonicalId)},
  ${sqlString(bridge.sourceDatasetCode)},
  ${sqlString(bridge.sourceReleaseCode)},
  ${sqlString(bridge.mappingMethod)},
  ${sqlString(bridge.reviewStatus)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(resourceType, cohortKey, domain, authority, externalId) DO UPDATE SET
  externalCode = excluded.externalCode,
  canonicalId = excluded.canonicalId,
  sourceDatasetCode = excluded.sourceDatasetCode,
  sourceReleaseCode = excluded.sourceReleaseCode,
  mappingMethod = excluded.mappingMethod,
  reviewStatus = excluded.reviewStatus,
  updatedAt = excluded.updatedAt;`.trim(),
    )
  }

  for (const dataset of initialDatasets) {
    statements.push(
      `
INSERT INTO datasets (
  id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, sourceVariant, sourceUrl, licenseId, attribution, category, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlDatasetId(dataset.publisherCode, dataset.code)},
  (SELECT id FROM publishers WHERE code = ${sqlString(dataset.publisherCode)}),
  ${sqlString(dataset.code)},
  ${sqlString(dataset.regionCode)},
  ${sqlString(dataset.releaseType)},
  ${sqlString(dataset.releaseFrequency)},
  ${sqlString(dataset.theme)},
  ${sqlString(dataset.sourceVariant)},
  ${sqlNullable(dataset.sourceUrl)},
  (SELECT id FROM licenses WHERE code = ${sqlString(dataset.licenseCode)}),
  ${sqlNullable(dataset.attribution)},
  ${sqlNullable(dataset.category)},
  ${sqlString(dataset.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(publisherId, code) DO UPDATE SET
  regionCode = excluded.regionCode,
  releaseType = excluded.releaseType,
  releaseFrequency = excluded.releaseFrequency,
  theme = excluded.theme,
  sourceVariant = excluded.sourceVariant,
  sourceUrl = excluded.sourceUrl,
  licenseId = excluded.licenseId,
  attribution = excluded.attribution,
  category = excluded.category,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE datasets.versionHash <> excluded.versionHash;`.trim(),
    )
  }

  for (const resource of initialDatasetResourceTypes) {
    statements.push(
      `
INSERT INTO datasetResourceTypes (datasetId, resourceType)
VALUES (
  (
    SELECT d.id
    FROM datasets d
    JOIN publishers p ON p.id = d.publisherId
    WHERE p.code = ${sqlString(resource.publisherCode)}
      AND d.code = ${sqlString(resource.datasetCode)}
  ),
  ${sqlString(resource.resourceType)}
)
ON CONFLICT(datasetId, resourceType) DO NOTHING;`.trim(),
    )
  }

  for (const translation of initialDatasetI18n) {
    statements.push(
      `
INSERT INTO datasetI18n (
  datasetId, locale, name, description, createdAt, updatedAt
) VALUES (
  (
    SELECT d.id
    FROM datasets d
    JOIN publishers p ON p.id = d.publisherId
    WHERE p.code = ${sqlString(translation.publisherCode)} AND d.code = ${sqlString(translation.datasetCode)}
  ),
  ${sqlString(translation.locale)},
  ${sqlString(translation.name)},
  ${sqlNullable(translation.description)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(datasetId, locale) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  updatedAt = excluded.updatedAt;`.trim(),
    )
  }

  for (const transform of initialDatasetTransforms) {
    statements.push(
      `
INSERT INTO datasetTransforms (
  datasetId, code, resourceType, sourceVersion, outputVariant, derivation, versionHash, createdAt, updatedAt
) VALUES (
  (
    SELECT d.id
    FROM datasets d
    JOIN publishers p ON p.id = d.publisherId
    WHERE p.code = ${sqlString(transform.publisherCode)} AND d.code = ${sqlString(transform.datasetCode)}
  ),
  ${sqlString(transform.code)},
  ${sqlString(transform.resourceType)},
  ${sqlString(transform.sourceVersion)},
  ${sqlString(transform.outputVariant)},
  ${sqlString(JSON.stringify(transform.derivation))},
  ${sqlString(transform.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(datasetId, code) DO UPDATE SET
  resourceType = excluded.resourceType,
  sourceVersion = excluded.sourceVersion,
  outputVariant = excluded.outputVariant,
  derivation = excluded.derivation,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE datasetTransforms.versionHash <> excluded.versionHash;`.trim(),
    )
  }

  for (const apiVersion of initialApiVersions) {
    statements.push(
      `
INSERT INTO apiVersions (
  id, code, familyType, version, status, publishedAt, deprecatedAt, retiredAt, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlDeterministicId(API_VERSION_ID_NAMESPACE, apiVersion.code)},
  ${sqlString(apiVersion.code)},
  ${sqlString(apiVersion.familyType)},
  ${sqlString(apiVersion.version)},
  ${sqlString(apiVersion.status)},
  ${apiVersion.publishedAt ? sqlTimestampMs(apiVersion.publishedAt) : 'NULL'},
  ${apiVersion.deprecatedAt ? sqlTimestampMs(apiVersion.deprecatedAt) : 'NULL'},
  ${apiVersion.retiredAt ? sqlTimestampMs(apiVersion.retiredAt) : 'NULL'},
  ${sqlString(apiVersion.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(code) DO UPDATE SET
  familyType = excluded.familyType,
  version = excluded.version,
  status = excluded.status,
  publishedAt = excluded.publishedAt,
  deprecatedAt = excluded.deprecatedAt,
  retiredAt = excluded.retiredAt,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE apiVersions.versionHash <> excluded.versionHash;`.trim(),
    )
  }

  for (const composition of initialApiCompositions) {
    statements.push(
      `
INSERT INTO apiComposition (
  id, apiVersionId, code, version, primaryResourceType, defaultDomainCode, i18n, status, notes, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlDeterministicId(API_COMPOSITION_ID_NAMESPACE, composition.code)},
  (SELECT id FROM apiVersions WHERE code = ${sqlString(composition.apiVersion)}),
  ${sqlString(composition.code)},
  ${composition.version},
  ${sqlString(composition.primaryResourceType)},
  ${sqlNullable(composition.defaultDomainCode)},
  ${sqlString(JSON.stringify(composition.i18n))},
  ${sqlString(composition.status)},
  ${sqlNullable(composition.notes)},
  ${sqlString(composition.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(code) DO UPDATE SET
  apiVersionId = excluded.apiVersionId,
  version = excluded.version,
  primaryResourceType = excluded.primaryResourceType,
  defaultDomainCode = excluded.defaultDomainCode,
  i18n = excluded.i18n,
  status = excluded.status,
  notes = excluded.notes,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE apiComposition.versionHash <> excluded.versionHash;`.trim(),
    )
  }

  for (const member of initialApiCompositionMembers) {
    statements.push(
      `
INSERT INTO apiCompositionMembers (
  apiCompositionId, domainCode, resourceType, variant, role, isRequired, cohortMatchingMode, anchorResourceType, maxLagDays, priority, configJson
) VALUES (
  (SELECT id FROM apiComposition WHERE code = ${sqlString(member.apiCompositionCode)}),
  ${sqlString(member.domainCode)},
  ${sqlString(member.resourceType)},
  ${sqlString(member.variant)},
  ${sqlString(member.role)},
  ${member.isRequired ? 1 : 0},
  ${sqlString(member.cohortMatchingMode)},
  ${sqlNullable(member.anchorResourceType)},
  ${member.maxLagDays == null ? 'NULL' : member.maxLagDays},
  ${member.priority},
  NULL
)
ON CONFLICT(apiCompositionId, domainCode, resourceType, variant) DO UPDATE SET
  role = excluded.role,
  isRequired = excluded.isRequired,
  cohortMatchingMode = excluded.cohortMatchingMode,
  anchorResourceType = excluded.anchorResourceType,
  maxLagDays = excluded.maxLagDays,
  priority = excluded.priority;`.trim(),
    )
  }

  for (const endpoint of initialApiEndpoints) {
    statements.push(
      `
INSERT INTO apiEndpoints (
  id, apiVersionId, method, path, operationId, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlDeterministicId(API_ENDPOINT_ID_NAMESPACE, endpoint.operationId)},
  (SELECT id FROM apiVersions WHERE code = ${sqlString(endpoint.apiVersion)}),
  ${sqlString(endpoint.method)},
  ${sqlString(endpoint.path)},
  ${sqlString(endpoint.operationId)},
  ${sqlString(endpoint.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(operationId) DO UPDATE SET
  apiVersionId = excluded.apiVersionId,
  method = excluded.method,
  path = excluded.path,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE apiEndpoints.versionHash <> excluded.versionHash;`.trim(),
    )
  }

  for (const shard of resolveInitialDataShardsForEnvironment(environment)) {
    statements.push(
      `
INSERT INTO dataShards (
  id, shardType, regionCode, year, environment, databaseName, databaseId, bindingName, status, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlDeterministicId(DATA_SHARD_ID_NAMESPACE, shard.bindingName)},
  ${sqlString(shard.shardType)},
  ${sqlNullable(shard.regionCode)},
  ${sqlNullable(shard.year)},
  ${sqlString(shard.environment)},
  ${sqlString(shard.databaseName)},
  ${sqlString(shard.databaseId)},
  ${sqlString(shard.bindingName)},
  ${sqlString(shard.status)},
  ${sqlString(shard.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(bindingName) DO UPDATE SET
  shardType = excluded.shardType,
  regionCode = excluded.regionCode,
  year = excluded.year,
  environment = excluded.environment,
  databaseName = excluded.databaseName,
  databaseId = excluded.databaseId,
  status = excluded.status,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE dataShards.versionHash <> excluded.versionHash;`.trim(),
    )
  }

  return statements
}

export function buildMetaRegistrySyncSql(environment: MetaRegistrySyncEnvironment) {
  return [
    'PRAGMA foreign_keys = ON;',
    ...buildMetaRegistrySyncStatements(environment),
  ].join('\n\n')
}
