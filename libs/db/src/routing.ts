import { and, desc, eq } from 'drizzle-orm'

import {
  metaApiReleaseSets,
  metaApiVersions,
  metaDataShards,
  metaReleaseSetShardAssignments,
} from './schema/meta'
import type { DataShardEnvironment, DataShardKind } from './constants/schema'
import type { MetaDatabase } from './client'

/**
 * Resolves the latest active release set for a specific API version code.
 *
 * This is the control-plane lookup used before routing live API traffic into
 * `current` or `history` shards.
 */
export async function resolveActiveApiReleaseSet(
  db: MetaDatabase,
  apiVersionCode: string,
) {
  const rows = await db
    .select({
      apiReleaseSetId: metaApiReleaseSets.id,
      code: metaApiReleaseSets.code,
      canonicalSchemaVersion: metaApiReleaseSets.canonicalSchemaVersion,
      canonicalLogicVersion: metaApiReleaseSets.canonicalLogicVersion,
      publishedAt: metaApiReleaseSets.publishedAt,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(
      and(
        eq(metaApiVersions.code, apiVersionCode),
        eq(metaApiReleaseSets.status, 'active'),
      ),
    )
    .orderBy(desc(metaApiReleaseSets.publishedAt), desc(metaApiReleaseSets.createdAt))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Resolves the active shard assignment for a release set in a specific shard
 * family and deployment environment.
 *
 * `current` and `history` are routed per release set so canonical builders and
 * API reads can target the correct D1 database from meta state.
 */
export async function resolveShardForReleaseSet(
  db: MetaDatabase,
  apiReleaseSetId: string,
  kind: Extract<DataShardKind, 'history' | 'current'>,
  environment: DataShardEnvironment,
) {
  const rows = await db
    .select({
      dataShardId: metaDataShards.id,
      bindingName: metaDataShards.bindingName,
      databaseName: metaDataShards.databaseName,
      databaseId: metaDataShards.databaseId,
      regionCode: metaDataShards.regionCode,
      year: metaDataShards.year,
    })
    .from(metaReleaseSetShardAssignments)
    .innerJoin(
      metaDataShards,
      eq(metaReleaseSetShardAssignments.dataShardId, metaDataShards.id),
    )
    .where(
      and(
        eq(metaReleaseSetShardAssignments.apiReleaseSetId, apiReleaseSetId),
        eq(metaDataShards.kind, kind),
        eq(metaDataShards.environment, environment),
        eq(metaDataShards.status, 'active'),
      ),
    )
    .limit(1)

  return rows[0] ?? null
}

/**
 * Resolves a provisioned shard directly by binding name.
 *
 * This is primarily a fallback/helper lookup for code paths that already know
 * the Worker binding and need the corresponding shard metadata row.
 */
export async function resolveShardByBindingName(
  db: MetaDatabase,
  bindingName: string,
  kind?: DataShardKind,
) {
  const rows = await db
    .select()
    .from(metaDataShards)
    .where(
      kind
        ? and(
            eq(metaDataShards.bindingName, bindingName),
            eq(metaDataShards.kind, kind),
          )
        : eq(metaDataShards.bindingName, bindingName),
    )
    .limit(1)

  return rows[0] ?? null
}
