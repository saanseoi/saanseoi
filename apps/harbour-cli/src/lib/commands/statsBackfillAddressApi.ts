import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceApiReleaseSetStats } from '@repo/core/pipeline/db/stats'
import { metaSchema } from '@repo/db'
import { eq } from 'drizzle-orm'

import { buildAddressApiReleaseSetStatsForSnapshot } from '../api/apiReleaseSetStats.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'

type AddressApiReleaseSet = {
  code: string
  id: string
  snapshotId: string
}

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
  })

  try {
    const releaseSets = await listAddressApiReleaseSets(context.metaDb, releaseCodes)
    if (!releaseSets.length) {
      console.log(
        'No published Address API release sets matched the requested filters.',
      )
      return
    }

    for (const releaseSet of releaseSets) {
      const rows = await buildAddressApiReleaseSetStatsForSnapshot(
        context.currentDb as unknown as HarbourReadableDb,
        releaseSet.snapshotId,
      )
      console.log(
        `${dryRun ? 'Inspect' : 'Backfill'} ${releaseSet.code}: ${rows.length} stats rows`,
      )
      if (dryRun) continue
      await replaceApiReleaseSetStats(
        context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
        releaseSet.id,
        rows,
      )
    }
  } finally {
    context.cleanup()
  }
}

async function listAddressApiReleaseSets(
  metaDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['metaDb'],
  releaseCodes: string[],
): Promise<AddressApiReleaseSet[]> {
  const rows = await metaDb
    .select({
      code: metaSchema.metaApiReleaseSets.code,
      familyType: metaSchema.metaApiVersions.familyType,
      id: metaSchema.metaApiReleaseSets.id,
      role: metaSchema.metaApiReleaseSetSnapshots.role,
      snapshotId: metaSchema.metaSnapshots.id,
      snapshotResourceType: metaSchema.metaSnapshots.resourceType,
      snapshotStatus: metaSchema.metaSnapshots.status,
      status: metaSchema.metaApiReleaseSets.status,
    })
    .from(metaSchema.metaApiReleaseSets)
    .innerJoin(
      metaSchema.metaApiVersions,
      eq(metaSchema.metaApiReleaseSets.apiVersionId, metaSchema.metaApiVersions.id),
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
      eq(metaSchema.metaApiReleaseSetSnapshots.snapshotId, metaSchema.metaSnapshots.id),
    )
    .all()

  return rows
    .filter(row => row.familyType === 'addresses')
    .filter(row => row.status === 'current' || row.status === 'archived')
    .filter(row => row.role === 'primary')
    .filter(row => row.snapshotResourceType === 'address')
    .filter(row => row.snapshotStatus === 'published')
    .filter(row => releaseCodes.length === 0 || releaseCodes.includes(row.code))
    .map(row => ({ code: row.code, id: row.id, snapshotId: row.snapshotId }))
    .sort((left, right) => left.code.localeCompare(right.code))
}

function splitCsv(value: string | boolean | undefined) {
  return typeof value === 'string'
    ? value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : []
}
