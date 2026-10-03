import type { MetaTranslations } from './i18n'
import type {
  ApiFieldInput,
  ApiFieldRulePin,
  PublisherFields,
} from '../../apiFieldInputs'
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

import {
  apiFamilyTypes,
  apiEndpointMethods,
  apiReleaseSetSourceRoles,
  apiReleaseSetStatuses,
  apiVersionStatuses,
  datasetTypes,
  provenanceContributionTypes,
  snapshotStatuses,
} from '../../constants/schema'
import { isoTimestamp, jsonText, primaryUuid, timestamps } from '../shared'
import { metaDatasets, metaResourceReleases } from './datasets'

type ReferenceAction = 'cascade' | 'restrict'

const apiVersionIdColumn = (onDelete: ReferenceAction) =>
  text('apiVersionId')
    .notNull()
    .references(() => metaApiVersions.id, { onDelete })

const snapshotIdColumn = (onDelete: ReferenceAction) =>
  text('snapshotId')
    .notNull()
    .references(() => metaSnapshots.id, { onDelete })

const datasetIdColumn = () =>
  text('datasetId')
    .notNull()
    .references(() => metaDatasets.id, { onDelete: 'restrict' })

const snapshotRecipeIdColumn = (onDelete: ReferenceAction) =>
  text('snapshotRecipeId')
    .notNull()
    .references(() => metaSnapshotRecipes.id, { onDelete })

const apiCompositionIdColumn = () =>
  text('apiCompositionId')
    .notNull()
    .references(() => metaApiComposition.id, { onDelete: 'cascade' })

const apiReleaseSetIdColumn = () =>
  text('apiReleaseSetId')
    .notNull()
    .references(() => metaApiReleaseSets.id, { onDelete: 'cascade' })

const apiVersionReleaseSetIdColumn = () =>
  text('apiVersionReleaseSetId')
    .notNull()
    .references(() => metaApiVersionReleaseSets.id, { onDelete: 'cascade' })

const apiCatalogRevisionIdColumn = () =>
  text('apiCatalogRevisionId')
    .notNull()
    .references(() => metaApiCatalogRevisions.id, { onDelete: 'cascade' })

export const metaApiVersions = sqliteTable(
  'apiVersions',
  {
    id: primaryUuid('id'),
    code: text('code').notNull().unique(),
    familyType: text('familyType', { enum: apiFamilyTypes }).notNull(),
    version: text('version').notNull(),
    status: text('status', { enum: apiVersionStatuses }).notNull(),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    index('apiVersions_familyType_status_idx').on(table.familyType, table.status),
  ],
)

export const metaApiLifecycleJournal = sqliteTable(
  'apiLifecycleJournal',
  {
    id: primaryUuid('id'),
    apiVersionId: apiVersionIdColumn('cascade'),
    statusFrom: text('statusFrom', { enum: apiVersionStatuses }),
    statusTo: text('statusTo', { enum: apiVersionStatuses }).notNull(),
    reason: text('reason'),
    metadataJson: jsonText('metadataJson'),
    occurredAt: isoTimestamp('occurredAt').notNull(),
  },
  table => [
    index('apiLifecycleJournal_apiVersionId_occurredAt_idx').on(
      table.apiVersionId,
      table.occurredAt,
    ),
    index('apiLifecycleJournal_statusTo_idx').on(table.statusTo),
  ],
)

export const metaSnapshotLineages = sqliteTable(
  'snapshotLineages',
  {
    id: primaryUuid('id'),
    code: text('code').notNull().unique(),
    regionCode: text('regionCode').notNull(),
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
    variant: text('variant').notNull().default('default'),
    identityMode: text('identityMode', {
      enum: ['persistent', 'cohort_scoped'],
    }).notNull(),
    primaryDatasetId: text('primaryDatasetId').references(() => metaDatasets.id, {
      onDelete: 'restrict',
    }),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('snapshotLineages_primaryDataset_resourceType_variant_unique_idx').on(
      table.primaryDatasetId,
      table.resourceType,
      table.variant,
    ),
    index('snapshotLineages_region_resource_variant_idx').on(
      table.regionCode,
      table.resourceType,
      table.variant,
    ),
  ],
)

