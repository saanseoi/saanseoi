import { Database } from 'bun:sqlite'

import { and, currentSchema, desc, eq, historySchema, metaSchema, sql } from '@repo/db'
import { resolvePublishedSnapshotForResourceTypeRegionCohortKey } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceReleaseStatsDimension } from '@repo/core/pipeline/db/stats'
import { decompressJsonBrotli } from '@repo/core/pipeline/services/brotliJson'
import { parseWkbGeometry } from '@repo/core/pipeline/services/division'
import {
  calculateDistrictGeometryStatistics,
  selectDistrictRelevantGeometryRecords,
} from '@repo/core/pipeline/services/geometryStats'
import { buildGeometryReleaseStatsRows } from '@repo/core/pipeline/services/stats'
import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'

import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import {
  replayRemoteCacheWithRetry,
  resolveLocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import { executeSqlText } from '../localPipeline/sqlImport.ts'

type GeometryResourceType = 'divisionArea' | 'divisionBoundary'
type BackfillRelease = {
  code: string
  datasetCode: string
  id: string
  regionCode: string
  resourceType: GeometryResourceType
  sourceVariant: string
  sourceVersion: string
}

export async function runGeometryStatsBackfillCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const resourceType =
    typeof args.options['resource-type'] === 'string'
      ? args.options['resource-type']
      : 'all'
  const releaseCodes = splitCsv(args.options.release)
  const datasetCodes = splitCsv(args.options.dataset)
  const dryRun = Boolean(args.options['dry-run'])
  const refreshCache = Boolean(args.options['refresh-cache'])
  const allowed = new Set([
    'target',
    'release',
    'dataset',
    'resource-type',
    'dry-run',
    'refresh-cache',
    'yes',
  ])
  if (
    args.positionals.length > 0 ||
    [...Object.keys(args.options)].some(key => !allowed.has(key)) ||
    (resourceType !== 'all' &&
      resourceType !== 'divisionArea' &&
      resourceType !== 'divisionBoundary')
  ) {
    printUsage()
    throw new Error('Invalid `stats:backfill-geometry` options.')
  }
  if (target.environment === 'production' && !dryRun && !args.options.yes) {
    throw new Error('Production geometry-stat backfill requires explicit `--yes`.')
  }
  // Geometry releases are currently regional. Open the complete history mirror
  // for every represented region, then select each snapshot's assigned shard.
  const seedContext = await resolveLocalAddressDbContext(target, 'HK', '2026', {
    cacheTableProfile: 'divisionGeometry',
    includePreviousShardYears: true,
    requireExistingRemoteCache: target.remote && !refreshCache,
    refreshRemoteCache: refreshCache,
  })
  try {
    const releases = await listGeometryReleases(seedContext.metaDb, {
      datasetCodes,
      releaseCodes,
      resourceType,
    })
    if (releases.some(release => release.regionCode.toUpperCase() !== 'HK')) {
      throw new Error(
        'Geometry-stat backfill found a non-HK release. Run it after adding that region history mirror; this safeguard avoids selecting an arbitrary shard.',
      )
    }
    if (releases.length === 0) {
      console.log('No published geometry releases matched the requested filters.')
      return
    }

    for (const release of releases) {
      const snapshot = await resolveExactSnapshot(seedContext.metaDb, release)
      const shard = await resolveSnapshotShard(seedContext.metaDb, snapshot.id)
      const historyTarget = seedContext.historyTargets.find(
        target => target.bindingName === shard.bindingName,
      )
      if (!historyTarget) {
        throw new Error(
          `Snapshot ${snapshot.id} requires history shard ${shard.bindingName}, which is not in the local cache. Re-run with --refresh-cache.`,
        )
      }
      const districtRows = usesReviewedDistrictBridge(release)
        ? []
        : await findDivisionSnapshotRows(seedContext, release, snapshot.cohortKey)
      const geometryRows = await findSnapshotRows(
        [historyTarget],
        snapshot.id,
        release.resourceType,
      )
      const typedDistrictRows = districtRows as Array<{
        hierarchy: unknown
        id: string
        type: string
      }>
      const typedGeometryRows = selectExactGeometryRows(
        geometryRows as Array<{
          divisionId?: string | null
          geometry: unknown
          id: string
          leftDivisionId?: string | null
          rightDivisionId?: string | null
          variant?: string | null
        }>,
      )
      const districtByDivisionId = new Map<string, string>(
        typedDistrictRows
          .map(row => [row.id, districtIdForDivision(row)] as const)
          .filter(isPair),
      )
      if (usesReviewedDistrictBridge(release)) {
        for (const row of typedGeometryRows) {
          for (const divisionId of [
            row.divisionId,
            row.leftDivisionId,
            row.rightDivisionId,
          ]) {
            if (divisionId && !districtByDivisionId.has(divisionId)) {
              districtByDivisionId.set(divisionId, divisionId)
            }
          }
        }
      }
      const districtGeometry =
        release.datasetCode === 'ds-hk-overture-division-area' ||
        release.datasetCode === 'ds-hk-overture-division-boundary'
          ? selectDistrictRelevantGeometryRecords(
              release.resourceType,
              typedGeometryRows.map(row => ({
                ...row,
                geometry: decodeGeometry(row.geometry),
              })),
              districtByDivisionId,
            )
          : {
              excludedRecordIds: [],
              records: typedGeometryRows.map(row => ({
                ...row,
                geometry: decodeGeometry(row.geometry),
              })),
            }
      const metrics = calculateDistrictGeometryStatistics(
        release.resourceType,
        districtGeometry.records.map(row => ({
          id: row.id,
          geometry: row.geometry,
          divisionId: row.divisionId,
          leftDivisionId: row.leftDivisionId,
          rightDivisionId: row.rightDivisionId,
        })),
        districtByDivisionId,
      )
      const rows = buildGeometryReleaseStatsRows(release.resourceType, metrics)
      const existing = await seedContext.metaDb
        .select({
          dimension: metaSchema.stats.dimension,
          groupValue: metaSchema.stats.groupValue,
          metric: metaSchema.stats.metric,
          metricUnit: metaSchema.stats.metricUnit,
          value: metaSchema.stats.value,
        })
        .from(metaSchema.stats)
        .where(
          and(
            eq(metaSchema.stats.releaseId, release.id),
            eq(metaSchema.stats.dimension, 'geometry'),
          ),
        )
        .all()
      const changed = !sameGeometryRows(existing, rows)
      const totalArea = [...metrics.values()].reduce(
        (total, metric) => total + (metric.area ?? 0),
        0,
      )
      const totalLength = [...metrics.values()].reduce(
        (total, metric) => total + metric.boundaryLength,
        0,
      )
      console.log(
        [
          `release=${release.code} (${release.id})`,
          `resourceType=${release.resourceType}`,
          `snapshot=${snapshot.id}`,
          `historyShard=${shard.bindingName}`,
          `sourceGeometryRows=${typedGeometryRows.length}`,
          `geometryRows=${districtGeometry.records.length}`,
          `excludedNonDistrictGeometryRows=${districtGeometry.excludedRecordIds.length}`,
          `districts=${metrics.size}`,
          `areaKm2=${totalArea}`,
          `boundaryKm=${totalLength}`,
          `statsRows=${rows.length}`,
          `semanticChange=${changed ? 'yes' : 'no'}`,
        ].join(' '),
      )
      if (dryRun || !changed) continue

      await replaceReleaseStatsDimension(
        seedContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
        release.id,
        'geometry',
        rows,
      )
      if (target.remote) {
        const sql = buildRemoteStatsSql(seedContext.state.dbCacheDir, release.id)
        await replayRemoteCacheWithRetry(
          target.environment === 'production' ? 'production' : 'preview',
          seedContext.state.dbCacheDir,
          `stats-geometry-${release.code}`,
          async () => {
            await executeSqlText(
              {
                databaseId: seedContext.state.bindings.DB_META?.databaseId ?? null,
                name: 'meta',
              },
              sql,
              { isLocal: false },
            )
          },
        )
      }
    }
  } finally {
    seedContext.cleanup()
  }
}

