import { sql } from '@repo/db'
import type { SQL } from 'drizzle-orm'

import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'

const CENSTATD_STATISTICS_DATASET_PREFIX = 'ds-hk-hkgov-censtatd-division-statistic-'

type ResetDb = {
  all(query: SQL): Promise<Array<Record<string, unknown>>>
  run(query: SQL): Promise<unknown>
}

type ResetRelease = {
  code: string
  datasetCode: string
  id: string
  sourceReleaseId: string
  status: string
}

type ResetCount = {
  database: 'current' | 'history' | 'meta' | 'source'
  table: string
  rows: number
}

/**
 * Clears local C&SD statistic ingestion state so the normal update command can
 * replay the retained archives. It intentionally does not touch C&SD district
 * geometry, datasets, or any non-C&SD statistics.
 */
export async function runCenstatdStatsResetCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const allowed = new Set(['dataset', 'dry-run', 'target', 'yes'])
  if (
    target.remote ||
    args.positionals.length > 0 ||
    [...Object.keys(args.options)].some(key => !allowed.has(key))
  ) {
    printUsage()
    throw new Error('`stats:reset-censtatd` only resets local C&SD statistic data.')
  }

  const dryRun = Boolean(args.options['dry-run'])
  const confirmed = Boolean(args.options.yes)
  if (!dryRun && !confirmed) {
    throw new Error(
      'Refusing to reset local data without `--yes`. Use `--dry-run` to inspect it first.',
    )
  }

  const datasetCodes = splitCsv(args.options.dataset)
  const context = await resolveLocalAddressDbContext(target, 'hk', '2021', {
    cacheTableProfile: 'statistics',
    includeAllHistoryShardYears: true,
    includeAllSourceShardYears: true,
  })

  try {
    const releases = await listCenstatdStatisticReleases(context.metaDb as ResetDb)
    const selected = releases.filter(
      release =>
        datasetCodes.length === 0 || datasetCodes.includes(release.datasetCode),
    )
    if (!selected.length) {
      console.log('No local C&SD statistic releases matched the requested filters.')
      return
    }

    const plan = await describeResetPlan(context, selected)
    printPlan(selected, plan, dryRun)
    if (dryRun) return

    await clearStatisticRows(context, selected)
    await markReleasesRetryable(context.metaDb as ResetDb, selected)

    const remaining = await describeResetPlan(context, selected)
    const retained = remaining.filter(entry => entry.rows > 0)
    if (retained.length) {
      throw new Error(
        `C&SD statistic reset was incomplete:\n${retained.map(formatCount).join('\n')}`,
      )
    }
    console.log(
      `Reset ${selected.length} local C&SD statistic releases. Re-upload with \`./bin/saanseoi update --target local --scope stats --download --yes --check-now\`.`,
    )
  } finally {
    context.cleanup()
  }
}

async function listCenstatdStatisticReleases(metaDb: ResetDb): Promise<ResetRelease[]> {
  const rows = await metaDb.all(sql`
    SELECT
      r."id" AS "id",
      r."code" AS "code",
      r."status" AS "status",
      r."sourceReleaseId" AS "sourceReleaseId",
      d."code" AS "datasetCode"
    FROM "releases" r
    INNER JOIN "datasets" d ON d."id" = r."datasetId"
    WHERE d."code" LIKE ${`${CENSTATD_STATISTICS_DATASET_PREFIX}%`}
    ORDER BY d."code", r."code"
  `)
  return rows.map(row => ({
    code: requiredString(row.code, 'release code'),
    datasetCode: requiredString(row.datasetCode, 'dataset code'),
    id: requiredString(row.id, 'release ID'),
    sourceReleaseId: requiredString(row.sourceReleaseId, 'source release ID'),
    status: requiredString(row.status, 'release status'),
  }))
}

