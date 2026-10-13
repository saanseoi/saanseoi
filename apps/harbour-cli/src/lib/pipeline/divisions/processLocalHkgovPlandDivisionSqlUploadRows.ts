import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  replaceDivisionCurrentI18n,
  upsertDivisionCurrentStates,
} from '@repo/core/pipeline/db/division'
import { recordHistoryDeletions } from '@repo/core/pipeline/db/historyDeletions'
import { retainSourceProperties } from '@repo/core/pipeline/services/sources/retainedProperties'
import { nativeSourcePayloadHashInput } from '@repo/core/pipeline/services/sources/sourcePayload'
import {
  compressJsonBrotli,
  MAX_BROTLI_QUALITY,
} from '@repo/core/pipeline/services/storage/brotliJson'
import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
} from '@repo/core/pipeline/utils'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { and, eq, inArray } from 'drizzle-orm'
import type {
  CompressedPlanningDivisionGeometry,
  HkgovPlandDivisionUploadPlan,
  PreparedDivision,
} from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'

export async function replaceCurrentSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  records: PreparedDivision[],
  compressedGeometryByDivisionId: CompressedPlanningDivisionGeometry,
  now: string,
  reportProgress: (current: number) => void,
) {
  const incomingIds = new Set(records.map(record => record.base.id))
  // Independent cohorts have no history parent but replace the same projection.
  const currentRows = await db
    .select({ id: currentSchema.divisions.id })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshotId))
    .all()
  const providerIds = currentRows.map(row => row.id).filter(id => !incomingIds.has(id))
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
    await upsertDivisionCurrentStates(
      db,
      snapshotId,
      chunk.map(record => ({
        ...record.base,
        geometry: requireCompressedPlanningDivisionGeometry(
          compressedGeometryByDivisionId,
          record.base.id,
        ),
        createdAt: now,
        updatedAt: now,
      })),
    )
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
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  records: PreparedDivision[],
  now: string,
  reportProgress: (current: number) => void,
) {
  const currentRows = await db
    .select({ id: currentSchema.divisionsI18n.divisionId })
    .from(currentSchema.divisionsI18n)
    .where(eq(currentSchema.divisionsI18n.snapshotId, snapshotId))
    .all()
  const ids = [
    ...new Set([
      ...currentRows.map(row => row.id),
      ...records.map(record => record.base.id),
    ]),
  ]
  const rows = records.flatMap(record =>
    record.i18n.map(item => ({
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
  await replaceDivisionCurrentI18n(db, snapshotId, ids, rows)
  reportProgress(rows.length)
}

export async function insertHistoryRows(
  db: HarbourWritableDb,
  snapshotId: string,
  resourceReleaseId: string,
  _cohortKey: string,
  records: PreparedDivision[],
  compressedGeometryByDivisionId: CompressedPlanningDivisionGeometry,
  now: string,
  reportProgress: (current: number) => void,
) {
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
          sourceReleaseId: resourceReleaseId,
          snapshotId,
          isCurrent: true,
          createdAt: now,
        })),
      )
      .onConflictDoNothing({
        target: [historySchema.divisions.id, historySchema.divisions.snapshotId],
      })
      .run()
    processedRecords += chunk.length
    reportProgress(processedRecords)
  }
}

export async function insertHistoryI18nRows(
  db: HarbourWritableDb,
  snapshotId: string,
  resourceReleaseId: string,
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
      sourceReleaseId: resourceReleaseId,
      snapshotId,
      isCurrent: true,
      createdAt: now,
    })),
  )
  let processedRows = 0
  for (const chunk of chunkArray(rows, 6)) {
    await db
      .insert(historySchema.divisionsI18n)
      .values(chunk)
      .onConflictDoNothing({
        target: [
          historySchema.divisionsI18n.divisionId,
          historySchema.divisionsI18n.snapshotId,
          historySchema.divisionsI18n.locale,
        ],
      })
      .run()
    processedRows += chunk.length
    reportProgress(records.length + processedRows)
  }
}

export async function insertSourceRows(
  db: HarbourWritableDb,
  resourceReleaseId: string,
  sourceVersion: string,
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
        properties: retainSourceProperties(cell.properties),
        sourceGeometry: cell.sourceGeometry,
        versionHash: await createHash(nativeSourcePayloadHashInput(cell)),
        resourceReleaseId,
        validFromRelease: sourceVersion,
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
            sourceSchema.sourceHkgovPlandPlanningCells.validFromRelease,
          ],
          set: sourceVersionConflictUpdate(resourceReleaseId, sourceVersion, now),
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
      properties: retainSourceProperties(town.properties),
      sourceGeometry: town.sourceGeometry,
      versionHash: await createHash(nativeSourcePayloadHashInput(town)),
      resourceReleaseId,
      validFromRelease: sourceVersion,
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
          sourceSchema.sourceHkgovPlandNewTowns.validFromRelease,
        ],
        set: sourceVersionConflictUpdate(resourceReleaseId, sourceVersion, now),
      })
      .run()
    processedRows += chunk.length
    reportProgress(processedRows)
  }
}

function sourceVersionConflictUpdate(
  resourceReleaseId: string,
  sourceVersion: string,
  now: string,
) {
  return {
    isCurrent: true,
    resourceReleaseId,
    validFromRelease: sourceVersion,
    validToRelease: null,
    updatedAt: now,
  }
}

export async function closeHistoryRows(
  db: HarbourWritableDb,
  ids: string[],
  snapshotId: string,
  _cohortKey: string,
  _now: string,
) {
  await recordHistoryDeletions(db, {
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
  sourceVersion: string,
  now: string,
) {
  for (const chunk of chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 4))) {
    if (chunk.length === 0) continue
    await db
      .update(table)
      .set({ isCurrent: false, validToRelease: sourceVersion, updatedAt: now })
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
  category: string,
  measure: string,
  value: number,
  dimensionValue: string,
) {
  return {
    category,
    measure,
    unit: 'rows',
    value,
    dimension: 'source',
    dimensionValue,
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
