import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceApiReleaseSetStats } from '@repo/core/pipeline/db/stats'
import {
  buildDivisionApiStats,
  listDivisionStatsReleases,
} from '../api/divisionApiReleaseSetStats'
import type { ParsedArgs, UploadTarget } from '../cli/options'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache'

/** Rebuild published presentation facts without changing release or snapshot membership. */
export async function runDivisionApiStatsBackfillCommand(
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
    throw new Error('`stats:backfill-divisions` supports local API release sets only.')
  }
  const selected =
    typeof args.options.release === 'string'
      ? args.options.release
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      : []
  const context = await resolveLocalAddressDbContext(target, 'hk', '2026', {
    cacheTableProfile: 'division',
    includeAllHistoryShardYears: true,
  })
  try {
    const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const releases = await listDivisionStatsReleases(metaDb)
    for (const code of selected)
      if (!releases.some(row => row.code === code))
        throw new Error(`Unknown published division release: ${code}`)
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
      const rows = await buildDivisionApiStats(
        metaDb,
        context.historyTargets,
        release.id,
      )
      prepared.push({ release, rows })
      const churn = Object.fromEntries(
        rows
          .filter(row => row.metric === 'churn' && !row.groupBy)
          .map(row => [row.dimension, row.value]),
      )
      console.log(
        `${args.options['dry-run'] ? 'Inspect' : 'Prepared'} ${release.code}: ${rows.length} stats rows; ${JSON.stringify(churn)}`,
      )
    }
    if (args.options['dry-run']) return
    for (const { release, rows } of prepared)
      await replaceApiReleaseSetStats(metaDb, release.id, rows)
    console.log(`Backfilled ${prepared.length} division API release sets.`)
  } finally {
    context.cleanup()
  }
}