export const metaSnapshots = sqliteTable(
  'snapshots',
  {
    id: primaryUuid('id'),
    snapshotLineageId: text('snapshotLineageId').references(
      () => metaSnapshotLineages.id,
      { onDelete: 'restrict' },
    ),
    parentSnapshotId: text('parentSnapshotId'),
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
    code: text('code').notNull(),
    cohortKey: text('cohortKey').notNull(),
    geometryStatus: text('geometryStatus', {
      enum: ['authoritative', 'fallback'],
    }),
    revision: integer('revision').notNull().default(0),
    status: text('status', { enum: snapshotStatuses }).notNull(),
    publishedAt: isoTimestamp('publishedAt'),
    validFrom: isoTimestamp('validFrom'),
    validTo: isoTimestamp('validTo'),
    ...timestamps,
  },
  table => [
    uniqueIndex('snapshots_resourceType_code_unique_idx').on(
      table.resourceType,
      table.code,
    ),
    uniqueIndex('snapshots_id_resourceType_unique_idx').on(
      table.id,
      table.resourceType,
    ),
    index('snapshots_resourceType_status_idx').on(table.resourceType, table.status),
    uniqueIndex('snapshots_lineage_cohort_revision_unique_idx').on(
      table.snapshotLineageId,
      table.cohortKey,
      table.revision,
    ),
    index('snapshots_parentSnapshotId_idx').on(table.parentSnapshotId),
  ],
)

export const metaSnapshotResourceReleases = sqliteTable(
  'snapshotResourceReleases',
  {
    snapshotId: snapshotIdColumn('cascade'),
    datasetId: datasetIdColumn(),
    resourceReleaseId: text('resourceReleaseId').notNull(),
    role: text('role', { enum: apiReleaseSetSourceRoles }).notNull(),
    selectedByRule: text('selectedByRule'),
    selectionMode: text('selectionMode'),
    anchorReleaseId: text('anchorReleaseId'),
    sourceCohortKey: text('sourceCohortKey'),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.resourceReleaseId],
    }),
    foreignKey({
      columns: [table.resourceReleaseId, table.datasetId],
      foreignColumns: [metaResourceReleases.id, metaResourceReleases.datasetId],
      name: 'snapshotResourceReleases_resourceReleaseId_datasetId_resourceReleases_id_datasetId_fk',
    }).onDelete('restrict'),
    index('snapshotResourceReleases_datasetId_idx').on(table.datasetId),
    index('snapshotResourceReleases_resourceReleaseId_idx').on(table.resourceReleaseId),
  ],
)

export const metaApiReleaseSets = sqliteTable(
  'apiReleaseSets',
  {
    id: primaryUuid('id'),
    // Immutable domain/cohort composition code; its trailing `r` segment is
    // the composition revision for this effective cohort.
    code: text('code').notNull(),
    regionCode: text('regionCode'),
    domainCode: text('domainCode').notNull().default('default'),
    cohortKey: text('cohortKey'),
    revision: integer('revision').notNull().default(0),
    effectiveFrom: isoTimestamp('effectiveFrom'),
    schemaVersion: text('schemaVersion').notNull(),
    rulesetVersion: text('rulesetVersion').notNull(),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('apiReleaseSets_code_schema_ruleset_unique_idx').on(
      table.code,
      table.schemaVersion,
      table.rulesetVersion,
    ),
    uniqueIndex('apiReleaseSets_domain_cohort_revision_unique_idx').on(
      table.regionCode,
      table.domainCode,
      table.cohortKey,
      table.revision,
      table.schemaVersion,
      table.rulesetVersion,
    ),
  ],
)

export const metaApiVersionReleaseSets = sqliteTable(
  'apiVersionReleaseSets',
  {
    id: primaryUuid('id'),
    apiVersionId: apiVersionIdColumn('restrict'),
    apiReleaseSetId: apiReleaseSetIdColumn(),
    apiCompositionId: text('apiCompositionId').references(() => metaApiComposition.id, {
      onDelete: 'restrict',
    }),
    supersedesApiReleaseSetId: text('supersedesApiReleaseSetId').references(
      () => metaApiReleaseSets.id,
      { onDelete: 'restrict' },
    ),
    status: text('status', { enum: apiReleaseSetStatuses }).notNull(),
    publishedAt: isoTimestamp('publishedAt'),
    validFrom: isoTimestamp('validFrom'),
    validTo: isoTimestamp('validTo'),
    notes: text('notes'),
    guide: text('guide'),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('apiVersionReleaseSets_version_release_unique_idx').on(
      table.apiVersionId,
      table.apiReleaseSetId,
    ),
    index('apiVersionReleaseSets_version_status_idx').on(
      table.apiVersionId,
      table.status,
    ),
    index('apiVersionReleaseSets_release_idx').on(table.apiReleaseSetId),
  ],
)

