import type { HarbourWritableDb } from '@repo/core/db/types'
import { recordSourceResolutions } from '@repo/core/pipeline/db/sourceResolutions.ts'
import { nativeSourcePayloadHashInput } from '@repo/core/pipeline/services/sources/sourcePayload.ts'
import { createHash } from '@repo/core/pipeline/utils.ts'
import type { NewSourceResolution } from '@repo/db/historySchema'
import type { PreparedDivision } from './processLocalHkgovPlandDivisionSqlUploadTypes'

/** Resolve complete publisher assertions against the complete prepared inventory. */
export async function planningSourceResolutions(
  snapshotId: string,
  sourceReleaseId: string,
  records: PreparedDivision[],
  omitted: Array<{ sourceRecordId: string; versionHash: string }> = [],
): Promise<NewSourceResolution[]> {
  const divisionsByCell = new Map<string, Set<string>>()
  for (const record of records) {
    const ids =
      typeof record.sourceCellIds === 'string'
        ? JSON.parse(record.sourceCellIds)
        : record.sourceCellIds
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id))
      throw new Error(`Invalid Planning cell membership for ${record.base.id}.`)
    for (const id of ids) {
      const divisions = divisionsByCell.get(id) ?? new Set<string>()
      divisions.add(record.base.id)
      divisionsByCell.set(id, divisions)
    }
  }
  const rows = new Map<string, NewSourceResolution>()
  for (const record of records) {
    for (const source of [
      ...record.cells,
      ...(record.newTown ? [record.newTown] : []),
    ]) {
      const ids =
        'tpuCode' in source
          ? divisionsByCell.get(`PLAND:${source.tpuCode}:${source.subunitCode}`)
          : new Set([record.base.id])
      if (!ids?.has(record.base.id))
        throw new Error(
          `Missing Planning cell membership for ${source.sourceRecordId}.`,
        )
      const row: NewSourceResolution = {
        snapshotId,
        sourceReleaseId,
        sourceRecordId: source.sourceRecordId,
        sourceVersionHash: await createHash(nativeSourcePayloadHashInput(source)),
        resolutions: { entities: { division: [...ids].sort() } },
      }
      const previous = rows.get(source.sourceRecordId)
      if (previous && JSON.stringify(previous) !== JSON.stringify(row))
        throw new Error(`Conflicting Planning assertion ${source.sourceRecordId}.`)
      rows.set(source.sourceRecordId, row)
    }
  }
  const covered = new Set(
    [...rows.values()].flatMap(row => row.resolutions.entities.division ?? []),
  )
  for (const record of records)
    if (!covered.has(record.base.id))
      throw new Error(`Missing Planning source evidence for ${record.base.id}.`)
  for (const source of omitted) {
    if (rows.has(source.sourceRecordId))
      throw new Error(
        `Planning assertion is both selected and omitted: ${source.sourceRecordId}.`,
      )
    rows.set(source.sourceRecordId, {
      snapshotId,
      sourceReleaseId,
      sourceRecordId: source.sourceRecordId,
      sourceVersionHash: source.versionHash,
      resolutions: { entities: {}, decisions: [{ type: 'source_omission' }] },
    })
  }
  return [...rows.values()]
}

export async function recordPlanningSourceResolutions(
  db: HarbourWritableDb,
  snapshotId: string,
  sourceReleaseId: string,
  records: PreparedDivision[],
  omitted: Array<{ sourceRecordId: string; versionHash: string }> = [],
) {
  await recordSourceResolutions(
    db,
    await planningSourceResolutions(snapshotId, sourceReleaseId, records, omitted),
  )
}
