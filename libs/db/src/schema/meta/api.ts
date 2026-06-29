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
  provenanceContributionTypes,
  resolverCodes,
  snapshotResourceTypes,
  snapshotStatuses,
} from '../../constants/schema'
import { jsonText, primaryUuid, timestamps } from './_shared'
import { metaDatasets, metaReleases } from './datasets'

export const metaApiVersions = sqliteTable('apiVersions', {
  id: primaryUuid('id'),
  code: text('code').notNull().unique(),
  familyType: text('familyType', { enum: apiFamilyTypes }).notNull(),
  version: text('version').notNull(),
  status: text('status', { enum: apiVersionStatuses }).notNull(),
  publishedAt: integer('publishedAt', { mode: 'timestamp_ms' }),
  deprecatedAt: integer('deprecatedAt', { mode: 'timestamp_ms' }),
  retiredAt: integer('retiredAt', { mode: 'timestamp_ms' }),
  versionHash: text('versionHash').notNull(),
  ...timestamps,
})

export const metaSnapshots = sqliteTable(
  'snapshots',
  {
    id: primaryUuid('id'),
    resourceType: text('resourceType', { enum: snapshotResourceTypes }).notNull(),
    code: text('code').notNull(),
    cohortKey: text('cohortKey').notNull(),
    status: text('status', { enum: snapshotStatuses }).notNull(),
    publishedAt: integer('publishedAt', { mode: 'timestamp_ms' }),
    validFrom: integer('validFrom', { mode: 'timestamp_ms' }),
    validTo: integer('validTo', { mode: 'timestamp_ms' }),
    notes: text('notes'),
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
  ],
)

export const metaSnapshotSources = sqliteTable(
  'snapshotSources',
  {
    snapshotId: text('snapshotId')
      .notNull()
      .references(() => metaSnapshots.id, { onDelete: 'cascade' }),
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'restrict' }),
    sourceReleaseId: text('sourceReleaseId').notNull(),
    role: text('role', { enum: apiReleaseSetSourceRoles }).notNull(),
    selectedByRule: text('selectedByRule'),
    selectionMode: text('selectionMode'),
    anchorReleaseId: text('anchorReleaseId'),
    sourceCohortKey: text('sourceCohortKey'),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.sourceReleaseId],
    }),
    foreignKey({
      columns: [table.sourceReleaseId, table.datasetId],
      foreignColumns: [metaReleases.id, metaReleases.datasetId],
      name: 'snapshotSources_sourceReleaseId_datasetId_releases_id_datasetId_fk',
    }).onDelete('restrict'),
    index('snapshotSources_datasetId_idx').on(table.datasetId),
    index('snapshotSources_sourceReleaseId_idx').on(table.sourceReleaseId),
  ],
)

export const metaApiReleaseSets = sqliteTable(
  'apiReleaseSets',
  {
    id: primaryUuid('id'),
    apiVersionId: text('apiVersionId')
      .notNull()
      .references(() => metaApiVersions.id, { onDelete: 'restrict' }),
    // This is the snapshot-version code shared with the canonical snapshot.
    code: text('code').notNull(),
    schemaVersion: text('schemaVersion').notNull(),
    rulesetVersion: text('rulesetVersion').notNull(),
    status: text('status', { enum: apiReleaseSetStatuses }).notNull(),
    publishedAt: integer('publishedAt', { mode: 'timestamp_ms' }),
    validFrom: integer('validFrom', { mode: 'timestamp_ms' }),
    validTo: integer('validTo', { mode: 'timestamp_ms' }),
    notes: text('notes'),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('apiReleaseSets_apiVersionId_code_unique_idx').on(
      table.apiVersionId,
      table.code,
    ),
    index('apiReleaseSets_status_idx').on(table.status),
  ],
)

export const metaSnapshotAssembly = sqliteTable(
  'snapshotAssembly',
  {
    id: primaryUuid('id'),
    code: text('code').notNull().unique(),
    resourceType: text('resourceType', { enum: snapshotResourceTypes }).notNull(),
    version: integer('version').notNull(),
    status: text('status').notNull(),
    notes: text('notes'),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    index('snapshotAssembly_resourceType_status_idx').on(
      table.resourceType,
      table.status,
    ),
  ],
)

