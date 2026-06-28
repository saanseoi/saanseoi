import {
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

import {
  dataShardEnvironments,
  dataShardStatuses,
  dataShardTypes,
} from '../../constants/schema'
import { primaryUuid, timestamps } from './_shared'
import { metaApiReleaseSets } from './api'
import { metaReleases } from './datasets'

export const metaDataShards = sqliteTable(
  'dataShards',
  {
    id: primaryUuid('id'),
    shardType: text('shardType', { enum: dataShardTypes }).notNull(),
    regionCode: text('regionCode'),
    year: text('year'),
    environment: text('environment', { enum: dataShardEnvironments }).notNull(),
    databaseName: text('databaseName').notNull(),
    databaseId: text('databaseId').notNull(),
    bindingName: text('bindingName').notNull().unique(),
    status: text('status', { enum: dataShardStatuses }).notNull(),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex('dataShards_shardType_region_year_env_unique_idx').on(
      table.shardType,
      table.regionCode,
      table.year,
      table.environment,
    ),
    uniqueIndex('dataShards_shardType_env_unscoped_unique_idx')
      .on(table.shardType, table.environment)
      .where(sql`${table.regionCode} is null and ${table.year} is null`),
    uniqueIndex('dataShards_shardType_region_env_unique_idx')
      .on(table.shardType, table.regionCode, table.environment)
      .where(sql`${table.regionCode} is not null and ${table.year} is null`),
    uniqueIndex('dataShards_shardType_year_env_unique_idx')
      .on(table.shardType, table.year, table.environment)
      .where(sql`${table.regionCode} is null and ${table.year} is not null`),
    uniqueIndex('dataShards_shardType_region_year_env_scoped_unique_idx')
      .on(table.shardType, table.regionCode, table.year, table.environment)
      .where(sql`${table.regionCode} is not null and ${table.year} is not null`),
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
  },
  table => [
    primaryKey({
      columns: [table.apiReleaseSetId, table.dataShardId],
    }),
    index('releaseSetShardAssignments_dataShardId_idx').on(table.dataShardId),
  ],
)
