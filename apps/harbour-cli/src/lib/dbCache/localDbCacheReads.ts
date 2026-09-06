import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { eq, metaSchema, or, type MetaDatabase } from '@repo/db'
import type { UploadTarget } from '../cli/options.ts'
import { resolveRemoteCacheDir } from './localDbCacheTargets.ts'
import {
  DB_CACHE_MANIFEST_VERSION,
  REQUIRED_RELEASE_SHARD_ASSIGNMENTS,
} from './localDbCacheConfig.ts'
import type { DbCacheManifest, OpenSqliteDb } from './localDbCacheTypes.ts'
import {
  isNonEmptyString,
  isValidCachedFile,
  readInvalidatedManifest,
  readManifest,
} from './localDbCacheManifest.ts'
import { openSqliteDb } from './localDbCache.ts'

export async function readRemoteCachedCompletedReleaseCodes(
  target: UploadTarget,
  options: { allowPartialCache?: boolean } = {},
) {
  if (!target.remote) {
    throw new Error(
      'Completed remote releases can only be read for preview or production.',
    )
  }

  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const cacheDir = resolveRemoteCacheDir(targetName)
  return withRemoteCachedMetaDb(target, async (metaDb, metaSqlite, manifest) => {
    const rows = await metaDb
      .select({
        code: metaSchema.metaReleases.code,
        datasetId: metaSchema.metaReleases.datasetId,
        id: metaSchema.metaReleases.id,
        status: metaSchema.metaReleases.status,
        type: metaSchema.metaReleases.resourceType,
      })
      .from(metaSchema.metaReleases)
      .where(
        or(
          eq(metaSchema.metaReleases.status, 'published'),
          eq(metaSchema.metaReleases.status, 'superseded'),
        ),
      )
      .all()

    if (!options.allowPartialCache) {
      const incompleteReleases = await findIncompletePublishedReleases(
        cacheDir,
        manifest.files,
        metaSqlite,
        rows,
      )

      if (incompleteReleases.length > 0) {
        throw new Error(
          [
            `The ${targetName} cache contains published releases that are not safe to skip.`,
            ...incompleteReleases.map(release => `- ${release}`),
            'Reset or repair the target before continuing; published releases are never silently reprocessed.',
          ].join('\n'),
        )
      }
    }

    return rows.map(row => row.code)
  })
}

async function findIncompletePublishedReleases(
  cacheDir: string,
  files: Record<string, string>,
  metaSqlite: SQLiteDatabase,
  releases: Array<{
    code: string
    datasetId: string
    id: string
    status: string
    type: string
  }>,
) {
  const currentPath = files.DB_CURRENT ?? resolve(cacheDir, 'DB_CURRENT.sqlite')
  const currentSqlite = existsSync(currentPath)
    ? new SQLiteDatabase(currentPath, { readonly: true })
    : null
  const incomplete: string[] = []

  try {
    for (const release of releases) {
      if (release.status === 'superseded') {
        continue
      }

      const currentTable = resolveCompletedReleaseCurrentTable(release.type)

      // Non-SQL pipelines have no cache-level materialisation contract here.
      if (!currentTable) {
        continue
      }

      const snapshot = metaSqlite
        .query(
          `
            SELECT s.id AS snapshotId, s.snapshotLineageId AS snapshotLineageId
            FROM snapshots s
            INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
            LEFT JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
            WHERE ss.sourceReleaseId = ?
              AND ss.datasetId = ?
              AND s.resourceType = ?
              AND s.status = 'published'
              AND (
                s.snapshotLineageId IS NULL
                OR (sl.resourceType = ? AND sl.primaryDatasetId = ?)
              )
            ORDER BY s.revision DESC
            LIMIT 1
          `,
        )
        .get(
          release.id,
          release.datasetId,
          release.type,
          release.type,
          release.datasetId,
        ) as { snapshotId?: string; snapshotLineageId?: string | null } | null

      if (!snapshot?.snapshotId) {
        incomplete.push(
          `${release.code}: missing published snapshot lineage/source membership`,
        )
        continue
      }

      const releaseShardCount = metaSqlite
        .query(
          'SELECT COUNT(*) AS count FROM releaseShardAssignments WHERE releaseId = ?',
        )
        .get(release.id) as { count?: number }
      const snapshotShardCount = metaSqlite
        .query(
          'SELECT COUNT(*) AS count FROM snapshotShardAssignments WHERE snapshotId = ?',
        )
        .get(snapshot.snapshotId) as { count?: number }

      if (
        (releaseShardCount.count ?? 0) < REQUIRED_RELEASE_SHARD_ASSIGNMENTS ||
        (snapshot.snapshotLineageId && (snapshotShardCount.count ?? 0) < 1)
      ) {
        incomplete.push(`${release.code}: missing release or snapshot shard assignment`)
        continue
      }

      if (!currentSqlite) {
        incomplete.push(`${release.code}: DB_CURRENT cache file is missing`)
        continue
      }

      try {
        const rowCount = currentSqlite
          .query(
            `SELECT COUNT(*) AS count FROM ${quoteSqlIdentifier(currentTable)} WHERE "snapshotId" = ?`,
          )
          .get(snapshot.snapshotId) as { count?: number }
        if ((rowCount.count ?? 0) === 0) {
          incomplete.push(`${release.code}: current snapshot is not materialised`)
        }
      } catch (error) {
        incomplete.push(
          `${release.code}: could not verify current materialisation (${error instanceof Error ? error.message : String(error)})`,
        )
      }
    }
  } finally {
    currentSqlite?.close()
  }

  return incomplete
}

