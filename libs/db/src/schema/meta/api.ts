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
  apiEndpointMethods,
  apiEndpointUsageTypes,
  apiReleaseSetMemberRoles,
  apiReleaseSetStatuses,
  apiVersionStatuses,
  datasetTypes,
  provenanceContributionTypes,
  resolverCodes,
} from '../../constants/schema'
import { jsonText, primaryUuid, timestamps } from './_shared'
import { metaDatasets, metaReleases } from './datasets'

export const metaApiVersions = sqliteTable('apiVersions', {
  id: primaryUuid('id'),
  code: text('code').notNull().unique(),
  status: text('status', { enum: apiVersionStatuses }).notNull(),
  ...timestamps,
})

export const metaApiReleaseSets = sqliteTable(
  'apiReleaseSets',
  {
    id: primaryUuid('id'),
    apiVersionId: text('apiVersionId')
      .notNull()
      .references(() => metaApiVersions.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    canonicalSchemaVersion: text('canonicalSchemaVersion').notNull(),
    canonicalLogicVersion: text('canonicalLogicVersion').notNull(),
    status: text('status', { enum: apiReleaseSetStatuses }).notNull(),
    publishedAt: integer('publishedAt', { mode: 'timestamp_ms' }),
    validFrom: integer('validFrom', { mode: 'timestamp_ms' }),
    validTo: integer('validTo', { mode: 'timestamp_ms' }),
    notes: text('notes'),
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

export const metaApiReleaseSetMembers = sqliteTable(
  'apiReleaseSetMembers',
  {
    apiReleaseSetId: text('apiReleaseSetId')
      .notNull()
      .references(() => metaApiReleaseSets.id, { onDelete: 'cascade' }),
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'restrict' }),
    releaseId: text('releaseId').notNull(),
    role: text('role', { enum: apiReleaseSetMemberRoles }).notNull(),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({
      columns: [table.apiReleaseSetId, table.releaseId],
    }),
    foreignKey({
      columns: [table.releaseId, table.datasetId],
      foreignColumns: [metaReleases.id, metaReleases.datasetId],
      name: 'apiReleaseSetMembers_releaseId_datasetId_releases_id_datasetId_fk',
    }).onDelete('restrict'),
    index('apiReleaseSetMembers_datasetId_idx').on(table.datasetId),
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
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
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

export const metaApiEndpointDatasets = sqliteTable(
  'apiEndpointDatasets',
  {
    apiEndpointId: text('apiEndpointId')
      .notNull()
      .references(() => metaApiEndpoints.id, { onDelete: 'cascade' }),
    datasetId: text('datasetId')
      .notNull()
      .references(() => metaDatasets.id, { onDelete: 'restrict' }),
    usageType: text('usageType', { enum: apiEndpointUsageTypes }).notNull(),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({
      columns: [table.apiEndpointId, table.datasetId],
    }),
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
    sourceIdentifierPaths: jsonText('sourceIdentifierPaths'),
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
