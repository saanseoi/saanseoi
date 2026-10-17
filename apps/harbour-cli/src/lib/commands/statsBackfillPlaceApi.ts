import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceApiReleaseSetStats } from '@repo/core/pipeline/db/stats'

import { buildHistoricalPlaceApiReleaseSetStats } from '../api/apiReleaseSetStats.ts'
import { and, eq, inArray, metaSchema } from '@repo/db'
import {
  buildApiRecordReleaseChurn,
  assertApiRecordChangeTotals,
} from '../api/apiRecordReleaseChurn'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'

/**
 * Repairs presentation stats for published Place API release sets without
 * re-ingesting their source data. This covers releases whose publication
 * completed before their post-publish stats phase could run.
 */
export async function runPlaceApiStatsBackfillCommand(
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
    throw new Error('`stats:backfill-places` supports local API release sets only.')
  }

  const releaseCodes = splitCsv(args.options.release)
  const dryRun = Boolean(args.options['dry-run'])
  const context = await resolveLocalAddressDbContext(target, 'hk', '2026', {
    cacheTableProfile: 'places',
    includeAllHistoryShardYears: true,
  })

  try {
    const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const releases = await listPlaceStatsReleases(metaDb)
    for (const code of releaseCodes)
      if (!releases.some(release => release.code === code))
        throw new Error(`Unknown published Place release: ${code}`)
    const releaseSets = releases.filter(
      release => releaseCodes.length === 0 || releaseCodes.includes(release.code),
    )
    if (!releaseSets.length) {
      console.log('No published Place API release sets matched the requested filters.')
      return
    }

    // Complete every replay before changing any persisted presentation facts.
    const prepared = []
    for (const releaseSet of releaseSets) {
      if (releaseSet.regionCode !== 'hk')
        throw new Error(`Unsupported history region: ${releaseSet.regionCode}`)
      const rows = [
        ...(await buildHistoricalPlaceApiReleaseSetStats(
          metaDb,
          context.historyTargets,
          releaseSet.snapshotId,
        )),
        ...(await buildApiRecordReleaseChurn(
          metaDb,
          context.historyTargets,
          releaseSet.id,
          'places',
        )),
      ]
      assertApiRecordChangeTotals(rows)
      prepared.push({ releaseSet, rows })
      console.log(
        `${dryRun ? 'Inspect' : 'Prepared'} ${releaseSet.code}: ${rows.length} stats rows`,
      )
    }
    if (dryRun) return
    for (const { releaseSet, rows } of prepared) {
      await replaceApiReleaseSetStats(metaDb, releaseSet.id, rows)
    }
    console.log(`Backfilled ${prepared.length} Place API release sets.`)
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

export async function listPlaceStatsReleases(db: HarbourReadableDb) {
  const rows = await db
    .select({
      apiVersionId: metaSchema.metaApiVersionReleaseSets.apiVersionId,
      code: metaSchema.metaApiReleaseSets.code,
      domainCode: metaSchema.metaApiReleaseSets.domainCode,
      id: metaSchema.metaApiReleaseSets.id,
      regionCode: metaSchema.metaApiReleaseSets.regionCode,
      revision: metaSchema.metaApiReleaseSets.revision,
      snapshotId: metaSchema.metaSnapshots.id,
    })
    .from(metaSchema.metaApiReleaseSets)
    .innerJoin(
      metaSchema.metaApiVersionReleaseSets,
      eq(
        metaSchema.metaApiVersionReleaseSets.apiReleaseSetId,
        metaSchema.metaApiReleaseSets.id,
      ),
    )
    .innerJoin(
      metaSchema.metaApiVersions,
      eq(
        metaSchema.metaApiVersions.id,
        metaSchema.metaApiVersionReleaseSets.apiVersionId,
      ),
    )
    .innerJoin(
      metaSchema.metaApiReleaseSetSnapshots,
      eq(
        metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId,
        metaSchema.metaApiReleaseSets.id,
      ),
    )
    .innerJoin(
      metaSchema.metaSnapshots,
      eq(metaSchema.metaSnapshots.id, metaSchema.metaApiReleaseSetSnapshots.snapshotId),
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
        eq(metaSchema.metaApiVersions.familyType, 'places'),
        inArray(metaSchema.metaApiVersionReleaseSets.status, ['current', 'archived']),
        eq(metaSchema.metaApiReleaseSetSnapshots.role, 'primary'),
        eq(metaSchema.metaSnapshotLineages.resourceType, 'place'),
        eq(metaSchema.metaSnapshots.status, 'published'),
      ),
    )
    .all()

  return rows.sort(
    (left, right) =>
      left.code.localeCompare(right.code) || left.revision - right.revision,
  )
}
