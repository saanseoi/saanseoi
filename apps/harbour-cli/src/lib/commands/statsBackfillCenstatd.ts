import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceDatasetStatsAndReturnRows } from '@repo/core/pipeline/db/stats'
import {
  buildCenstatdReleaseStats,
  buildCenstatdStructuralChurnStats,
  censtatdReleaseStatsProfileFor,
} from '@repo/core/pipeline/services/censtatdReleaseStats'
import { metaSchema, sourceSchema } from '@repo/db'
import { eq } from 'drizzle-orm'

import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'
import { findPreviousComparableCenstatdReleaseStats } from '../statisticsSql/censtatdReleaseChurn.ts'
import { normaliseHkgovCenstatdStatistics } from '../statisticsSql/normaliseHkgovCenstatdStatistics.ts'

const CENSTATD_STATISTICS_DATASET_PREFIX = 'ds-hk-hkgov-censtatd-division-statistic-'
const DENSITY_DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'

type BackfillRelease = {
  code: string
  datasetCode: string
  id: string
  sourceVersion: string
}

/**
 * Locally fills in structural facts for already-published C&SD releases. It
 * never replays source/canonical rows and deliberately does not amend immutable
 * historical processing actions.
 */
export async function runCenstatdStatsBackfillCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const allowed = new Set(['target', 'dry-run', 'release', 'dataset'])
  if (
    target.remote ||
    args.positionals.length > 0 ||
    [...Object.keys(args.options)].some(key => !allowed.has(key))
  ) {
    printUsage()
    throw new Error('`stats:backfill-censtatd` supports local structural stats only.')
  }
  const dryRun = Boolean(args.options['dry-run'])
  const releaseCodes = splitCsv(args.options.release)
  const datasetCodes = splitCsv(args.options.dataset)
  const context = await resolveLocalAddressDbContext(target, 'hk', '2021', {
    cacheTableProfile: 'statistics',
  })

  try {
    const releases = await listPublishedCenstatdReleases(context.metaDb, {
      datasetCodes,
      releaseCodes,
    })
    if (!releases.length) {
      console.log(
        'No published C&SD statistics releases matched the requested filters.',
      )
      return
    }

    for (const release of releases) {
      const statsRows = await buildReleaseStatsRows(context, release)
      console.log(
        `${dryRun ? 'Inspect' : 'Backfill'} ${release.code}: ${statsRows.length} stats rows`,
      )
      if (dryRun) continue
      await replaceDatasetStatsAndReturnRows(
        context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
        release.id,
        statsRows,
      )
    }
  } finally {
    context.cleanup()
  }
}

async function listPublishedCenstatdReleases(
  metaDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['metaDb'],
  filters: { datasetCodes: string[]; releaseCodes: string[] },
): Promise<BackfillRelease[]> {
  const rows = await metaDb
    .select({
      code: metaSchema.metaReleases.code,
      datasetCode: metaSchema.metaDatasets.code,
      id: metaSchema.metaReleases.id,
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
    .filter(row => row.status === 'published')
    .filter(row => row.datasetCode.startsWith(CENSTATD_STATISTICS_DATASET_PREFIX))
    .filter(
      row =>
        filters.releaseCodes.length === 0 || filters.releaseCodes.includes(row.code),
    )
    .filter(
      row =>
        filters.datasetCodes.length === 0 ||
        filters.datasetCodes.includes(row.datasetCode),
    )
    .sort((left, right) => left.code.localeCompare(right.code))
}

async function buildReleaseStatsRows(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  release: BackfillRelease,
) {
  const profile = censtatdReleaseStatsProfileFor(
    release.datasetCode,
    release.sourceVersion,
  )
  const canonical =
    release.datasetCode === DENSITY_DATASET_CODE
      ? await normaliseDensityRelease(context, release)
      : await normaliseStatisticRelease(context, release)
  const structural = buildCenstatdReleaseStats(
    canonical.features,
    canonical.rows,
    profile,
  )
  const previous = await findPreviousComparableCenstatdReleaseStats(
    context.metaDb as unknown as HarbourReadableDb,
    release.id,
  )
  return [...structural, ...buildCenstatdStructuralChurnStats(structural, previous)]
}

async function normaliseStatisticRelease(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  release: BackfillRelease,
) {
  const sourceRows = await context.sourceDb
    .select({
      featureId: sourceSchema.sourceHkgovCenstatdStatistics.featureId,
      layerName: sourceSchema.sourceHkgovCenstatdStatistics.layerName,
      rawProperties: sourceSchema.sourceHkgovCenstatdStatistics.rawProperties,
    })
    .from(sourceSchema.sourceHkgovCenstatdStatistics)
    .where(eq(sourceSchema.sourceHkgovCenstatdStatistics.releaseId, release.id))
    .all()
  if (!sourceRows.length)
    throw new Error(`No retained source assertions for ${release.code}.`)
  const features = sourceRows.map(row => ({
    featureId: row.featureId,
    layerName: row.layerName,
  }))
  return {
    features,
    rows: normaliseHkgovCenstatdStatistics(
      sourceRows.map(row => ({
        datasetCode: release.datasetCode,
        properties: object(row.rawProperties, 'rawProperties'),
        sourceFeatureId: `${row.layerName}:${row.featureId}`,
        sourceReleaseId: release.id,
        sourceVersion: release.sourceVersion,
      })),
    ),
  }
}

async function normaliseDensityRelease(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  release: BackfillRelease,
) {
  const sourceRows = await context.sourceDb
    .select({
      districtCode:
        sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities
          .districtCode,
      rawProperties:
        sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities
          .rawProperties,
    })
    .from(sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities)
    .where(
      eq(
        sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities.releaseId,
        release.id,
      ),
    )
    .all()
  if (!sourceRows.length)
    throw new Error(`No retained source assertions for ${release.code}.`)
  const layerName = `Density_${release.sourceVersion}`
  return {
    features: sourceRows.map(row => ({
      featureId: String(row.districtCode),
      layerName,
    })),
    rows: normaliseHkgovCenstatdStatistics(
      sourceRows.map(row => ({
        datasetCode: DENSITY_DATASET_CODE,
        properties: object(row.rawProperties, 'rawProperties'),
        sourceFeatureId: `${layerName}:${row.districtCode}`,
        sourceReleaseId: release.id,
        sourceVersion: release.sourceVersion,
      })),
    ),
  }
}

function object(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${field} object.`)
  }
  return value as Record<string, unknown>
}

function splitCsv(value: unknown) {
  return typeof value === 'string'
    ? value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : []
}
