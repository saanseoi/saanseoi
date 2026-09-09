import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceApiReleaseSetStats } from '@repo/core/pipeline/db/stats'

import { buildAddressApiReleaseSetStatsForSnapshot } from '../api/apiReleaseSetStats.ts'
import {
  buildAddressApiReleaseSetChurn,
  listAddressStatsReleases,
} from '../api/addressApiReleaseSetStats.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'

/**
 * Repairs presentation stats for published Address API release sets without
 * re-ingesting their source data. This covers releases whose publication
 * completed before their post-publish stats phase could run.
 */
export async function runAddressApiStatsBackfillCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const allowed = new Set(['target', 'dry-run', 'release'])
  if (
    target.remote ||
    args.positionals.length > 0 ||
    [...Object.keys(args.options)].some(key => !allowed.has(key))
  ) {
    printUsage()
    throw new Error('`stats:backfill-addresses` supports local API release sets only.')
  }

  const releaseCodes = splitCsv(args.options.release)
  const dryRun = Boolean(args.options['dry-run'])
  const context = await resolveLocalAddressDbContext(target, 'hk', '2026', {
    cacheTableProfile: 'address',
    includeAllHistoryShardYears: true,
  })

  try {
    const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const releases = await listAddressStatsReleases(metaDb)
    for (const code of releaseCodes)
      if (!releases.some(release => release.code === code))
        throw new Error(`Unknown published Address release: ${code}`)
    const releaseSets = releases.filter(
      release => releaseCodes.length === 0 || releaseCodes.includes(release.code),
    )
    if (!releaseSets.length) {
      console.log(
        'No published Address API release sets matched the requested filters.',
      )
      return
    }

    // Complete every replay before changing any persisted presentation facts.
    const prepared = []
    for (const releaseSet of releaseSets) {
      const churn = await buildAddressApiReleaseSetChurn(
        metaDb,
        context.historyTargets,
        releaseSet.id,
      )
      const rows = await buildAddressApiReleaseSetStatsForSnapshot(
        context.currentDb as unknown as HarbourReadableDb,
        releaseSet.snapshotId,
        undefined,
        churn,
      )
      prepared.push({ releaseSet, rows })
      console.log(
        `${dryRun ? 'Inspect' : 'Prepared'} ${releaseSet.code}: ${rows.length} stats rows; ${JSON.stringify(churn.totals)}`,
      )
    }
    if (dryRun) return
    for (const { releaseSet, rows } of prepared) {
      await replaceApiReleaseSetStats(metaDb, releaseSet.id, rows)
    }
    console.log(`Backfilled ${prepared.length} Address API release sets.`)
  } finally {
    context.cleanup()
  }
}

function splitCsv(value: string | boolean | undefined) {
  return typeof value === 'string'
    ? value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : []
}
