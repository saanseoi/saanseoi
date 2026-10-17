import { landsdPlaceNameLocales, type LandsdPlaceName } from './landsdPlaceNames'
import { and, desc, eq, gt, isNull, lt, lte, or } from 'drizzle-orm'
import { metaResourceReleaseDetails, sourceSchema } from '@repo/db'
import type { HarbourReadableDb } from '../../../lib/db/types'
import { buildSourceChurnCounts, type SourceChurnRecord } from './sourceChurn'
import {
  buildChurnStatsRows,
  buildLocaleStatsRows,
  createLocaleStatsAccumulator,
  updateLocaleStatsAccumulator,
} from '../metrics/releaseStats'

/** Source inventory and completeness include water features and landforms. */
export function buildLandsdSourceStats(
  previous: ReadonlyMap<string, SourceChurnRecord>,
  current: ReadonlyMap<string, SourceChurnRecord>,
) {
  const locales = createLocaleStatsAccumulator()
  const classes = new Map<string, number>()
  for (const row of current.values()) {
    const properties = (
      typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties
    ) as { placeClass: string; placeNames: LandsdPlaceName[] }
    classes.set(properties.placeClass, (classes.get(properties.placeClass) ?? 0) + 1)
    updateLocaleStatsAccumulator(
      locales,
      Object.entries(landsdPlaceNameLocales(properties.placeNames)).map(
        ([locale, names]) => ({
          locale,
          hasName: Boolean(names.official),
          hasAltName: names.alias.length > 0,
          meta: {
            fields: { name: { origin: 'provided' as const } },
          },
        }),
      ),
    )
  }
  const now = new Date().toISOString()
  const count = (
    value: number,
    dimension: string | null,
    dimensionValue: string | null,
  ) => ({
    category: 'records',
    measure: 'count',
    unit: 'count',
    value,
    dimension,
    dimensionValue,
    createdAt: now,
    updatedAt: now,
  })
  const churn = buildSourceChurnCounts(previous, current)
  return [
    ...buildChurnStatsRows({ totals: churn.totals, byType: new Map() }),
    ...buildLocaleStatsRows(locales),
    count(current.size, null, null),
    ...[...classes]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => count(value, 'type', name)),
  ]
}

/** Read exact source-validity windows; a rerun still compares with the preceding release. */
export async function loadLandsdSourceStats(
  sources: readonly HarbourReadableDb[],
  meta: HarbourReadableDb,
  resourceReleaseId: string,
  sourceVersion: string,
) {
  const releases = metaResourceReleaseDetails
  const release = await meta
    .select({ datasetId: releases.datasetId, resourceType: releases.resourceType })
    .from(releases)
    .where(eq(releases.id, resourceReleaseId))
    .get()
  if (!release)
    throw new Error('LandsD source statistics require the registered release.')
  const previous = await meta
    .select({ sourceVersion: releases.sourceVersion })
    .from(releases)
    .where(
      and(
        eq(releases.datasetId, release.datasetId),
        eq(releases.resourceType, release.resourceType),
        lt(releases.sourceVersion, sourceVersion),
        isNull(releases.revokedAt),
        or(eq(releases.status, 'current'), eq(releases.status, 'archived')),
      ),
    )
    .orderBy(desc(releases.sourceVersion))
    .limit(1)
    .get()
  const table = sourceSchema.sourceHkgovLandsdPlaceNames
  async function read(version?: string) {
    const result = new Map<string, SourceChurnRecord>()
    if (!version) return result
    for (const source of sources) {
      const rows = await source
        .select({
          sourceRecordId: table.sourceRecordId,
          properties: table.properties,
          sourceGeometry: table.sourceGeometry,
        })
        .from(table)
        .where(
          and(
            lte(table.validFromRelease, version),
            or(isNull(table.validToRelease), gt(table.validToRelease, version)),
          ),
        )
        .all()
      for (const row of rows) {
        if (result.has(row.sourceRecordId))
          throw new Error(
            `Duplicate LandsD source record at ${version}: ${row.sourceRecordId}`,
          )
        result.set(row.sourceRecordId, row)
      }
    }
    if (!result.size) throw new Error(`No LandsD source records at ${version}`)
    return result
  }
  return buildLandsdSourceStats(
    await read(previous?.sourceVersion),
    await read(sourceVersion),
  )
}
