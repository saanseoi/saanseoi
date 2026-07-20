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
  resolverCodes,
  snapshotStatuses,
} from '../../constants/schema'
import { isoTimestamp, jsonText, primaryUuid, timestamps } from '../shared'
import { metaDatasets, metaReleases } from './datasets'

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

const snapshotAssemblyIdColumn = (onDelete: ReferenceAction) =>
  text('snapshotAssemblyId')
    .notNull()
    .references(() => metaSnapshotAssembly.id, { onDelete })

const apiCompositionIdColumn = () =>
  text('apiCompositionId')
    .notNull()
    .references(() => metaApiComposition.id, { onDelete: 'cascade' })

const apiReleaseSetIdColumn = () =>
  text('apiReleaseSetId')
    .notNull()
    .references(() => metaApiReleaseSets.id, { onDelete: 'cascade' })

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
    publishedAt: isoTimestamp('publishedAt'),
    deprecatedAt: isoTimestamp('deprecatedAt'),
    retiredAt: isoTimestamp('retiredAt'),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    index('apiVersions_familyType_status_idx').on(table.familyType, table.status),
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
    uniqueIndex('snapshotLineages_primaryDataset_unique_idx').on(
      table.primaryDatasetId,
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
    revision: integer('revision').notNull().default(0),
    status: text('status', { enum: snapshotStatuses }).notNull(),
    publishedAt: isoTimestamp('publishedAt'),
    validFrom: isoTimestamp('validFrom'),
    validTo: isoTimestamp('validTo'),
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
    uniqueIndex('snapshots_lineage_cohort_revision_unique_idx').on(
      table.snapshotLineageId,
      table.cohortKey,
      table.revision,
    ),
    index('snapshots_parentSnapshotId_idx').on(table.parentSnapshotId),
  ],
)

export const metaSnapshotSources = sqliteTable(
  'snapshotSources',
  {
    snapshotId: snapshotIdColumn('cascade'),
    datasetId: datasetIdColumn(),
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
    apiVersionId: apiVersionIdColumn('restrict'),
    apiCompositionId: text('apiCompositionId').references(() => metaApiComposition.id, {
      onDelete: 'restrict',
    }),
    // Immutable domain/cohort composition code; its trailing `r` segment is
    // the composition revision for this effective cohort.
    code: text('code').notNull(),
    regionCode: text('regionCode'),
    domainCode: text('domainCode').notNull().default('default'),
    cohortKey: text('cohortKey'),
    revision: integer('revision').notNull().default(0),
    effectiveFrom: isoTimestamp('effectiveFrom'),
    effectiveTo: isoTimestamp('effectiveTo'),
    supersedesApiReleaseSetId: text('supersedesApiReleaseSetId'),
    schemaVersion: text('schemaVersion').notNull(),
    rulesetVersion: text('rulesetVersion').notNull(),
    status: text('status', { enum: apiReleaseSetStatuses }).notNull(),
    publishedAt: isoTimestamp('publishedAt'),
    validFrom: isoTimestamp('validFrom'),
    validTo: isoTimestamp('validTo'),
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
    uniqueIndex('apiReleaseSets_domain_cohort_revision_unique_idx').on(
      table.apiVersionId,
      table.regionCode,
      table.domainCode,
      table.cohortKey,
      table.revision,
    ),
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
    publishedAt: isoTimestamp('publishedAt').notNull(),
    versionHash: text('versionHash').notNull(),
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

export const metaPublishedDataJournal = sqliteTable(
  'publishedDataJournal',
  {
    id: primaryUuid('id'),
    releaseId: text('releaseId')
      .notNull()
      .references(() => metaReleases.id, { onDelete: 'restrict' }),
    relatedReleaseId: text('relatedReleaseId').references(() => metaReleases.id, {
      onDelete: 'set null',
    }),
    snapshotId: text('snapshotId').references(() => metaSnapshots.id, {
      onDelete: 'set null',
    }),
    apiReleaseSetId: text('apiReleaseSetId').references(() => metaApiReleaseSets.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    statusFrom: text('statusFrom'),
    statusTo: text('statusTo'),
    reason: text('reason'),
    metadataJson: jsonText('metadataJson'),
    createdAt: timestamps.createdAt,
  },
  table => [
    index('publishedDataJournal_releaseId_idx').on(table.releaseId),
    index('publishedDataJournal_relatedReleaseId_idx').on(table.relatedReleaseId),
    index('publishedDataJournal_action_idx').on(table.action),
  ],
)

export const metaSnapshotAssembly = sqliteTable(
  'snapshotAssembly',
  {
    id: primaryUuid('id'),
    code: text('code').notNull().unique(),
    resourceType: text('resourceType', { enum: datasetTypes }).notNull(),
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
    snapshotAssemblyId: snapshotAssemblyIdColumn('cascade'),
    datasetId: datasetIdColumn(),
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
    snapshotId: snapshotIdColumn('cascade'),
    snapshotAssemblyId: snapshotAssemblyIdColumn('restrict'),
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
    configJson: jsonText('configJson'),
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
    apiReleaseSetId: apiReleaseSetIdColumn(),
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
      table.apiReleaseSetId,
    ),
    index('apiCatalogRevisionReleaseSets_release_idx').on(table.apiReleaseSetId),
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

export const metaApiFieldProvenance = sqliteTable(
  'apiFieldProvenance',
  {
    id: primaryUuid('id'),
    apiReleaseSetId: apiReleaseSetIdColumn(),
    apiField: text('apiField').notNull(),
    variant: text('variant'),
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
      table.variant,
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
