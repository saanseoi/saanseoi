import { sourceSchema } from '@repo/db'
import { and, gt, inArray, isNull, lte, or } from 'drizzle-orm'
import type { NewSourceResolution } from '@repo/db/historySchema'
import type { HarbourReadableDb } from '../../lib/db/types'
import { chunkArray, getMaxItemsPerInClause } from '../utils'

/** Resolve against retained native versions, never hash the canonical upload shape. */
export async function landsdPlaceNameResolutions(
  databases: readonly HarbourReadableDb[],
  sourceVersion: string,
  snapshotId: string,
  rows: Array<{ id: string; raw: Record<string, unknown> }>,
  sourceReleaseId: string,
): Promise<NewSourceResolution[]> {
  const table = sourceSchema.sourceHkgovLandsdPlaceNames
  const identities = rows.map(row => {
    const publisherId = row.raw.geo_name_id
    if (typeof publisherId !== 'string' || !publisherId.length)
      throw new Error(`Missing LandsD publisher identity for ${row.id}`)
    return { ...row, sourceRecordId: `LANDSD:PLACE_NAME:${publisherId}` }
  })
  const versions = new Map<
    string,
    { sourceRecordId: string; versionHash: string; releaseId: string }
  >()
  for (const database of databases) {
    for (const chunk of chunkArray(
      [...new Set(identities.map(row => row.sourceRecordId))],
      getMaxItemsPerInClause(1, 2),
    )) {
      const found = await database
        .select({
          sourceRecordId: table.sourceRecordId,
          versionHash: table.versionHash,
          releaseId: table.releaseId,
        })
        .from(table)
        .where(
          and(
            inArray(table.sourceRecordId, chunk),
            lte(table.validFromRelease, sourceVersion),
            or(isNull(table.validToRelease), gt(table.validToRelease, sourceVersion)),
          ),
        )
        .all()
      for (const record of found) {
        const previous = versions.get(record.sourceRecordId)
        if (previous && previous.versionHash !== record.versionHash)
          throw new Error(
            `Ambiguous retained LandsD source version: ${record.sourceRecordId}`,
          )
        versions.set(record.sourceRecordId, record)
      }
    }
  }
  return identities.map(row => {
    const source = versions.get(row.sourceRecordId)
    if (!source)
      throw new Error(
        `Missing retained LandsD source version: ${row.sourceRecordId} at ${sourceVersion}`,
      )
    return {
      snapshotId,
      sourceReleaseId,
      sourceRecordId: source.sourceRecordId,
      sourceVersionHash: source.versionHash,
      resolutions: { entities: { division: [row.id] } },
    }
  })
}
