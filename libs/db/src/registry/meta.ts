import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  DatasetType,
  ProfileName,
  ResolverCode,
} from '../constants/schema'
import { computeVersionHash } from '../versioning'

const fixturesDir = new URL('../../../../fixtures/meta/', import.meta.url)
const nowSql = "cast(unixepoch('subsecond') * 1000 as integer)"
const sqlUuid =
  "lower(hex(randomblob(4))) || '-' || " +
  "lower(hex(randomblob(2))) || '-' || " +
  "'4' || substr(lower(hex(randomblob(2))), 2) || '-' || " +
  "substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || " +
  'lower(hex(randomblob(6)))'

export const metaRegistryRequiredTables = [
  'publishers',
  'publisherI18n',
  'licenses',
  'datasets',
  'datasetI18n',
  'apiVersions',
  'apiComposition',
  'apiCompositionMembers',
  'apiEndpoints',
  'dataShards',
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
  'normalize_whitespace',
]

type Locale = 'en' | 'zhHant' | 'zhHans'

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
  type: DatasetType
  licenseCode: string
  attribution?: string
  sourceUrl: string
  category?: DatasetCategory
  i18n: Array<{
    locale: Locale
    name: string
    description?: string
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

type ResourceType = 'address' | 'division' | 'place' | 'street'

type ApiCompositionFixture = {
  versionHash: string
  apiVersion: string
  code: string
  version: number
  primaryResourceType: ResourceType
  status: string
  notes?: string
  members: Array<{
    resourceType: ResourceType
    role: string
    isRequired: boolean
    selectionMode: string
    anchorResourceType?: ResourceType
    maxLagDays?: number
    priority: number
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

type InitialDatasetSeed = VersionedFixture<Omit<DatasetFixture, 'i18n'>>

type InitialDatasetI18nSeed = {
  datasetCode: string
  publisherCode: string
  locale: Locale
  name: string
  description?: string
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
  status: string
  notes?: string
}>

type InitialApiCompositionMemberSeed = {
  apiCompositionCode: string
  resourceType: ResourceType
  role: string
  isRequired: boolean
  selectionMode: string
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

function sqlTimestampMs(value: string) {
  return `cast(unixepoch(${sqlString(value)}, 'subsecond') * 1000 as integer)`
}

const publisherFixtures = readFixtureDir<PublisherFixture>('dataPublishers')
const datasetFixtures = readFixtureDir<DatasetFixture>('datasets')
const apiCompositionFixtures = readFixtureDir<ApiCompositionFixture>('apiCompositions')
const apiEndpointFixtures = readFixtureDir<ApiEndpointFileFixture>('apiEndpoints')
const dataShardFixtures = readFixtureDir<DataShardFileFixture>('dataShards')

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
  type: fixture.type,
  licenseCode: fixture.licenseCode,
  attribution: fixture.attribution,
  sourceUrl: fixture.sourceUrl,
  category: fixture.category,
}))

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

export const initialApiVersions = readFixtureDir<InitialApiVersionSeed>('apiVersions')

export const initialApiCompositions: InitialApiCompositionSeed[] =
  apiCompositionFixtures.map(fixture => ({
    apiVersion: fixture.apiVersion,
    code: fixture.code,
    version: fixture.version,
    primaryResourceType: fixture.primaryResourceType,
    status: fixture.status,
    notes: fixture.notes,
    versionHash: fixture.versionHash,
  }))

export const initialApiCompositionMembers: InitialApiCompositionMemberSeed[] =
  apiCompositionFixtures.flatMap(fixture =>
    fixture.members.map(member => ({
      apiCompositionCode: fixture.code,
      resourceType: member.resourceType,
      role: member.role,
      isRequired: member.isRequired,
      selectionMode: member.selectionMode,
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
  ${sqlUuid},
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
  ${sqlUuid},
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

  for (const dataset of initialDatasets) {
    statements.push(
      `
INSERT INTO datasets (
  id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, type, sourceUrl, licenseId, attribution, category, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlUuid},
  (SELECT id FROM publishers WHERE code = ${sqlString(dataset.publisherCode)}),
  ${sqlString(dataset.code)},
  ${sqlString(dataset.regionCode)},
  ${sqlString(dataset.releaseType)},
  ${sqlString(dataset.releaseFrequency)},
  ${sqlString(dataset.theme)},
  ${sqlString(dataset.type)},
  ${sqlString(dataset.sourceUrl)},
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
  type = excluded.type,
  sourceUrl = excluded.sourceUrl,
  licenseId = excluded.licenseId,
  attribution = excluded.attribution,
  category = excluded.category,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE datasets.versionHash <> excluded.versionHash;`.trim(),
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

  for (const apiVersion of initialApiVersions) {
    statements.push(
      `
INSERT INTO apiVersions (
  id, code, familyType, version, status, publishedAt, deprecatedAt, retiredAt, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlUuid},
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
  id, apiVersionId, code, version, primaryResourceType, status, notes, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlUuid},
  (SELECT id FROM apiVersions WHERE code = ${sqlString(composition.apiVersion)}),
  ${sqlString(composition.code)},
  ${composition.version},
  ${sqlString(composition.primaryResourceType)},
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
  apiCompositionId, resourceType, role, isRequired, selectionMode, anchorResourceType, maxLagDays, priority, configJson
) VALUES (
  (SELECT id FROM apiComposition WHERE code = ${sqlString(member.apiCompositionCode)}),
  ${sqlString(member.resourceType)},
  ${sqlString(member.role)},
  ${member.isRequired ? 1 : 0},
  ${sqlString(member.selectionMode)},
  ${sqlNullable(member.anchorResourceType)},
  ${member.maxLagDays == null ? 'NULL' : member.maxLagDays},
  ${member.priority},
  NULL
)
ON CONFLICT(apiCompositionId, resourceType) DO UPDATE SET
  role = excluded.role,
  isRequired = excluded.isRequired,
  selectionMode = excluded.selectionMode,
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
  ${sqlUuid},
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
  ${sqlUuid},
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
