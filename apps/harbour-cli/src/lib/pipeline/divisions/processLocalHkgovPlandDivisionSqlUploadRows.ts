import { and, eq, inArray } from 'drizzle-orm'
import { nativeSourcePayloadHashInput } from '@repo/core/pipeline/services/sourcePayload'
import { recordSourceResolutions } from '@repo/core/pipeline/db/sourceResolutions'
import type { NewSourceResolution } from '@repo/db/historySchema'
import type { HarbourWritableDb } from '@repo/core/db/types'
import { recordSnapshotVersionChanges } from '@repo/core/pipeline/db/snapshotVersionChanges'
import {
  compressJsonBrotli,
  MAX_BROTLI_QUALITY,
} from '@repo/core/pipeline/services/brotliJson'
import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
} from '@repo/core/pipeline/utils'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import type {
  CompressedPlanningDivisionGeometry,
  HkgovPlandDivisionUploadPlan,
  PreparedDivision,
} from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'

export async function replaceCurrentSnapshot(
  db: HarbourWritableDb,
  snapshotId: string,
  records: PreparedDivision[],
  compressedGeometryByDivisionId: CompressedPlanningDivisionGeometry,
  previousProviderIds: string[],
  now: string,
  reportProgress: (current: number) => void,
) {
  const providerIds = [
    ...new Set([...previousProviderIds, ...records.map(record => record.base.id)]),
  ]
  for (const chunk of chunkArray(providerIds, getMaxItemsPerInClause(1, 1))) {
    if (chunk.length === 0) continue
    await db
      .delete(currentSchema.divisions)
      .where(
        and(
          eq(currentSchema.divisions.snapshotId, snapshotId),
          inArray(currentSchema.divisions.id, chunk),
        ),
      )
      .run()
  }
  let processedRecords = 0
  for (const chunk of chunkArray(records, 6)) {
    await db
      .insert(currentSchema.divisions)
      .values(
        chunk.map(record => ({
          ...record.base,
          geometry: requireCompressedPlanningDivisionGeometry(
            compressedGeometryByDivisionId,
            record.base.id,
          ),
          snapshotId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run()
    processedRecords += chunk.length
    reportProgress(processedRecords)
  }
}

/**
 * Exact Planning geometry is retained in both current and history. Compress it
 * once before either table is written: the decoded GeoJSON and version hash are
 * unchanged, while maximum-quality Brotli is no longer repeated per table.
 */
export function compressPlanningDivisionGeometry(
  records: PreparedDivision[],
  reportProgress: (current: number) => void,
): CompressedPlanningDivisionGeometry {
  const compressedByDivisionId = new Map<string, Uint8Array>()
  for (const [index, record] of records.entries()) {
    compressedByDivisionId.set(
      record.base.id,
      compressJsonBrotli(record.base.geometry, MAX_BROTLI_QUALITY),
    )
    if ((index + 1) % 32 === 0 || index + 1 === records.length) {
      reportProgress(index + 1)
    }
  }
  return compressedByDivisionId
}

/** A source-keyed artefact cache is useful only when it covers every division. */
export function isCompleteCompressedPlanningDivisionGeometry(
  value: unknown,
  records: PreparedDivision[],
): value is CompressedPlanningDivisionGeometry {
  if (!(value instanceof Map) || value.size !== records.length) return false
  return records.every(record => value.get(record.base.id) instanceof Uint8Array)
}

function requireCompressedPlanningDivisionGeometry(
  compressedGeometryByDivisionId: CompressedPlanningDivisionGeometry,
  divisionId: string,
) {
  const geometry = compressedGeometryByDivisionId.get(divisionId)
  if (!geometry) {
    throw new Error(`Missing compressed Planning geometry for ${divisionId}.`)
  }
  return geometry
}

export async function replaceCurrentI18n(
  db: HarbourWritableDb,
  snapshotId: string,
  records: PreparedDivision[],
  previousProviderIds: string[],
  now: string,
  reportProgress: (current: number) => void,
) {
  const ids = [
    ...new Set([...previousProviderIds, ...records.map(record => record.base.id)]),
  ]
  for (const chunk of chunkArray(ids, getMaxItemsPerInClause(1, 1))) {
    if (chunk.length === 0) continue
    await db
      .delete(currentSchema.divisionsI18n)
      .where(
        and(
          eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
          inArray(currentSchema.divisionsI18n.divisionId, chunk),
        ),
      )
      .run()
  }
  const rows = records.flatMap(record =>
    record.i18n.map(item => ({
      snapshotId,
      divisionId: record.base.id,
      locale: item.locale,
      name: item.name,
      nameVariant: [item.name],
      nameAlts: null,
      nameRules: null,
      isLocaleInferred: false,
      createdAt: now,
      updatedAt: now,
    })),
  )
  let processedRows = 0
  for (const chunk of chunkArray(rows, 8)) {
    await db.insert(currentSchema.divisionsI18n).values(chunk).run()
    processedRows += chunk.length
    reportProgress(processedRows)
  }
}

export async function insertHistoryRows(
  db: HarbourWritableDb,
  snapshotId: string,
  releaseId: string,
  _cohortKey: string,
  records: PreparedDivision[],
  compressedGeometryByDivisionId: CompressedPlanningDivisionGeometry,
  now: string,
  reportProgress: (current: number) => void,
) {
  const resolutions = new Map<string, NewSourceResolution>()
  for (const record of records) {
    for (const source of [
      ...record.cells,
      ...(record.newTown ? [record.newTown] : []),
    ]) {
      let resolution = resolutions.get(source.sourceRecordId)
      if (!resolution) {
        resolution = {
          snapshotId,
          sourceReleaseId: releaseId,
          sourceRecordId: source.sourceRecordId,
          sourceVersionHash: await createHash(nativeSourcePayloadHashInput(source)),
          resolutions: { entities: { division: [] } },
        }
        resolutions.set(source.sourceRecordId, resolution)
      }
      resolution.resolutions.entities.division = [
        ...new Set([...resolution.resolutions.entities.division!, record.base.id]),
      ].sort()
    }
  }
  await recordSourceResolutions(db, [...resolutions.values()])
  let processedRecords = 0
  for (const chunk of chunkArray(records, 4)) {
    await db
      .insert(historySchema.divisions)
      .values(
        chunk.map(record => ({
          ...record.base,
          geometry: requireCompressedPlanningDivisionGeometry(
            compressedGeometryByDivisionId,
            record.base.id,
          ),
          versionHash: record.versionHash,
          sourceReleaseId: releaseId,
          snapshotId,
          isCurrent: true,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [historySchema.divisions.id, historySchema.divisions.versionHash],
        set: {
          isCurrent: true,
          snapshotId,
          sourceReleaseId: releaseId,
          updatedAt: now,
        },
      })
      .run()
    processedRecords += chunk.length
    reportProgress(processedRecords)
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId: releaseId,
    recordType: 'division',
    operation: 'upsert',
    changes: records.map(record => ({
      recordId: record.base.id,
      versionHash: record.versionHash,
    })),
  })
}

export async function insertHistoryI18nRows(
  db: HarbourWritableDb,
  snapshotId: string,
  releaseId: string,
  _cohortKey: string,
  records: PreparedDivision[],
  now: string,
  reportProgress: (current: number) => void,
) {
  const rows = records.flatMap(record =>
    record.i18n.map(item => ({
      divisionId: record.base.id,
      locale: item.locale,
      name: item.name,
      nameVariant: [item.name],
      nameAlts: null,
      nameRules: null,
      isLocaleInferred: false,
      versionHash: record.versionHash,
      sourceReleaseId: releaseId,
      snapshotId,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    })),
  )
  let processedRows = 0
  for (const chunk of chunkArray(rows, 6)) {
    await db
      .insert(historySchema.divisionsI18n)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          historySchema.divisionsI18n.divisionId,
          historySchema.divisionsI18n.versionHash,
          historySchema.divisionsI18n.locale,
        ],
        set: {
          isCurrent: true,
          snapshotId,
          sourceReleaseId: releaseId,
          updatedAt: now,
        },
      })
      .run()
    processedRows += chunk.length
    reportProgress(records.length + processedRows)
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId: releaseId,
    recordType: 'divisionI18n',
    operation: 'upsert',
    changes: rows.map(row => ({
      recordId: row.divisionId,
      locale: row.locale,
      versionHash: row.versionHash,
    })),
  })
}

export async function insertSourceRows(
  db: HarbourWritableDb,
  releaseId: string,
  releaseCode: string,
  records: Array<
    PreparedDivision['cells'][number] | NonNullable<PreparedDivision['newTown']>
  >,
  source: HkgovPlandDivisionUploadPlan['source'],
  now: string,
  reportProgress: (current: number) => void,
) {
  if (source === 'hkgov-pland-pu') {
    const cells = records as PreparedDivision['cells']
    const rows = await Promise.all(
      cells.map(async cell => ({
        sourceRecordId: cell.sourceRecordId,
        rawProperties: cell.rawProperties,
        wasGeometryRepaired: cell.wasGeometryRepaired,
        repairedGeometry: cell.repairedGeometry ?? null,
        sourceGeometry: cell.sourceGeometry,
        sources: [{ dataset: 'hkgov-pland-pu', layer: 'TPUSU' }],
        versionHash: await createHash(nativeSourcePayloadHashInput(cell)),
        releaseId,
        validFromRelease: releaseCode,
        validToRelease: null,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
    let processedRows = 0
    for (const chunk of chunkArray(rows, 4)) {
      await db
        .insert(sourceSchema.sourceHkgovPlandPlanningCells)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            sourceSchema.sourceHkgovPlandPlanningCells.sourceRecordId,
            sourceSchema.sourceHkgovPlandPlanningCells.versionHash,
          ],
          set: sourceVersionConflictUpdate(releaseId, releaseCode, now),
        })
        .run()
      processedRows += chunk.length
      reportProgress(processedRows)
    }
    return
  }

  const towns = records as Array<NonNullable<PreparedDivision['newTown']>>
  const rows = await Promise.all(
    towns.map(async town => ({
      sourceRecordId: town.sourceRecordId,
      rawProperties: town.rawProperties,
      sourceGeometry: town.sourceGeometry,
      wasGeometryRepaired: town.wasGeometryRepaired,
      repairedGeometry: town.repairedGeometry,
      sources: [{ dataset: 'hkgov-pland-new-town' }],
      versionHash: await createHash(nativeSourcePayloadHashInput(town)),
      releaseId,
      validFromRelease: releaseCode,
      validToRelease: null,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    })),
  )
  let processedRows = 0
  for (const chunk of chunkArray(rows, 4)) {
    await db
      .insert(sourceSchema.sourceHkgovPlandNewTowns)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovPlandNewTowns.sourceRecordId,
          sourceSchema.sourceHkgovPlandNewTowns.versionHash,
        ],
        set: sourceVersionConflictUpdate(releaseId, releaseCode, now),
      })
      .run()
    processedRows += chunk.length
    reportProgress(processedRows)
  }
}