async function listGeometryReleases(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['metaDb'],
  filters: { datasetCodes: string[]; releaseCodes: string[]; resourceType: string },
): Promise<BackfillRelease[]> {
  const rows = await db
    .select({
      code: metaSchema.metaReleases.code,
      datasetCode: metaSchema.metaDatasets.code,
      id: metaSchema.metaReleases.id,
      regionCode: metaSchema.metaDatasets.regionCode,
      resourceType: metaSchema.metaReleases.resourceType,
      sourceVariant: metaSchema.metaDatasets.sourceVariant,
      sourceVersion: metaSchema.metaReleases.sourceVersion,
      status: metaSchema.metaReleases.status,
    })
    .from(metaSchema.metaReleases)
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
    )
    .all()
  return rows
    .filter(
      row =>
        (filters.resourceType === 'all' || row.resourceType === filters.resourceType) &&
        (filters.releaseCodes.length === 0 ||
          filters.releaseCodes.includes(row.code)) &&
        (filters.datasetCodes.length === 0 ||
          filters.datasetCodes.includes(row.datasetCode)),
    )
    .filter(row => row.status === 'published')
    .filter(
      (row): row is typeof row & { resourceType: GeometryResourceType } =>
        row.resourceType === 'divisionArea' || row.resourceType === 'divisionBoundary',
    )
    .filter(isDistrictGeometryRelease)
    .sort((left, right) => left.code.localeCompare(right.code))
}

