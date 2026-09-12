import { eq, metaSchema } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceApiReleaseSetStats } from '@repo/core/pipeline/db/stats'
import {
  buildStatisticsApiStats,
  listStatisticsStatsReleases,
} from '../api/statisticsApiReleaseSetStats'
import type { ParsedArgs, UploadTarget } from '../cli/options'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache'

/** Rebuild published presentation facts without changing release or snapshot membership. */
export async function runStatisticsApiStatsBackfillCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const allowed = new Set(['target', 'dry-run', 'release'])
  if (
    target.remote ||
    args.positionals.length ||
    Object.keys(args.options).some(key => !allowed.has(key))
  ) {
    printUsage()
    throw new Error('`stats:backfill-statistics` supports local API release sets only.')
  }
  const selected =
    typeof args.options.release === 'string'
      ? args.options.release
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      : []
  const context = await resolveLocalAddressDbContext(target, 'hk', '2026', {
    cacheTableProfile: 'statistics',
    includeAllHistoryShardYears: true,
  })
  try {
    const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const releases = await listStatisticsStatsReleases(metaDb)
    for (const code of selected)
      if (!releases.some(row => row.code === code))
        throw new Error(`Unknown published Statistics release: ${code}`)
    const matched = releases.filter(
      row => !selected.length || selected.includes(row.code),
    )
    // Finish all replay and validation before replacing any saved stats.
    const prepared = []
    for (const release of matched) {
      if (release.regionCode !== 'hk')
        throw new Error(
          `History bindings for region ${release.regionCode} are not configured for this backfill`,
        )
      const rows = await buildStatisticsApiStats(
        metaDb,
        context.historyTargets,
        release.id,
      )
      prepared.push({ release, rows })
      const counts = Object.fromEntries(
        rows
          .filter(row => row.metric === 'count' && !row.groupBy)
          .map(row => [row.dimension, row.value]),
      )
      const churn = Object.fromEntries(
        rows
          .filter(row => row.metric === 'churn' && !row.groupBy)
          .map(row => [row.dimension, row.value]),
      )
      console.log(
        `${args.options['dry-run'] ? 'Inspect' : 'Prepared'} ${release.code}: ${rows.length} stats rows; ${JSON.stringify(counts)}; churn ${JSON.stringify(churn)}`,
      )
    }
    if (args.options['dry-run']) return
    for (const { release, rows } of prepared) {
      await replaceApiReleaseSetStats(metaDb, release.id, rows)
      const saved = await metaDb
        .select()
        .from(metaSchema.stats)
        .where(eq(metaSchema.stats.apiReleaseSetId, release.id))
        .all()
      const facts = (values: typeof rows) =>
        values
          .map(row =>
            JSON.stringify([
              row.dimension,
              row.metric,
              row.metricUnit,
              row.value,
              row.groupBy,
              row.groupValue,
            ]),
          )
          .sort()
      if (JSON.stringify(facts(saved as typeof rows)) !== JSON.stringify(facts(rows)))
        throw new Error(`Statistics readback did not match for ${release.code}`)
    }
    console.log(`Backfilled ${prepared.length} Statistics API release sets.`)
  } finally {
    context.cleanup()
  }
}