function resolveCompletedReleaseCurrentTable(type: string) {
  switch (type) {
    case 'division':
      return 'divisions'
    case 'divisionArea':
      return 'divisionAreas'
    case 'divisionBoundary':
      return 'divisionBoundaries'
    default:
      return null
  }
}

export function quoteSqlIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

/**
 * Reads the metadata mirror without contacting remote D1. Remote upload
 * planning and post-publish checks use this so they observe the exact cache
 * that was used to prepare the release, rather than requiring Wrangler's
 * separate Cloudflare API credentials.
 */
export async function withRemoteCachedMetaDb<T>(
  target: UploadTarget,
  work: (
    db: MetaDatabase,
    sqlite: SQLiteDatabase,
    manifest: DbCacheManifest,
  ) => Promise<T> | T,
): Promise<T> {
  if (!target.remote) {
    throw new Error('The remote metadata cache is only available for remote targets.')
  }

  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const cacheDir = resolveRemoteCacheDir(targetName)
  const invalidated = await readInvalidatedManifest(join(cacheDir, 'invalidated.json'))

  if (invalidated) {
    throw new Error(
      [
        `The persistent ${targetName} D1 cache was invalidated at ${invalidated.invalidatedAt}.`,
        invalidated.reason ? `Reason: ${invalidated.reason}` : null,
        `Rebuild it explicitly with bin/saanseoi cache:rebuild --target ${targetName}.`,
      ]
        .filter(isNonEmptyString)
        .join(' '),
    )
  }

  const manifest = await readManifest(join(cacheDir, 'manifest.json'))
  const metaPath = manifest?.files.DB_META

  if (
    !manifest ||
    manifest.cacheVersion !== DB_CACHE_MANIFEST_VERSION ||
    manifest.target !== targetName ||
    !metaPath ||
    !(await isValidCachedFile(metaPath, 'DB_META'))
  ) {
    throw new Error(
      [
        `No valid ${targetName} metadata cache is available for this operation.`,
        `Rebuild it explicitly with bin/saanseoi cache:rebuild --target ${targetName}.`,
      ].join(' '),
    )
  }

  const meta = (await openSqliteDb(
    metaPath,
    metaSchema,
    'DB_META',
  )) as unknown as OpenSqliteDb<MetaDatabase>

  try {
    return await work(meta.db, meta.sqlite, manifest)
  } finally {
    meta.sqlite.close()
  }
}
