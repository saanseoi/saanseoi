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
const UNIT_ID_NAMESPACE = 'f78a7f44-3e21-54f4-a6e1-56c021bb7c29'

export const metaRegistryRequiredTables = [
  'publishers',
  'publisherI18n',
  'licenses',
  'units',
  'unitsI18n',
  'datasets',
  'datasetResourceTypes',
  'datasetI18n',
  'datasetTransforms',
  'apiVersions',
  'apiComposition',
  'apiCompositionMembers',
  'apiEndpoints',
  'dataShards',
  'divisionCodes',
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

type UnitFixture = {
  versionHash: string
  units: Array<{
    code: string
    dimension: string
    symbol: string
    i18n: Array<{
      locale: Locale
      name: string
      description?: string
    }>
  }>
}

type DatasetFixture = {
  versionHash: string
  publisherCode: string
  code: string
  regionCode: string
  releaseType: DatasetReleaseType
  releaseFrequency: DatasetReleaseFrequency
  theme: DatasetTheme
  subType?: string
  sourceVariant?: string
  sourceCrs?: string
  resourceTypes: ResourceType[]
  licenseCode: string
  attribution?: string
  sourceUrl?: string
  schemaURL: string | null
  category?: DatasetCategory
  // A dataset selects the source-specific operations it uses from a versioned
  // merge ruleset. The rule definitions themselves belong to rulesetVersions.
  mergeRules?: Array<{
    rulesetVersion: string
    operationCodes: string[]
  }>
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
  ingestDependencies?: Array<{
    resourceType: ResourceType
    variant?: string
  }>
  role: string
  isRequired: boolean
  cohortMatchingMode: string
  configJson?: string
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

export type MergeProcessingRule = {
  operationCode: string
  type: 'bulk' | 'record'
  sourceFieldPath?: string
  targetFieldPath?: string
  condition?: string
  mappings?: Array<{ from: string; to: string }>
  i18n: Array<{
    locale: Locale
    description: string
  }>
}

type MergeRulesetFixture = {
  versionHash: string
  code: string
  resourceType: ResourceType
  strategy: 'merge'
  version: string
  notes?: string
  mergeRules?: MergeProcessingRule[]
}

export type DatasetMergeRuleReference = {
  rulesetVersion: string
  operationCodes: string[]
}

export type ReleaseMergeRules = {
  rulesets: Array<{
    rulesetVersion: string
    rulesetVersionHash: string
    rules: MergeProcessingRule[]
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

type InitialUnitSeed = {
  code: string
  dimension: string
  symbol: string
  versionHash: string
}

type InitialUnitI18nSeed = {
  code: string
  locale: Locale
  name: string
  description?: string
}

type InitialDatasetSeed = VersionedFixture<
  Omit<
    DatasetFixture,
    'i18n' | 'mergeRules' | 'resourceTypes' | 'subType' | 'sourceVariant' | 'transforms'
  > & {
    subType: string | null
    sourceVariant: string
    processingRules: ReleaseMergeRules | null
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
  configJson?: string
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

export type DivisionCodeFixtureAssignment = {
  divisionCode: string
  canonicalId: string
}

type DivisionCodeFixture = {
  versionHash: string
  domainCode: string
  assignments: DivisionCodeFixtureAssignment[]
}

export function validateDivisionCodeFixtures(
  fixtures: Array<Pick<DivisionCodeFixture, 'assignments' | 'domainCode'>>,
  knownCanonicalIds?: ReadonlySet<string>,
) {
  const codes = new Set<string>()
  const targets = new Set<string>()
  for (const fixture of fixtures) {
    if (!fixture.domainCode.trim())
      throw new Error('Division code fixture has no domainCode.')
    for (const assignment of fixture.assignments) {
      if (!assignment.divisionCode.trim() || /\s/.test(assignment.divisionCode)) {
        throw new Error(`Invalid Division code=${assignment.divisionCode}.`)
      }
      if (!assignment.canonicalId.trim()) {
        throw new Error(
          `Division code=${assignment.divisionCode} has no canonical target.`,
        )
      }
      if (knownCanonicalIds && !knownCanonicalIds.has(assignment.canonicalId)) {
        throw new Error(
          `Division code=${assignment.divisionCode} targets unknown canonical Division ${assignment.canonicalId}.`,
        )
      }
      const codeKey = `${fixture.domainCode}\u0000${assignment.divisionCode}`
      const targetKey = `${fixture.domainCode}\u0000${assignment.canonicalId}`
      if (codes.has(codeKey))
        throw new Error(`Duplicate Division code=${assignment.divisionCode}.`)
      if (targets.has(targetKey))
        throw new Error(
          `Ambiguous canonical Division target=${assignment.canonicalId}.`,
        )
      codes.add(codeKey)
      targets.add(targetKey)
    }
  }
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
const unitFixtures = readFixtureDir<UnitFixture>('units')
const datasetFixtures = readFixtureDir<DatasetFixture>('datasets')
const mergeRulesetFixtures = readFixtureDir<MergeRulesetFixture>('rulesetVersions')
const apiCompositionFixtures = readFixtureDir<ApiCompositionFixture>('apiCompositions')
const apiEndpointFixtures = readFixtureDir<ApiEndpointFileFixture>('apiEndpoints')
const dataShardFixtures = readFixtureDir<DataShardFileFixture>('dataShards')
const divisionCodeFixtures = readFixtureDir<DivisionCodeFixture>('divisionCodes')
validateDivisionCodeFixtures(divisionCodeFixtures)
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

export const initialPublishers: InitialPublisherSeed[] = publisherFixtures
  // Parent rows must be inserted before children because child links use a
  // same-batch lookup of the parent publisher's deterministic ID.
  .toSorted(
    (left, right) =>
      Number(Boolean(left.parentCode)) - Number(Boolean(right.parentCode)) ||
      left.code.localeCompare(right.code),
  )
  .map(fixture => ({
    code: fixture.code,
    url: fixture.url,
    contactUrl: fixture.contactUrl,
    parentCode: fixture.parentCode,
    versionHash: fixture.versionHash,
  }))

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

export const initialUnits: InitialUnitSeed[] = unitFixtures.flatMap(fixture =>
  fixture.units.map(unit => ({ ...unit, versionHash: fixture.versionHash })),
)

export const initialUnitsI18n: InitialUnitI18nSeed[] = unitFixtures.flatMap(fixture =>
  fixture.units.flatMap(unit =>
    unit.i18n.map(translation => ({ code: unit.code, ...translation })),
  ),
)

export const initialDatasets: InitialDatasetSeed[] = datasetFixtures.map(fixture => ({
  versionHash: fixture.versionHash,
  publisherCode: fixture.publisherCode,
  code: fixture.code,
  regionCode: fixture.regionCode,
  releaseType: fixture.releaseType,
  releaseFrequency: fixture.releaseFrequency,
  theme: fixture.theme,
  subType: fixture.subType ?? null,
  sourceVariant: fixture.sourceVariant ?? 'default',
  sourceCrs: fixture.sourceCrs,
  licenseCode: fixture.licenseCode,
  attribution: fixture.attribution,
  sourceUrl: fixture.sourceUrl,
  schemaURL: fixture.schemaURL,
  category: fixture.category,
  processingRules: resolveDatasetMergeRules(fixture.mergeRules),
}))

/**
 * Resolves the dataset's declared operation codes against immutable merge-rule
 * revisions. Callers persist this result on the source release at creation.
 */
export function resolveDatasetMergeRules(
  references: DatasetMergeRuleReference[] | null | undefined,
): ReleaseMergeRules | null {
  if (!references?.length) return null

  return {
    rulesets: references.map(reference => {
      const ruleset = mergeRulesetFixtures.find(
        fixture => fixture.code === reference.rulesetVersion,
      )
      if (!ruleset) {
        throw new Error(`Unknown merge ruleset version: ${reference.rulesetVersion}.`)
      }

      const rulesByCode = new Map(
        (ruleset.mergeRules ?? []).map(rule => [rule.operationCode, rule]),
      )
      const rules = reference.operationCodes.map(operationCode => {
        const rule = rulesByCode.get(operationCode)
        if (!rule) {
          throw new Error(
            `Merge ruleset ${reference.rulesetVersion} does not define operation ${operationCode}.`,
          )
        }
        return rule
      })

      return {
        rulesetVersion: ruleset.code,
        rulesetVersionHash: ruleset.versionHash,
        rules,
      }
    }),
  }
}

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
      configJson:
        member.ingestDependencies && member.ingestDependencies.length > 0
          ? JSON.stringify({ ingestDependencies: member.ingestDependencies })
          : undefined,
      anchorResourceType: member.anchorResourceType,
      maxLagDays: member.maxLagDays,
      priority: member.priority,
    })),
  )

/**
 * Canonical domain-code renames applied to published registry metadata.
 *
 * A domain identifies a lineage, so these are deliberately limited to cases
 * where the previous code was only a label for the same official lineage.
 */
export const apiDomainCodeRenames = [
  {
    apiVersion: 'api-addresses-v0.1',
    from: 'default',
    to: 'official',
  },
  {
    apiVersion: 'api-stats-v0.1',
    from: 'default',
    to: 'official',
  },
  {
    apiVersion: 'api-streets-v0.1',
    from: 'hkgov-landsd',
    to: 'official',
  },
] as const

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

export const initialDivisionCodes = divisionCodeFixtures.flatMap(fixture =>
  fixture.assignments.map(assignment => ({
    ...assignment,
    domainCode: fixture.domainCode,
    versionHash: fixture.versionHash,
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

  for (const unit of initialUnits) {
    statements.push(
      `
INSERT INTO units (
  id, code, dimension, symbol, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlDeterministicId(UNIT_ID_NAMESPACE, unit.code)},
  ${sqlString(unit.code)},
  ${sqlString(unit.dimension)},
  ${sqlString(unit.symbol)},
  ${sqlString(unit.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(code) DO UPDATE SET
  dimension = excluded.dimension,
  symbol = excluded.symbol,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE units.versionHash <> excluded.versionHash;`.trim(),
    )
  }

  for (const translation of initialUnitsI18n) {
    statements.push(
      `
INSERT INTO unitsI18n (
  unitId, locale, name, description, createdAt, updatedAt
) VALUES (
  (SELECT id FROM units WHERE code = ${sqlString(translation.code)}),
  ${sqlString(translation.locale)},
  ${sqlString(translation.name)},
  ${sqlNullable(translation.description)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(unitId, locale) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  updatedAt = excluded.updatedAt;`.trim(),
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

  for (const divisionCode of initialDivisionCodes) {
    statements.push(
      `
INSERT INTO divisionCodes (
  domainCode, divisionCode, canonicalId, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlString(divisionCode.domainCode)},
  ${sqlString(divisionCode.divisionCode)},
  ${sqlString(divisionCode.canonicalId)},
  ${sqlString(divisionCode.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(domainCode, divisionCode) DO UPDATE SET
  canonicalId = excluded.canonicalId,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE divisionCodes.versionHash <> excluded.versionHash;`.trim(),
    )
  }

  for (const dataset of initialDatasets) {
    statements.push(
      `
INSERT INTO datasets (
  id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, subType, sourceVariant, sourceCrs, sourceUrl, schemaURL, licenseId, attribution, category, processingRules, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlDatasetId(dataset.publisherCode, dataset.code)},
  (SELECT id FROM publishers WHERE code = ${sqlString(dataset.publisherCode)}),
  ${sqlString(dataset.code)},
  ${sqlString(dataset.regionCode)},
  ${sqlString(dataset.releaseType)},
  ${sqlString(dataset.releaseFrequency)},
  ${sqlString(dataset.theme)},
  ${sqlNullable(dataset.subType)},
  ${sqlString(dataset.sourceVariant)},
  ${sqlNullable(dataset.sourceCrs)},
  ${sqlNullable(dataset.sourceUrl)},
  ${sqlNullable(dataset.schemaURL ?? undefined)},
  (SELECT id FROM licenses WHERE code = ${sqlString(dataset.licenseCode)}),
  ${sqlNullable(dataset.attribution)},
  ${sqlNullable(dataset.category)},
  ${sqlNullable(
    dataset.processingRules ? JSON.stringify(dataset.processingRules) : undefined,
  )},
  ${sqlString(dataset.versionHash)},
  ${nowSql},
  ${nowSql}
)
ON CONFLICT(publisherId, code) DO UPDATE SET
  regionCode = excluded.regionCode,
  releaseType = excluded.releaseType,
  releaseFrequency = excluded.releaseFrequency,
  theme = excluded.theme,
  subType = excluded.subType,
  sourceVariant = excluded.sourceVariant,
  sourceCrs = excluded.sourceCrs,
  sourceUrl = excluded.sourceUrl,
  schemaURL = excluded.schemaURL,
  licenseId = excluded.licenseId,
  attribution = excluded.attribution,
  category = excluded.category,
  processingRules = excluded.processingRules,
  versionHash = excluded.versionHash,
  updatedAt = excluded.updatedAt
WHERE datasets.versionHash <> excluded.versionHash
   OR datasets.schemaURL IS NOT excluded.schemaURL;`.trim(),
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

  // Keep published release and catalogue metadata aligned when a composition
  // renames an existing domain without changing its lineage.
  for (const rename of apiDomainCodeRenames) {
    const apiVersionId = `(SELECT id FROM apiVersions WHERE code = ${sqlString(rename.apiVersion)})`
    statements.push(
      `
UPDATE apiReleaseSets
SET domainCode = ${sqlString(rename.to)},
    updatedAt = ${nowSql}
WHERE apiVersionId = ${apiVersionId}
  AND domainCode = ${sqlString(rename.from)};`.trim(),
    )
    statements.push(
      `
UPDATE apiCatalogRevisions
SET defaultDomainCode = ${sqlString(rename.to)}
WHERE apiVersionId = ${apiVersionId}
  AND defaultDomainCode = ${sqlString(rename.from)};`.trim(),
    )
    statements.push(
      `
UPDATE apiCatalogRevisionReleaseSets
SET domainCode = ${sqlString(rename.to)}
WHERE domainCode = ${sqlString(rename.from)}
  AND apiReleaseSetId IN (
    SELECT id
    FROM apiReleaseSets
    WHERE apiVersionId = ${apiVersionId}
  );`.trim(),
    )
  }

  // A composition fixture declares the complete current set of member slots.
  // Replacing a variant must not leave its previous slot active alongside it.
  statements.push(
    `
DELETE FROM apiCompositionMembers
WHERE apiCompositionId IN (
  SELECT id
  FROM apiComposition
  WHERE code IN (${initialApiCompositions.map(composition => sqlString(composition.code)).join(', ')})
);`.trim(),
  )

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
  ${sqlNullable(member.configJson)}
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
