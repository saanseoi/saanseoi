import { and, desc, eq } from 'drizzle-orm'

import { metaApiReleaseSets, metaApiVersions, metaDataShards } from './schema/meta'
import type { DataShardType } from './constants/schema'
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
      schemaVersion: metaApiReleaseSets.schemaVersion,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
      publishedAt: metaApiReleaseSets.publishedAt,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(
      and(
        eq(metaApiVersions.code, apiVersionCode),
        eq(metaApiReleaseSets.status, 'current'),
      ),
    )
    .orderBy(desc(metaApiReleaseSets.publishedAt), desc(metaApiReleaseSets.createdAt))
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
  shardType?: DataShardType,
) {
  const rows = await db
    .select()
    .from(metaDataShards)
    .where(
      shardType
        ? and(
            eq(metaDataShards.bindingName, bindingName),
            eq(metaDataShards.shardType, shardType),
          )
        : eq(metaDataShards.bindingName, bindingName),
    )
    .limit(1)

  return rows[0] ?? null
}