export const metaSnapshotAssemblySources = sqliteTable(
  'snapshotAssemblySources',
  {
    snapshotAssemblyId: text('snapshotAssemblyId')
      .notNull()
      .references(() => metaSnapshotAssembly.id, { onDelete: 'cascade' }),
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    isRequired: integer('isRequired', { mode: 'boolean' }).notNull(),
    selectorType: text('selectorType').notNull(),
    anchorDatasetId: text('anchorDatasetId').references(() => metaDatasets.id, {
      onDelete: 'restrict',
    }),
    maxLagDays: integer('maxLagDays'),
    priority: integer('priority').notNull().default(0),
    configJson: jsonText('configJson'),
  },
  table => [
    primaryKey({
      columns: [table.snapshotAssemblyId, table.datasetId, table.role],
    }),
  ],
)

export const metaSnapshotAssemblyRuns = sqliteTable(
  'snapshotAssemblyRuns',
  {
    id: primaryUuid('id'),
    snapshotId: text('snapshotId')
      .notNull()
      .references(() => metaSnapshots.id, { onDelete: 'cascade' }),
    snapshotAssemblyId: text('snapshotAssemblyId')
      .notNull()
      .references(() => metaSnapshotAssembly.id, { onDelete: 'restrict' }),
    anchorReleaseId: text('anchorReleaseId'),
    anchorCohortKey: text('anchorCohortKey'),
    status: text('status').notNull(),
    selectionSummaryJson: jsonText('selectionSummaryJson'),
    ...timestamps,
  },
  table => [index('snapshotAssemblyRuns_snapshotId_idx').on(table.snapshotId)],
)

export const metaApiComposition = sqliteTable(
  'apiComposition',
  {
    id: primaryUuid('id'),
    apiVersionId: text('apiVersionId')
      .notNull()
      .references(() => metaApiVersions.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    version: integer('version').notNull(),
    primaryResourceType: text('primaryResourceType', {
      enum: snapshotResourceTypes,
    }).notNull(),
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
    apiCompositionId: text('apiCompositionId')
      .notNull()
      .references(() => metaApiComposition.id, { onDelete: 'cascade' }),
    resourceType: text('resourceType', { enum: snapshotResourceTypes }).notNull(),
    role: text('role').notNull(),
    isRequired: integer('isRequired', { mode: 'boolean' }).notNull(),
    selectionMode: text('selectionMode').notNull(),
    anchorResourceType: text('anchorResourceType', {
      enum: snapshotResourceTypes,
    }),
    maxLagDays: integer('maxLagDays'),
    priority: integer('priority').notNull().default(0),
    configJson: jsonText('configJson'),
  },
  table => [
    primaryKey({
      columns: [table.apiCompositionId, table.resourceType],
    }),
  ],
)

export const metaApiReleaseSetSnapshots = sqliteTable(
  'apiReleaseSetSnapshots',
  {
    apiReleaseSetId: text('apiReleaseSetId')
      .notNull()
      .references(() => metaApiReleaseSets.id, { onDelete: 'cascade' }),
    snapshotId: text('snapshotId')
      .notNull()
      .references(() => metaSnapshots.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    isRequired: integer('isRequired', { mode: 'boolean' }).notNull(),
    selectionMode: text('selectionMode').notNull(),
    anchorSnapshotId: text('anchorSnapshotId').references(() => metaSnapshots.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({
      columns: [table.apiReleaseSetId, table.snapshotId],
    }),
    index('apiReleaseSetSnapshots_snapshotId_idx').on(table.snapshotId),
  ],
)

export const metaApiEndpoints = sqliteTable(
  'apiEndpoints',
  {
    id: primaryUuid('id'),
    apiVersionId: text('apiVersionId')
      .notNull()
      .references(() => metaApiVersions.id, { onDelete: 'restrict' }),
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

export const metaApiFieldProvenance = sqliteTable(
  'apiFieldProvenance',
  {
    id: primaryUuid('id'),
    apiReleaseSetId: text('apiReleaseSetId')
      .notNull()
      .references(() => metaApiReleaseSets.id, { onDelete: 'cascade' }),
    apiField: text('apiField').notNull(),
    sourceDatasetId: text('sourceDatasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'restrict' }),
    sourceFieldPath: text('sourceFieldPath').notNull(),
    resolverCode: text('resolverCode', { enum: resolverCodes }).notNull(),
    contributionType: text('contributionType', {
      enum: provenanceContributionTypes,
    }).notNull(),
    priority: integer('priority').notNull().default(0),
    confidence: real('confidence'),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('apiFieldProvenance_release_field_source_unique_idx').on(
      table.apiReleaseSetId,
      table.apiField,
      table.sourceDatasetId,
      table.sourceFieldPath,
      table.contributionType,
      table.priority,
    ),
    index('apiFieldProvenance_release_field_idx').on(
      table.apiReleaseSetId,
      table.apiField,
    ),
  ],
)
