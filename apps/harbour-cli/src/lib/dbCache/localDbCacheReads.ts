import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { eq, metaSchema, or, type MetaDatabase } from '@repo/db'
import { publicationScopeId } from '@repo/core/pipeline/services/publication/scope'
import type { UploadTarget } from '../cli/options.ts'
import {
  mapLocalTargetPaths,
  requirePath,
  resolveD1Targets,
  resolveRemoteCacheDir,
} from './localDbCacheTargets.ts'
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

/** Publication metadata alone does not prove that an initialiser can skip delivery. */
export async function readLocalCompletedReleaseCodes() {
  const files = mapLocalTargetPaths(
    (await resolveD1Targets('local')).filter(target =>
      ['DB_META', 'DB_CURRENT'].includes(target.bindingName),
    ),
  )
  const metaPath = requirePath(files.DB_META, 'DB_META')
  const meta = new SQLiteDatabase(metaPath, { readonly: true })
  try {
    return await listCompletedReleaseCodes(dirname(metaPath), files, meta)
  } finally {
    meta.close()
  }
}

export async function listCompletedReleaseCodes(
  cacheDir: string,
  files: Record<string, string>,
  meta: SQLiteDatabase,
) {
  const releases = meta
    .query<CompletedRelease, []>(
      "SELECT code, datasetId, id, status, resourceType FROM releases WHERE status IN ('published', 'superseded') ORDER BY code",
    )
    .all()
  const incomplete = await findIncompletePublishedReleases(
    cacheDir,
    files,
    meta,
    releases,
  )
  return releases
    .filter(release => !incomplete.some(issue => issue.startsWith(`${release.code}: `)))
    .map(release => release.code)
}

type CompletedRelease = {
  code: string
  datasetId: string
  id: string
  status: string
  resourceType: string
}

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
        resourceType: metaSchema.metaReleases.resourceType,
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

export async function findIncompletePublishedReleases(
  cacheDir: string,
  files: Record<string, string>,
  metaSqlite: SQLiteDatabase,
  releases: CompletedRelease[],
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

      const receiptTable = resolveCompletedReleaseReceiptTable(release.resourceType)

      // Non-SQL pipelines have no cache-level materialisation contract here.
      if (!receiptTable) {
        continue
      }

      const snapshot = metaSqlite
        .query(
          `
            SELECT s.id AS snapshotId, s.snapshotLineageId AS snapshotLineageId, s.cohortKey AS cohortKey
            FROM snapshots s
            INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
            LEFT JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
            WHERE ss.resourceReleaseId = ?
              AND ss.datasetId = ?
              AND s.resourceType = ?
              AND (
                (s.status = 'published' AND (
                  s.snapshotLineageId IS NULL
                  OR (sl.resourceType = ? AND sl.primaryDatasetId = ?)
                ))
                OR (
                  s.status IN ('draft', 'published')
                  AND s.resourceType IN ('divisionArea', 'divisionBoundary')
                  AND sl.resourceType = s.resourceType
                  AND ss.selectionMode IN ('contributed_geometry', 'verified_identical_geometry')
                  AND ss.selectedByRule = 'snapshot-assembly-division-geometry-v1'
                  AND ss.anchorReleaseId = ss.resourceReleaseId
                )
              )
            ORDER BY s.revision DESC
            LIMIT 1
          `,
        )
        .get(
          release.id,
          release.datasetId,
          release.resourceType,
          release.resourceType,
          release.datasetId,
        ) as {
        snapshotId: string
        snapshotLineageId: string
        cohortKey: string
      } | null

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
        const receipt = currentSqlite
          .query(
            `SELECT 1 FROM ${quoteSqlIdentifier(receiptTable)}
             WHERE snapshotId = ? AND scopeId = ?
               AND preparedAt IS NOT NULL AND publicationToken <> ''
               AND status IN ('publishing', 'current')`,
          )
          .get(
            snapshot.snapshotId,
            publicationScopeId(
              release.resourceType,
              snapshot.snapshotLineageId,
              snapshot.cohortKey,
            ),
          )
        if (!receipt) {
          incomplete.push(
            `${release.code}: current snapshot has no complete delivery receipt`,
          )
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

function resolveCompletedReleaseReceiptTable(resourceType: string) {
  switch (resourceType) {
    case 'division':
      return 'divisionPublicationState'
    case 'divisionArea':
      return 'divisionAreaPublicationState'
    case 'divisionBoundary':
      return 'divisionBoundaryPublicationState'
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
