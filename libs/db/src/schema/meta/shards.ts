import {
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

import {
  dataShardEnvironments,
  dataShardKinds,
  dataShardStatuses,
} from '../../constants/schema'
import { primaryUuid, timestamps } from './_shared'
import { metaApiReleaseSets } from './api'
import { metaReleases } from './datasets'

export const metaDataShards = sqliteTable(
  'dataShards',
  {
    id: primaryUuid('id'),
    kind: text('kind', { enum: dataShardKinds }).notNull(),
    regionCode: text('regionCode'),
    year: text('year'),
    environment: text('environment', { enum: dataShardEnvironments }).notNull(),
    databaseName: text('databaseName').notNull(),
    databaseId: text('databaseId').notNull(),
    bindingName: text('bindingName').notNull().unique(),
    status: text('status', { enum: dataShardStatuses }).notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('dataShards_kind_region_year_env_unique_idx').on(
      table.kind,
      table.regionCode,
      table.year,
      table.environment,
    ),
  ],
)

export const metaReleaseShardAssignments = sqliteTable(
  'releaseShardAssignments',
  {
    releaseId: text('releaseId')
      .notNull()
      .references(() => metaReleases.id, { onDelete: 'cascade' }),
    dataShardId: text('dataShardId')
      .notNull()
      .references(() => metaDataShards.id, { onDelete: 'restrict' }),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({
      columns: [table.releaseId, table.dataShardId],
    }),
  ],
)

export const metaReleaseSetShardAssignments = sqliteTable(
  'releaseSetShardAssignments',
  {
    apiReleaseSetId: text('apiReleaseSetId')
      .notNull()
      .references(() => metaApiReleaseSets.id, { onDelete: 'cascade' }),
    dataShardId: text('dataShardId')
      .notNull()
      .references(() => metaDataShards.id, { onDelete: 'restrict' }),
    createdAt: timestamps.createdAt,
  },
  table => [
    primaryKey({
      columns: [table.apiReleaseSetId, table.dataShardId],
    }),
    index('releaseSetShardAssignments_dataShardId_idx').on(table.dataShardId),
  ],
)