function isDistrictGeometryRelease(release: BackfillRelease) {
  return (
    release.datasetCode === 'ds-hk-hkgov-had-division-area-district' ||
    release.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district' ||
    release.datasetCode === 'ds-hk-overture-division-area' ||
    release.datasetCode === 'ds-hk-overture-division-boundary'
  )
}

function usesReviewedDistrictBridge(release: BackfillRelease) {
  return (
    release.datasetCode === 'ds-hk-hkgov-had-division-area-district' ||
    release.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district'
  )
}

async function findDivisionSnapshotRows(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  release: BackfillRelease,
  cohortKey: string,
) {
  const districtSnapshot =
    (await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      context.metaDb as unknown as HarbourReadableDb,
      'division',
      release.regionCode.toLowerCase() as 'hk' | 'mo',
      cohortKey,
      { variant: release.sourceVariant },
    )) ??
    (await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      context.metaDb as unknown as HarbourReadableDb,
      'division',
      release.regionCode.toLowerCase() as 'hk' | 'mo',
      cohortKey,
    ))
  if (!districtSnapshot) {
    throw new Error(
      `No versioned division snapshot is available for ${release.code} (${cohortKey}).`,
    )
  }
  return context.currentDb
    .select({
      hierarchy: currentSchema.divisions.hierarchy,
      id: currentSchema.divisions.id,
      type: currentSchema.divisions.type,
    })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, districtSnapshot.id))
    .all()
}

async function resolveExactSnapshot(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['metaDb'],
  release: BackfillRelease,
) {
  const snapshot = await db
    .select({
      cohortKey: metaSchema.metaSnapshots.cohortKey,
      id: metaSchema.metaSnapshots.id,
    })
    .from(metaSchema.metaSnapshotSources)
    .innerJoin(
      metaSchema.metaSnapshots,
      eq(metaSchema.metaSnapshotSources.snapshotId, metaSchema.metaSnapshots.id),
    )
    .innerJoin(
      metaSchema.metaSnapshotLineages,
      eq(
        metaSchema.metaSnapshots.snapshotLineageId,
        metaSchema.metaSnapshotLineages.id,
      ),
    )
    .where(
      and(
        eq(metaSchema.metaSnapshotSources.sourceReleaseId, release.id),
        eq(metaSchema.metaSnapshots.resourceType, release.resourceType),
        eq(metaSchema.metaSnapshots.status, 'published'),
        // Exact canonical variants are the only source of release facts.
        sql`${metaSchema.metaSnapshotLineages.variant} NOT LIKE '%simplified%'`,
      ),
    )
    .orderBy(
      desc(metaSchema.metaSnapshots.publishedAt),
      desc(metaSchema.metaSnapshots.createdAt),
    )
    .get()
  if (!snapshot)
    throw new Error(`No exact published snapshot found for ${release.code}.`)
  return snapshot
}

async function resolveSnapshotShard(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['metaDb'],
  snapshotId: string,
) {
  const shard = await db
    .select({ bindingName: metaSchema.metaDataShards.bindingName })
    .from(metaSchema.metaSnapshotShardAssignments)
    .innerJoin(
      metaSchema.metaDataShards,
      eq(
        metaSchema.metaSnapshotShardAssignments.dataShardId,
        metaSchema.metaDataShards.id,
      ),
    )
    .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, snapshotId))
    .get()
  if (!shard) throw new Error(`Snapshot ${snapshotId} has no assigned history shard.`)
  return shard
}