export const metaApiCatalogRevisions = sqliteTable(
  'apiCatalogRevisions',
  {
    id: primaryUuid('id'),
    apiVersionId: apiVersionIdColumn('restrict'),
    code: text('code').notNull().unique(),
    regionCode: text('regionCode').notNull(),
    publicationDate: text('publicationDate').notNull(),
    revision: integer('revision').notNull(),
    defaultDomainCode: text('defaultDomainCode'),
    status: text('status', { enum: apiReleaseSetStatuses }).notNull(),
    versionHash: text('versionHash').notNull(),
    publishedAt: isoTimestamp('publishedAt').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('apiCatalogRevisions_scope_publication_revision_unique_idx').on(
      table.apiVersionId,
      table.regionCode,
      table.publicationDate,
      table.revision,
    ),
    index('apiCatalogRevisions_scope_published_idx').on(
      table.apiVersionId,
      table.regionCode,
      table.publishedAt,
    ),
  ],
)

export const metaReleaseSetLifecycleJournal = sqliteTable(
  'releaseSetLifecycleJournal',
  {
    id: primaryUuid('id'),
    resourceReleaseId: text('resourceReleaseId')
      .notNull()
      .references(() => metaResourceReleases.id, { onDelete: 'restrict' }),
    relatedResourceReleaseId: text('relatedResourceReleaseId').references(
      () => metaResourceReleases.id,
      {
        onDelete: 'set null',
      },
    ),
    snapshotId: text('snapshotId').references(() => metaSnapshots.id, {
      onDelete: 'set null',
    }),
    apiVersionReleaseSetId: text('apiVersionReleaseSetId').references(
      () => metaApiVersionReleaseSets.id,
      {
        onDelete: 'set null',
      },
    ),
    action: text('action').notNull(),
    statusFrom: text('statusFrom'),
    statusTo: text('statusTo'),
    reason: text('reason'),
    metadataJson: jsonText('metadataJson'),
    createdAt: timestamps.createdAt,
  },
  table => [
    index('releaseSetLifecycleJournal_resourceReleaseId_idx').on(
      table.resourceReleaseId,
    ),
    index('releaseSetLifecycleJournal_relatedReleaseId_idx').on(
      table.relatedResourceReleaseId,
    ),
    index('releaseSetLifecycleJournal_action_idx').on(table.action),
  ],
)

/** Descriptive selection policy; transformation implementations live in the codebase. */
export type SnapshotSelectionPolicy = {
  rules: Array<{ selectedByRule: string; selectionMode: string }>
}

/** Construction context only. Source releases and snapshot dependencies are relational. */
export type SnapshotAssemblyDetails = {
  releaseRole?: string
  sourceReleaseId?: string
  sourceVersion?: string
  materialisationHash?: string
  policyVersion?: string
  policies?: Record<string, unknown>
  curationHash?: string
  unreviewedAddressCases?: number
  rowCount?: number
}

/** Each role pins one exact dependency; a snapshot may have several different roles. */
export const metaSnapshotDependencies = sqliteTable(
  'snapshotDependencies',
  {
    snapshotId: snapshotIdColumn('cascade'),
    dependencySnapshotId: text('dependencySnapshotId')
      .notNull()
      .references(() => metaSnapshots.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
  },
  table => [
    primaryKey({ columns: [table.snapshotId, table.role] }),
    index('snapshotDependencies_dependencySnapshotId_idx').on(
      table.dependencySnapshotId,
    ),
  ],
)

export const metaSnapshotRecipes = sqliteTable(
  'snapshotRecipes',
  {
    id: primaryUuid('id'),
    code: text('code').notNull().unique(),
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
    version: integer('version').notNull(),
    status: text('status').notNull(),
    notes: text('notes'),
    // Frozen assembly policy; ingestion policy belongs to source/resource releases.
    processingRules: jsonText<{ definitionId: string }>('processingRules'),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    index('snapshotRecipes_resourceType_status_idx').on(
      table.resourceType,
      table.status,
    ),
  ],
)

export const metaSnapshotRecipeInputs = sqliteTable(
  'snapshotRecipeInputs',
  {
    snapshotRecipeId: snapshotRecipeIdColumn('cascade'),
    datasetId: datasetIdColumn(),
    role: text('role').notNull(),
    isRequired: integer('isRequired', { mode: 'boolean' }).notNull(),
    anchorDatasetId: text('anchorDatasetId').references(() => metaDatasets.id, {
      onDelete: 'restrict',
    }),
    maxLagDays: integer('maxLagDays'),
    priority: integer('priority').notNull().default(0),
    selectionPolicyJson:
      jsonText<SnapshotSelectionPolicy>('selectionPolicyJson').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.snapshotRecipeId, table.datasetId, table.role],
    }),
  ],
)