async function describeResetPlan(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  releases: ResetRelease[],
) {
  const releaseIds = values(releases.map(release => release.id))
  const current = context.currentDb as ResetDb
  const meta = context.metaDb as ResetDb
  const counts: ResetCount[] = []

  for (const sourceTarget of context.sourceTargets) {
    await appendCounts(counts, sourceTarget.db as ResetDb, 'source', [
      ['hkgovCenstatdStatistics', sql`"releaseId" IN (${releaseIds})`],
      [
        'hkgovCenstatdDistrictLandAreaPopulationDensities',
        sql`"releaseId" IN (${releaseIds})`,
      ],
    ])
  }
  await appendCounts(counts, current, 'current', [
    ['divisionStatistics', sql`"sourceReleaseId" IN (${releaseIds})`],
    ['statsRecords', sql`"sourceReleaseId" IN (${releaseIds})`],
    [
      'statsFields',
      sql`"datasetCode" IN (SELECT DISTINCT "datasetCode" FROM "statsRecords" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    [
      'statsFieldsI18n',
      sql`"datasetCode" IN (SELECT DISTINCT "datasetCode" FROM "statsRecords" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    [
      'statsValuesI18n',
      sql`"datasetCode" IN (SELECT DISTINCT "datasetCode" FROM "statsRecords" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    [
      'statsObservations',
      sql`"seriesId" IN (SELECT "id" FROM "statsSeries" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    [
      'statsSeriesDimensions',
      sql`"seriesId" IN (SELECT "id" FROM "statsSeries" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    ['statsSeries', sql`"sourceReleaseId" IN (${releaseIds})`],
  ])
  for (const historyTarget of context.historyTargets) {
    await appendCounts(counts, historyTarget.db as ResetDb, 'history', [
      ['divisionStatistics', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsRecords', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsFields', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsFieldsI18n', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsValuesI18n', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsObservations', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsSeriesDimensions', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsSeries', sql`"sourceReleaseId" IN (${releaseIds})`],
    ])
  }
  await appendCounts(counts, meta, 'meta', [
    ['stats', sql`"releaseId" IN (${releaseIds})`],
    ['releaseProcessingActions', sql`"releaseId" IN (${releaseIds})`],
    ['ingestRuns', sql`"releaseId" IN (${releaseIds})`],
  ])
  return counts
}

async function appendCounts(
  counts: ResetCount[],
  db: ResetDb,
  database: ResetCount['database'],
  candidates: ReadonlyArray<readonly [string, SQL]>,
) {
  for (const [table, where] of candidates) {
    if (!(await tableExists(db, table))) continue
    const rows = await countRows(db, table, where)
    if (rows > 0) counts.push({ database, rows, table })
  }
}

async function clearStatisticRows(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  releases: ResetRelease[],
) {
  const releaseIds = values(releases.map(release => release.id))
  const current = context.currentDb as ResetDb
  const meta = context.metaDb as ResetDb

  for (const sourceTarget of context.sourceTargets) {
    await deleteExisting(sourceTarget.db as ResetDb, [
      ['hkgovCenstatdStatistics', sql`"releaseId" IN (${releaseIds})`],
      [
        'hkgovCenstatdDistrictLandAreaPopulationDensities',
        sql`"releaseId" IN (${releaseIds})`,
      ],
    ])
  }
  await deleteExisting(current, [
    [
      'statsObservations',
      sql`"seriesId" IN (SELECT "id" FROM "statsSeries" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    [
      'statsSeriesDimensions',
      sql`"seriesId" IN (SELECT "id" FROM "statsSeries" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    [
      'statsFields',
      sql`"datasetCode" IN (SELECT DISTINCT "datasetCode" FROM "statsRecords" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    [
      'statsFieldsI18n',
      sql`"datasetCode" IN (SELECT DISTINCT "datasetCode" FROM "statsRecords" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    [
      'statsValuesI18n',
      sql`"datasetCode" IN (SELECT DISTINCT "datasetCode" FROM "statsRecords" WHERE "sourceReleaseId" IN (${releaseIds}))`,
    ],
    ['statsSeries', sql`"sourceReleaseId" IN (${releaseIds})`],
    ['statsRecords', sql`"sourceReleaseId" IN (${releaseIds})`],
    ['divisionStatistics', sql`"sourceReleaseId" IN (${releaseIds})`],
  ])
  for (const historyTarget of context.historyTargets) {
    await deleteExisting(historyTarget.db as ResetDb, [
      ['statsObservations', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsSeriesDimensions', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsSeries', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsRecords', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsFields', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsFieldsI18n', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['statsValuesI18n', sql`"sourceReleaseId" IN (${releaseIds})`],
      ['divisionStatistics', sql`"sourceReleaseId" IN (${releaseIds})`],
    ])
  }
  await deleteExisting(meta, [
    ['stats', sql`"releaseId" IN (${releaseIds})`],
    ['releaseProcessingActions', sql`"releaseId" IN (${releaseIds})`],
    ['ingestRuns', sql`"releaseId" IN (${releaseIds})`],
  ])
}

async function markReleasesRetryable(metaDb: ResetDb, releases: ResetRelease[]) {
  const releaseIds = values(releases.map(release => release.id))
  const sourceReleaseIds = values([
    ...new Set(releases.map(release => release.sourceReleaseId)),
  ])
  await metaDb.run(sql`
    UPDATE "releases"
    SET "status" = 'failed', "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE "id" IN (${releaseIds})
  `)
  await metaDb.run(sql`
    UPDATE "sourceReleases"
    SET "status" = 'failed', "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE "id" IN (${sourceReleaseIds})
  `)
}

async function deleteExisting(
  db: ResetDb,
  candidates: ReadonlyArray<readonly [string, SQL]>,
) {
  for (const [table, where] of candidates) {
    if (!(await tableExists(db, table))) continue
    await db.run(sql`DELETE FROM ${identifier(table)} WHERE ${where}`)
  }
}

async function tableExists(db: ResetDb, table: string) {
  const rows = await db.all(sql`
    SELECT 1 AS "present"
    FROM "sqlite_master"
    WHERE "type" = 'table' AND "name" = ${table}
    LIMIT 1
  `)
  return rows.length === 1
}

async function countRows(db: ResetDb, table: string, where: SQL) {
  const rows = await db.all(
    sql`SELECT COUNT(*) AS "count" FROM ${identifier(table)} WHERE ${where}`,
  )
  return Number(rows[0]?.count ?? 0)
}

function identifier(value: string) {
  return sql.raw(`"${value.replaceAll('"', '""')}"`)
}

function values(items: string[]) {
  return sql.join(
    items.map(item => sql`${item}`),
    sql`, `,
  )
}

function printPlan(releases: ResetRelease[], counts: ResetCount[], dryRun: boolean) {
  console.log(
    `${dryRun ? 'Would reset' : 'Resetting'} ${releases.length} local C&SD statistic releases:`,
  )
  for (const release of releases) {
    console.log(`- ${release.code} (${release.status})`)
  }
  if (!counts.length) {
    console.log(
      'No retained statistic rows remain; releases will still be made retryable.',
    )
    return
  }
  console.log('Rows to remove:')
  for (const count of counts) console.log(formatCount(count))
}

function formatCount(count: ResetCount) {
  return `- ${count.database}.${count.table}: ${count.rows.toLocaleString()}`
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value) throw new Error(`Missing ${field}.`)
  return value
}

function splitCsv(value: unknown) {
  return typeof value === 'string'
    ? value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : []
}
