import type { HarbourReadableDb } from '@repo/core/db/types'
import { buildChurnStatsRows } from '@repo/core/pipeline/services/metrics/releaseStats'
import {
  buildSourceChurnCounts,
  type SourceChurnRecord,
} from '@repo/core/pipeline/services/sources/sourceChurn'
import { equalJson } from '@repo/core/jsonFieldDiff'
import { metaSchema, sourceSchema } from '@repo/db'
import { and, asc, desc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm'

/** Compare exact release-owned publisher rows, including historical reference periods. */
export async function buildCenstatdSourceRecordChurn(input: {
  metaDb: HarbourReadableDb
  sourceDbs: HarbourReadableDb[]
  resourceReleaseId: string
  datasetCode: string
  expectedRecords: number
}) {
  const releases = metaSchema.metaResourceReleaseDetails
  const release = await input.metaDb
    .select({
      datasetId: releases.datasetId,
      resourceType: releases.resourceType,
      sourceVersion: releases.sourceVersion,
    })
    .from(releases)
    .where(eq(releases.id, input.resourceReleaseId))
    .get()
  if (!release)
    throw new Error(`Missing C&SD source release ${input.resourceReleaseId}`)
  const previous = await input.metaDb
    .select({ id: releases.id })
    .from(releases)
    .where(
      and(
        eq(releases.datasetId, release.datasetId),
        eq(releases.resourceType, release.resourceType),
        lt(releases.sourceVersion, release.sourceVersion),
        inArray(releases.status, ['current', 'archived']),
        isNull(releases.revokedAt),
      ),
    )
    .orderBy(desc(releases.sourceVersion))
    .limit(1)
    .get()
  const table = sourceSchema.sourceHkgovCenstatdStatistics
  async function read(id: string) {
    const records = new Map<string, SourceChurnRecord>()
    for (const db of input.sourceDbs) {
      let cursor: { sourceRecordId: string; versionHash: string } | undefined
      for (;;) {
        const rows = await db
          .select({
            sourceRecordId: table.sourceRecordId,
            versionHash: table.versionHash,
            properties: table.properties,
            geometryId: table.geometryId,
          })
          .from(table)
          .where(
            and(
              eq(table.datasetCode, input.datasetCode),
              eq(table.resourceReleaseId, id),
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
          // Geometry IDs are hashes of the immutable publisher geometry JSON.
          const value = {
            properties: row.properties,
            sourceGeometry: { geometryId: row.geometryId },
          }
          const existing = records.get(row.sourceRecordId)
          if (existing && !equalJson(existing, value))
            throw new Error(
              `Ambiguous C&SD source identity at ${id}: ${row.sourceRecordId}`,
            )
          records.set(row.sourceRecordId, value)
        }
        if (rows.length < 1000) break
        cursor = rows.at(-1)!
      }
    }
    return records
  }
  const current = await read(input.resourceReleaseId)
  if (current.size !== input.expectedRecords)
    throw new Error(
      `Expected ${input.expectedRecords} retained C&SD records for ${input.resourceReleaseId}; found ${current.size}`,
    )
  const before = previous
    ? await read(previous.id)
    : new Map<string, SourceChurnRecord>()
  if (previous) {
    const stats = metaSchema.stats
    const expected = await input.metaDb
      .select({ value: stats.value })
      .from(stats)
      .where(
        and(
          eq(stats.resourceReleaseId, previous.id),
          eq(stats.category, 'records'),
          eq(stats.measure, 'count'),
          isNull(stats.dimension),
        ),
      )
      .get()
    if (expected ? before.size !== expected.value : !before.size)
      throw new Error(`Incomplete retained C&SD records for predecessor ${previous.id}`)
  }
  const { totals } = buildSourceChurnCounts(before, current)
  return buildChurnStatsRows({ totals, byType: new Map() })
}
