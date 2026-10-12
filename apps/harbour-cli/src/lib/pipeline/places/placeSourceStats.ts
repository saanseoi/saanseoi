import type { HarbourReadableDb } from '@repo/core/db/types'
import { buildChurnStatsRows } from '@repo/core/pipeline/services/metrics/releaseStats'
import {
  buildSourceChurnCounts,
  type SourceChurnRecord,
} from '@repo/core/pipeline/services/sources/sourceChurn'
import { overtureSourcePayload } from '@repo/core/pipeline/services/sources/sourcePayload'
import type { NormalisedPlace } from '@repo/core/pipeline/services/places/place'
import { metaSchema, sourceSchema } from '@repo/db'
import { and, asc, desc, eq, gt, isNull, lt, lte, or } from 'drizzle-orm'

/** Read the release interval, rather than isCurrent, so retries use the same baseline. */
export async function readPlaceSourceStatsRecords(
  sourceDbs: HarbourReadableDb[],
  sourceVersion: string,
) {
  const table = sourceSchema.sourceOverturePlaces
  const records = new Map<string, SourceChurnRecord>()
  for (const db of sourceDbs) {
    let cursor: { sourceRecordId: string; versionHash: string } | undefined
    for (;;) {
      const rows = await db
        .select({
          sourceRecordId: table.sourceRecordId,
          versionHash: table.versionHash,
          properties: table.properties,
          sourceGeometry: table.sourceGeometry,
        })
        .from(table)
        .where(
          and(
            lte(table.validFromRelease, sourceVersion),
            or(isNull(table.validToRelease), gt(table.validToRelease, sourceVersion)),
            cursor
              ? or(
                  gt(table.sourceRecordId, cursor.sourceRecordId),
                  and(
                    eq(table.sourceRecordId, cursor.sourceRecordId),
                    gt(table.versionHash, cursor.versionHash),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(table.sourceRecordId), asc(table.versionHash))
        .limit(1000)
        .all()
      for (const row of rows) {
        if (records.has(row.sourceRecordId))
          throw new Error(`Ambiguous Places source identity: ${row.sourceRecordId}`)
        records.set(row.sourceRecordId, row)
      }
      if (rows.length < 1000) break
      cursor = rows.at(-1)!
    }
  }
  return records
}

export async function buildPlaceSourceStats(input: {
  metaDb: HarbourReadableDb
  /** All prepared source shards for this region, including previous years. */
  sourceDbs: HarbourReadableDb[]
  datasetId: string
  sourceVersion: string
  places: AsyncIterable<NormalisedPlace>
}) {
  const releases = metaSchema.metaResourceReleases
  const previous = await input.metaDb
    .select({ sourceVersion: releases.sourceVersion })
    .from(releases)
    .where(
      and(
        eq(releases.datasetId, input.datasetId),
        eq(releases.resourceType, 'place'),
        lt(releases.sourceVersion, input.sourceVersion),
        or(eq(releases.status, 'current'), eq(releases.status, 'archived')),
      ),
    )
    .orderBy(desc(releases.sourceVersion))
    .limit(1)
    .get()
  const before = previous
    ? await readPlaceSourceStatsRecords(input.sourceDbs, previous.sourceVersion)
    : new Map<string, SourceChurnRecord>()
  const after = new Map<string, SourceChurnRecord>()
  for await (const place of input.places) {
    if (after.has(place.id))
      throw new Error(`Duplicate Places source identity: ${place.id}`)
    after.set(place.id, overtureSourcePayload(place.raw))
  }
  const { totals } = buildSourceChurnCounts(before, after)
  return buildChurnStatsRows({ totals, byType: new Map() })
}