async function findSnapshotRows(
  targets: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyTargets'],
  snapshotId: string,
  type: 'division' | GeometryResourceType,
) {
  const table =
    type === 'division'
      ? historySchema.divisions
      : type === 'divisionArea'
        ? historySchema.divisionAreas
        : historySchema.divisionBoundaries
  for (const target of targets) {
    const rows = await (target.db as any)
      .select()
      .from(table)
      .where(eq(table.snapshotId, snapshotId))
      .all()
    if (rows.length) return rows
  }
  throw new Error(
    `Snapshot ${snapshotId} has no ${type} rows in its assigned history shard.`,
  )
}

function districtIdForDivision(row: { hierarchy: unknown; id: string; type: string }) {
  if (row.type === 'district') return row.id
  if (!Array.isArray(row.hierarchy)) return null
  const district = row.hierarchy.find(
    entry =>
      entry &&
      typeof entry === 'object' &&
      (entry as { type?: unknown }).type === 'district' &&
      typeof (entry as { division_id?: unknown }).division_id === 'string',
  ) as { division_id: string } | undefined
  return district?.division_id ?? null
}

function isPair(entry: readonly [string, string | null]): entry is [string, string] {
  return entry[1] !== null
}

function splitCsv(value: string | boolean | undefined) {
  return typeof value === 'string'
    ? value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : []
}

function selectExactGeometryRows<TRow extends { id: string; variant?: string | null }>(
  rows: TRow[],
) {
  const exact = rows.filter(row => !row.variant?.includes('simplified'))
  const byId = new Map<string, TRow>()
  for (const row of exact) {
    if (byId.has(row.id)) {
      throw new Error(
        `Exact geometry snapshot contains duplicate canonical record ${row.id}.`,
      )
    }
    byId.set(row.id, row)
  }
  if (byId.size === 0)
    throw new Error('Snapshot contains no exact canonical geometry rows.')
  return [...byId.values()]
}

function sameGeometryRows(
  existing: Array<{
    dimension: string
    groupValue: string | null
    metric: string
    metricUnit: string
    value: number
  }>,
  rows: Array<{
    dimension: string
    groupValue?: string | null
    metric: string
    metricUnit: string
    value: number
  }>,
) {
  const key = (row: {
    groupValue?: string | null
    metric: string
    metricUnit: string
    value: number
  }) =>
    `${row.groupValue ?? ''}\u0000${row.metric}\u0000${row.metricUnit}\u0000${row.value}`
  return (
    existing.length === rows.length &&
    existing.every(row => rows.some(candidate => key(candidate) === key(row)))
  )
}

function decodeGeometry(value: unknown): GeoJsonGeometry {
  if (typeof value === 'string') {
    return JSON.parse(value) as GeoJsonGeometry
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    try {
      return decompressJsonBrotli(value) as GeoJsonGeometry
    } catch {
      const geometry = parseWkbGeometry(value)
      if (geometry) return geometry
    }
  }

  if (value && typeof value === 'object') {
    return value as GeoJsonGeometry
  }

  throw new Error('Geometry value could not be decoded.')
}

function buildRemoteStatsSql(cacheDir: string, releaseId: string) {
  const database = new Database(`${cacheDir}/DB_META.sqlite`, { readonly: true })
  try {
    const rows = database
      .query('SELECT * FROM stats WHERE releaseId = ? AND dimension = ?')
      .all(releaseId, 'geometry') as Array<Record<string, unknown>>
    const values = rows
      .map(row => `(${Object.values(row).map(sqlLiteral).join(', ')})`)
      .join(', ')
    const columns = Object.keys(rows[0] ?? {})
      .map(column => `"${column}"`)
      .join(', ')
    return `DELETE FROM stats WHERE releaseId = ${sqlLiteral(releaseId)} AND type = 'release' AND dimension = 'geometry';\nINSERT INTO stats (${columns}) VALUES ${values};`
  } finally {
    database.close()
  }
}

function sqlLiteral(value: unknown) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}