function sourceVersionConflictUpdate(
  releaseId: string,
  releaseCode: string,
  now: string,
) {
  return {
    isCurrent: true,
    releaseId,
    validFromRelease: releaseCode,
    validToRelease: null,
    updatedAt: now,
  }
}

export async function closeHistoryRows(
  db: HarbourWritableDb,
  ids: string[],
  snapshotId: string,
  _cohortKey: string,
  now: string,
) {
  for (const chunk of chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 6))) {
    if (chunk.length === 0) continue
    await Promise.all([
      db
        .update(historySchema.divisions)
        .set({
          isCurrent: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisions.isCurrent, true),
            inArray(historySchema.divisions.id, chunk),
          ),
        )
        .run(),
      db
        .update(historySchema.divisionsI18n)
        .set({ isCurrent: false, updatedAt: now })
        .where(
          and(
            eq(historySchema.divisionsI18n.isCurrent, true),
            inArray(historySchema.divisionsI18n.divisionId, chunk),
          ),
        )
        .run(),
    ])
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    recordType: 'division',
    operation: 'delete',
    changes: [...new Set(ids)].map(recordId => ({ recordId })),
  })
}

export async function closeNativeSourceRows(
  db: HarbourWritableDb,
  table:
    | typeof sourceSchema.sourceHkgovPlandPlanningCells
    | typeof sourceSchema.sourceHkgovPlandNewTowns,
  ids: string[],
  releaseCode: string,
  now: string,
) {
  for (const chunk of chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 4))) {
    if (chunk.length === 0) continue
    await db
      .update(table)
      .set({ isCurrent: false, validToRelease: releaseCode, updatedAt: now })
      .where(and(eq(table.isCurrent, true), inArray(table.sourceRecordId, chunk)))
      .run()
  }
}

export function levelNumber(level: string) {
  switch (level) {
    case 'newtown':
    case 'ppu':
      return 3
    case 'spu':
      return 4
    case 'tpu':
      return 5
    case 'subunit':
      return 6
    default:
      throw new Error(`Unsupported Planning Department planning level ${level}.`)
  }
}

export function statRow(
  dimension: string,
  metric: string,
  value: number,
  groupValue: string,
) {
  return {
    type: 'division' as const,
    dimension,
    metric,
    metricUnit: 'rows',
    value,
    groupBy: 'source',
    groupValue,
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}.`)
  return value.trim()
}

export function requireValue(value: unknown, name: string) {
  if (value === null || value === undefined) throw new Error(`Missing ${name}.`)
  return value
}
