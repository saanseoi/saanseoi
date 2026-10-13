import { and, desc, eq, gt, inArray, isNull, lt, lte, or } from 'drizzle-orm'
import { metaSchema, sourceSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  buildSourceChurnCounts,
  type SourceChurnRecord,
} from '@repo/core/pipeline/services/sources/sourceChurn'
import { decompressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson'

/** Source summaries use retained publisher content, independently of canonical geometry. */
export async function geometrySourceChurn(
  meta: HarbourReadableDb,
  sources: readonly HarbourReadableDb[],
  resourceReleaseId: string,
  resourceType: 'divisionArea' | 'divisionBoundary',
) {
  const releases = metaSchema.metaResourceReleaseDetails
  const release = await meta
    .select({ datasetId: releases.datasetId, version: releases.sourceVersion })
    .from(releases)
    .where(eq(releases.id, resourceReleaseId))
    .get()
  if (!release) throw new Error(`Missing source release ${resourceReleaseId}`)
  const previous = await meta
    .select({ version: releases.sourceVersion })
    .from(releases)
    .where(
      and(
        eq(releases.datasetId, release.datasetId),
        eq(releases.resourceType, resourceType),
        lt(releases.sourceVersion, release.version),
        inArray(releases.status, ['current', 'archived']),
        isNull(releases.revokedAt),
      ),
    )
    .orderBy(desc(releases.sourceVersion))
    .limit(1)
    .get()
  const table =
    resourceType === 'divisionArea'
      ? sourceSchema.sourceOvertureDivisionAreas
      : sourceSchema.sourceOvertureDivisionBoundaries
  async function snapshot(version?: string) {
    const records = new Map<string, SourceChurnRecord & { versionHash: string }>()
    if (!version) return records
    for (const source of sources) {
      const rows = await source
        .select({
          sourceRecordId: table.sourceRecordId,
          versionHash: table.versionHash,
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
        const existing = records.get(row.sourceRecordId)
        if (existing && existing.versionHash !== row.versionHash)
          throw new Error(
            `Ambiguous source history at ${version}: ${row.sourceRecordId}`,
          )
        records.set(row.sourceRecordId, {
          ...row,
          sourceGeometry: decompressJsonBrotli(row.sourceGeometry as Uint8Array),
        })
      }
    }
    if (!records.size)
      throw new Error(`Missing retained ${resourceType} records at ${version}`)
    return records
  }
  return buildSourceChurnCounts(
    await snapshot(previous?.version),
    await snapshot(release.version),
  )
}