export const metaSnapshotAssemblies = sqliteTable(
  'snapshotAssemblies',
  {
    id: primaryUuid('id'),
    snapshotId: snapshotIdColumn('cascade'),
    snapshotRecipeId: snapshotRecipeIdColumn('restrict'),
    anchorReleaseId: text('anchorReleaseId'),
    anchorCohortKey: text('anchorCohortKey'),
    status: text('status').notNull(),
    reviewRequired: integer('reviewRequired'),
    detailsJson: jsonText<SnapshotAssemblyDetails>('detailsJson'),
    ...timestamps,
  },
  table => [uniqueIndex('snapshotAssemblies_snapshotId_idx').on(table.snapshotId)],
)

export const metaApiComposition = sqliteTable(
  'apiComposition',
  {
    id: primaryUuid('id'),
    apiVersionId: apiVersionIdColumn('cascade'),
    code: text('code').notNull().unique(),
    version: integer('version').notNull(),
    primaryResourceType: text('primaryResourceType', {
      enum: datasetTypes,
    }).notNull(),
    defaultDomainCode: text('defaultDomainCode'),
    status: text('status').notNull(),
    notes: text('notes'),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('apiComposition_apiVersionId_version_unique_idx').on(
      table.apiVersionId,
      table.version,
    ),
  ],
)

export const metaApiCompositionMembers = sqliteTable(
  'apiCompositionMembers',
  {
    apiCompositionId: apiCompositionIdColumn(),
    i18n: jsonText<MetaTranslations>('i18n').notNull().default({}),
    domainCode: text('domainCode').notNull().default('default'),
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
    variant: text('variant').notNull().default('default'),
    role: text('role').notNull(),
    isRequired: integer('isRequired', { mode: 'boolean' }).notNull(),
    cohortMatchingMode: text('cohortMatchingMode').notNull(),
    anchorResourceType: text('anchorResourceType', {
      enum: datasetTypes,
    }),
    maxLagDays: integer('maxLagDays'),
    priority: integer('priority').notNull().default(0),
  },
  table => [
    primaryKey({
      columns: [
        table.apiCompositionId,
        table.domainCode,
        table.resourceType,
        table.variant,
      ],
    }),
  ],
)

export const metaApiReleaseSetSnapshots = sqliteTable(
  'apiReleaseSetSnapshots',
  {
    apiReleaseSetId: apiReleaseSetIdColumn(),
    snapshotId: snapshotIdColumn('restrict'),
    variant: text('variant').notNull().default('default'),
    role: text('role').notNull(),
    isRequired: integer('isRequired', { mode: 'boolean' }).notNull(),
    cohortMatchingMode: text('cohortMatchingMode').notNull(),
    anchorSnapshotId: text('anchorSnapshotId').references(() => metaSnapshots.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({
      columns: [table.apiReleaseSetId, table.snapshotId, table.variant],
    }),
    index('apiReleaseSetSnapshots_snapshotId_idx').on(table.snapshotId),
  ],
)

export const metaApiCatalogRevisionReleaseSets = sqliteTable(
  'apiCatalogRevisionReleaseSets',
  {
    apiCatalogRevisionId: apiCatalogRevisionIdColumn(),
    apiVersionReleaseSetId: apiVersionReleaseSetIdColumn(),
    domainCode: text('domainCode').notNull(),
    cohortKey: text('cohortKey').notNull(),
    isDefault: integer('isDefault', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({
      columns: [table.apiCatalogRevisionId, table.domainCode, table.cohortKey],
    }),
    uniqueIndex('apiCatalogRevisionReleaseSets_release_unique_idx').on(
      table.apiCatalogRevisionId,
      table.apiVersionReleaseSetId,
    ),
    index('apiCatalogRevisionReleaseSets_release_idx').on(table.apiVersionReleaseSetId),
  ],
)

export const metaApiEndpoints = sqliteTable(
  'apiEndpoints',
  {
    id: primaryUuid('id'),
    apiVersionId: apiVersionIdColumn('restrict'),
    method: text('method', { enum: apiEndpointMethods }).notNull(),
    path: text('path').notNull(),
    operationId: text('operationId').notNull().unique(),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('apiEndpoints_apiVersion_method_path_unique_idx').on(
      table.apiVersionId,
      table.method,
      table.path,
    ),
  ],
)

/** Content-addressed general lineage, shared by every release using the same rules. */
export const metaFieldLineageDefinitions = sqliteTable('fieldLineageDefinitions', {
  id: text('id').primaryKey(),
  definition:
    jsonText<import('../../fieldLineage').FieldLineageDefinition>(
      'definition',
    ).notNull(),
})

/** One root pin per API release; snapshots already pin concrete source inputs. */
export const metaApiFieldProvenance = sqliteTable('apiFieldProvenance', {
  apiReleaseSetId: apiReleaseSetIdColumn().primaryKey(),
  definitionId: text('definitionId')
    .notNull()
    .references(() => metaFieldLineageDefinitions.id, { onDelete: 'restrict' }),
})
