import { nativeSourcePayloadHashInput } from '@repo/core/pipeline/services/sources/sourcePayload'
import {
  recordSourceResolutions,
  resolvedEntities,
} from '@repo/core/pipeline/db/sourceResolutions'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { recordSnapshotVersionChanges } from '@repo/core/pipeline/db/snapshotVersionChanges'
import {
  hashDivisionGeometryRow,
  hashDivisionGeometrySourceRow,
} from '@repo/core/pipeline/services/divisions/divisionGeometry'
import {
  compressJsonBrotli,
  MAX_BROTLI_QUALITY,
} from '@repo/core/pipeline/services/storage/brotliJson.ts'
import { toIsoTimestamp } from '@repo/db'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { and, eq, sql } from 'drizzle-orm'
import type { AnySQLiteColumn, AnySQLiteTable } from 'drizzle-orm/sqlite-core'
import type { resolveLocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import type {
  GeometryUploadPlan,
  GeometryWriteProgress,
  NormalisedGeometry,
} from './processLocalDivisionGeometrySqlUploadTypes.ts'
import {
  createGeometryChurnCounts,
  getGeometryChurnBaseline,
  shouldCompressCanonicalGeometry,
} from './processLocalDivisionGeometrySqlUploadStatistics.ts'
import { requireString } from './processLocalDivisionGeometrySqlUploadPreparation.ts'

export async function writeGeometryRows(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  resourceType: GeometryUploadPlan['resourceType'],
  rows: Array<NonNullable<NormalisedGeometry>>,
  version: {
    publisherRows?: Array<NonNullable<NormalisedGeometry>>
    source: GeometryUploadPlan['source']
    variant: string
    releaseId: string
    releaseCode: string
    snapshotId: string
    parentSnapshotId: string | null
    cohortKey: string
    merge?: boolean
    /**
     * The source release is independently retained, but its complete canonical
     * materialisation has already been verified against this snapshot.
     */
    skipCanonicalMaterialisation?: boolean
    transform?: GeometryUploadPlan['transform']
  },
  onProgress?: GeometryWriteProgress,
) {
  const publisherRows = version.publisherRows ?? rows
  const now = toIsoTimestamp()
  const currentTable =
    resourceType === 'divisionArea'
      ? currentSchema.divisionAreas
      : currentSchema.divisionBoundaries
  const historyTable =
    resourceType === 'divisionArea'
      ? historySchema.divisionAreas
      : historySchema.divisionBoundaries
  const sourceTable =
    resourceType === 'divisionArea'
      ? version.source === 'hkgov-had'
        ? sourceSchema.sourceHkgovHadDivisionAreas
        : version.source === 'hkgov-censtatd'
          ? sourceSchema.sourceHkgovCenstatdDivisionAreas
          : sourceSchema.sourceOvertureDivisionAreas
      : sourceSchema.sourceOvertureDivisionBoundaries
  const isDisplayDerivative = version.transform === 'simplified'
  const isCenstatdDerivative =
    version.source === 'hkgov-censtatd' && isDisplayDerivative
  // Statistics archive geometries are already retained in
  // hkgovCenstatdStatistics; do not duplicate Area/HMA assertions in the
  // district-boundary source table.
  const isCenstatdStatisticGeometry =
    version.source === 'hkgov-censtatd' &&
    rows.some(
      row =>
        !(
          row.source.rawProperties &&
          typeof row.source.rawProperties === 'object' &&
          !Array.isArray(row.source.rawProperties) &&
          'dc_class' in row.source.rawProperties
        ),
    )
  onProgress?.(
    version.skipCanonicalMaterialisation
      ? 'retain verified geometry snapshot'
      : version.merge
        ? 'retain companion rows'
        : 'clear current rows',
  )
  if (!version.merge && !version.skipCanonicalMaterialisation) {
    await context.currentDb
      .delete(currentTable)
      // The current-table key is `(snapshotId, id)`, not `(snapshotId, variant, id)`.
      // A snapshot therefore represents exactly one geometry variant. Clear the full
      // snapshot so a retry also replaces rows written before a variant was renamed
      // (for example the legacy `hkgov-censtatd` C&SD variant).
      .where(eq(currentTable.snapshotId, version.snapshotId))
      .run()
  }
  const historyHashes = new Map<string, string>()
  const sourceHashes = new Map<string, string>()
  onProgress?.('hash geometry rows', 0, rows.length)
  for (const [index, row] of rows.entries()) {
    historyHashes.set(row.canonical.id, await hashDivisionGeometryRow(row.canonical))
    if ((index + 1) % 32 === 0 || index + 1 === rows.length) {
      onProgress?.('hash geometry rows', index + 1, rows.length)
    }
  }
  for (const row of publisherRows) {
    if (
      !isDisplayDerivative &&
      !isCenstatdStatisticGeometry &&
      version.source !== 'hkgov-pland-pu' &&
      version.source !== 'hkgov-pland-new-town'
    ) {
      sourceHashes.set(
        row.source.sourceRecordId,
        await hashGeometrySourceAssertion(row.source, version.source),
      )
    }
  }
  // Churn is a property of the snapshot lineage, not of the mutable history
  // cache. In particular, independent C&SD census cohorts have no parent and
  // must therefore start with an empty baseline rather than compare against
  // whichever geometry snapshot was most recently written.
  const previousById = version.skipCanonicalMaterialisation
    ? new Map(
        rows.map(row => [
          row.canonical.id,
          {
            id: row.canonical.id,
            type: row.canonical.type,
            versionHash: requireGeometryHash(historyHashes, row.canonical.id),
          },
        ]),
      )
    : await getGeometryChurnBaseline(
        context.currentDb,
        resourceType,
        version.parentSnapshotId,
      )
  const churn = createGeometryChurnCounts(rows, historyHashes, previousById, {
    merge: version.merge,
  })
  onProgress?.('close history rows')
  const closedHistoryRows =
    version.merge || version.skipCanonicalMaterialisation
      ? []
      : await closeChangedRows(
          context.historyDb,
          historyTable,
          historyTable.id,
          historyHashes,
          {
            isCurrent: false,
          },
        )
  if (!version.skipCanonicalMaterialisation) {
    await recordSnapshotVersionChanges(
      context.historyDb as unknown as HarbourWritableDb,
      {
        snapshotId: version.snapshotId,
        sourceReleaseId: version.releaseId,
        recordType: resourceType,
        operation: 'delete',
        changes: closedHistoryRows.map(row => ({ recordId: row.id })),
      },
    )
  }
  onProgress?.('close source rows')
  if (
    !isDisplayDerivative &&
    !isCenstatdStatisticGeometry &&
    version.source !== 'hkgov-pland-pu' &&
    version.source !== 'hkgov-pland-new-town'
  ) {
    await closeChangedRows(
      context.sourceDb,
      sourceTable,
      sourceTable.sourceRecordId,
      sourceHashes,
      { isCurrent: false, validToRelease: version.releaseCode },
    )
  }
  onProgress?.('build write batches')
  const inheritedCurrentRows =
    !version.skipCanonicalMaterialisation && version.merge && version.parentSnapshotId
      ? await context.currentDb
          .select()
          .from(currentTable)
          .where(eq(currentTable.snapshotId, version.parentSnapshotId))
          .all()
      : []
  const currentRowsById = new Map<string, Record<string, unknown>>(
    inheritedCurrentRows.map(row => [
      row.id,
      { ...row, snapshotId: version.snapshotId },
    ]),
  )
  const materialisedGeometryById = new Map<string, unknown>()
  if (!version.skipCanonicalMaterialisation) {
    onProgress?.('materialise geometry rows', 0, rows.length)
    for (const [index, row] of rows.entries()) {
      materialisedGeometryById.set(
        row.canonical.id,
        shouldCompressCanonicalGeometry(version.source, version.transform)
          ? compressJsonBrotli(
              row.canonical.geometry,
              version.source === 'hkgov-pland-pu' && version.transform === undefined
                ? MAX_BROTLI_QUALITY
                : undefined,
            )
          : row.canonical.geometry,
      )
      if ((index + 1) % 32 === 0 || index + 1 === rows.length) {
        onProgress?.('materialise geometry rows', index + 1, rows.length)
      }
    }
  }
  if (!version.skipCanonicalMaterialisation)
    for (const row of rows.map(row => ({
      ...row.canonical,
      geometry: requireMaterialisedGeometry(materialisedGeometryById, row.canonical.id),
      snapshotId: version.snapshotId,
      createdAt: now,
      updatedAt: now,
    }))) {
      currentRowsById.set(row.id, row)
    }
  const currentRows = [...currentRowsById.values()]
  const inheritedHistoryRows =
    !version.skipCanonicalMaterialisation && version.merge && version.parentSnapshotId
      ? await context.historyDb
          .select()
          .from(historyTable)
          .where(eq(historyTable.snapshotId, version.parentSnapshotId))
          .all()
      : []
  const historyRowsById = new Map<string, Record<string, unknown>>(
    inheritedHistoryRows.map(row => [
      row.id,
      { ...row, snapshotId: version.snapshotId },
    ]),
  )
  if (!version.skipCanonicalMaterialisation)
    for (const row of rows.map(row => ({
      ...row.canonical,
      geometry: requireMaterialisedGeometry(materialisedGeometryById, row.canonical.id),
      versionHash: requireGeometryHash(historyHashes, row.canonical.id),
      sourceReleaseId: version.releaseId,
      snapshotId: version.snapshotId,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    }))) {
      historyRowsById.set(row.id, row)
    }
  await recordSourceResolutions(
    context.historyDb as unknown as HarbourWritableDb,
    publisherRows.flatMap(row => {
      const sourceVersionHash = sourceHashes.get(row.source.sourceRecordId)
      if (!sourceVersionHash) return []
      const canonical = (rows.find(
        candidate => candidate.canonical.id === row.canonical.id,
      )?.canonical ??
        rows.find(
          candidate =>
            'divisionId' in candidate.canonical &&
            'divisionId' in row.canonical &&
            candidate.canonical.divisionId === row.canonical.divisionId,
        )?.canonical ??
        row.canonical) as Record<string, unknown>
      return [
        {
          snapshotId: version.snapshotId,
          sourceReleaseId: version.releaseId,
          sourceRecordId: row.source.sourceRecordId,
          sourceVersionHash,
          resolutions: {
            entities: resolvedEntities({
              [resourceType]: canonical.id,
              division: canonical.divisionId,
              leftDivision: canonical.leftDivisionId,
              rightDivision: canonical.rightDivisionId,
            }),
          },
        },
      ]
    }),
  )
  const historyRows = [...historyRowsById.values()]
  const sourceRows =
    isDisplayDerivative ||
    isCenstatdStatisticGeometry ||
    version.source === 'hkgov-pland-pu' ||
    version.source === 'hkgov-pland-new-town'
      ? []
      : await Promise.all(
          publisherRows.map(async row => {
            const { sourceGeometry, ...sourceWithProvenance } = row.source
            const sourceAssertion = sourceWithProvenance
            return {
              ...sourceAssertion,
              ...(version.source === 'hkgov-had'
                ? {
                    sourceGeometry,
                  }
                : version.source === 'hkgov-censtatd'
                  ? {
                      censusYear: version.cohortKey,
                      sourceGeometry: compressJsonBrotli(sourceGeometry),
                    }
                  : { sourceGeometry }),
              versionHash: requireGeometryHash(sourceHashes, row.source.sourceRecordId),
              releaseId: version.releaseId,
              validFromRelease: version.releaseCode,
              validToRelease: null,
              isCurrent: true,
              createdAt: now,
              updatedAt: now,
            }
          }),
        )

  let writtenCurrentRows = 0
  onProgress?.('write current rows', writtenCurrentRows, currentRows.length)
  for (const chunk of chunkRows(currentRows)) {
    await context.currentDb
      .insert(currentTable)
      .values(chunk as never)
      .onConflictDoUpdate({
        target: [currentTable.snapshotId, currentTable.id],
        set: {
          bbox: sql`excluded.bbox`,
          geometry: sql`excluded.geometry`,
          isLand: sql`excluded.isLand`,
          isTerritorial: sql`excluded.isTerritorial`,
          identifiers: sql`excluded.identifiers`,
          sources: sql`excluded.sources`,
          type: sql`excluded.type`,
          variant: sql`excluded.variant`,
          updatedAt: now,
        },
      })
      .run()
    writtenCurrentRows += chunk.length
    onProgress?.('write current rows', writtenCurrentRows, currentRows.length)
  }
  if (!version.skipCanonicalMaterialisation && historyRows.length) {
    let writtenHistoryRows = 0
    onProgress?.('write history rows', writtenHistoryRows, historyRows.length)
    for (const chunk of chunkRows(historyRows)) {
      await context.historyDb
        .insert(historyTable)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: [historyTable.id, historyTable.versionHash],
          setWhere: sql`isCurrent <> 1`,
          set: {
            sourceReleaseId: version.releaseId,
            snapshotId: version.snapshotId,
            isCurrent: true,
            updatedAt: now,
          },
        })
        .run()
      writtenHistoryRows += chunk.length
      onProgress?.('write history rows', writtenHistoryRows, historyRows.length)
    }
    await recordSnapshotVersionChanges(
      context.historyDb as unknown as HarbourWritableDb,
      {
        snapshotId: version.snapshotId,
        sourceReleaseId: version.releaseId,
        recordType: resourceType,
        operation: 'upsert',
        changes: historyRows.map(row => ({
          recordId: requireString(row.id, 'history row id'),
          versionHash: requireString(row.versionHash, 'history row versionHash'),
        })),
      },
    )
  }
  if (sourceRows.length) {
    let writtenSourceRows = 0
    onProgress?.('write source rows', writtenSourceRows, sourceRows.length)
    for (const chunk of chunkRows(sourceRows)) {
      await context.sourceDb
        .insert(sourceTable)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: [sourceTable.sourceRecordId, sourceTable.versionHash],
          setWhere: sql`isCurrent <> 1 OR validToRelease IS NOT NULL`,
          set: {
            releaseId: version.releaseId,
            validToRelease: null,
            isCurrent: true,
            updatedAt: now,
          },
        })
        .run()
      writtenSourceRows += chunk.length
      onProgress?.('write source rows', writtenSourceRows, sourceRows.length)
    }
  }
  if (isCenstatdDerivative && !isCenstatdStatisticGeometry) {
    await writeCenstatdSourceDerivatives(
      context.sourceDb as unknown as HarbourReadableDb & HarbourWritableDb,
      rows,
      version,
      now,
      historyHashes,
    )
  }

  return { churn }
}

function requireGeometryHash(hashes: Map<string, string>, id: string) {
  const hash = hashes.get(id)
  if (!hash) throw new Error(`Missing computed geometry hash for ${id}.`)
  return hash
}

function requireMaterialisedGeometry(
  materialisedGeometryById: ReadonlyMap<string, unknown>,
  id: string,
) {
  const geometry = materialisedGeometryById.get(id)
  if (geometry === undefined) {
    throw new Error(`Missing materialised geometry for ${id}.`)
  }
  return geometry
}

function hashGeometrySourceAssertion(
  row: NonNullable<NormalisedGeometry>['source'],
  source: GeometryUploadPlan['source'],
) {
  if (source === 'overture') return hashDivisionGeometrySourceRow(row)
  return hashDivisionGeometrySourceRow(
    nativeSourcePayloadHashInput({
      rawProperties: row.rawProperties,
      sourceGeometry: row.sourceGeometry,
    }),
  )
}

async function writeCenstatdSourceDerivatives(
  db: HarbourReadableDb & HarbourWritableDb,
  rows: Array<NonNullable<NormalisedGeometry>>,
  version: {
    cohortKey: string
    releaseId: string
    releaseCode: string
    transform?: 'simplified'
  },
  now: string,
  historyHashes: Map<string, string>,
) {
  const transform = version.transform
  if (!transform) {
    throw new Error('C&SD derivative write requires a named transform.')
  }

  const sources = sourceSchema.sourceHkgovCenstatdDivisionAreas
  const derivatives = sourceSchema.sourceHkgovCenstatdDivisionAreaDerivatives
  const exactRows = await db
    .select({
      censusYear: sources.censusYear,
      sourceRecordId: sources.sourceRecordId,
      versionHash: sources.versionHash,
    })
    .from(sources)
    .where(eq(sources.isCurrent, true))
    .all()
  const exactHashByRecordAndCohort = new Map(
    exactRows.map(row => [`${row.sourceRecordId}:${row.censusYear}`, row.versionHash]),
  )
  const nextHashes = new Map<string, string>()
  const derivativeRows = await Promise.all(
    rows.map(async row => {
      const censusYear = version.cohortKey
      const inputVersionHash = exactHashByRecordAndCohort.get(
        `${row.source.sourceRecordId}:${censusYear}`,
      )
      if (!inputVersionHash) {
        throw new Error(
          `C&SD derivative ${row.source.sourceRecordId} (${censusYear}) requires its exact source record to be ingested first.`,
        )
      }
      const derivation = row.source.derivation
      if (!derivation) {
        throw new Error(
          `C&SD derivative ${row.source.sourceRecordId} has no derivation metadata.`,
        )
      }
      const versionHash = requireGeometryHash(historyHashes, row.canonical.id)
      nextHashes.set(`${row.source.sourceRecordId}:${inputVersionHash}`, versionHash)
      return {
        sourceRecordId: row.source.sourceRecordId,
        inputVersionHash,
        transform,
        derivation,
        geometry: row.canonical.geometry,
        bbox: row.canonical.bbox,
        versionHash,
        releaseId: version.releaseId,
        validFromRelease: version.releaseCode,
        validToRelease: null,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      }
    }),
  )

  const currentDerivatives = await db
    .select({
      inputVersionHash: derivatives.inputVersionHash,
      sourceRecordId: derivatives.sourceRecordId,
      versionHash: derivatives.versionHash,
    })
    .from(derivatives)
    .where(and(eq(derivatives.isCurrent, true), eq(derivatives.transform, transform)))
    .all()
  for (const derivative of currentDerivatives) {
    const key = `${derivative.sourceRecordId}:${derivative.inputVersionHash}`
    // This upload covers one census cohort. Other cohorts may use the same
    // C&SD district record IDs, so only supersede a derivative of an exact
    // source record represented in this upload.
    if (!nextHashes.has(key)) continue
    if (nextHashes.get(key) === derivative.versionHash) continue
    await db
      .update(derivatives)
      .set({ isCurrent: false, validToRelease: version.releaseCode })
      .where(
        and(
          eq(derivatives.sourceRecordId, derivative.sourceRecordId),
          eq(derivatives.inputVersionHash, derivative.inputVersionHash),
          eq(derivatives.transform, transform),
          eq(derivatives.versionHash, derivative.versionHash),
          eq(derivatives.isCurrent, true),
        ),
      )
      .run()
  }
  for (const chunk of chunkRows(derivativeRows)) {
    await db
      .insert(derivatives)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          derivatives.sourceRecordId,
          derivatives.inputVersionHash,
          derivatives.transform,
          derivatives.versionHash,
        ],
        setWhere: sql`isCurrent <> 1 OR validToRelease IS NOT NULL`,
        set: {
          releaseId: version.releaseId,
          validToRelease: null,
          isCurrent: true,
          updatedAt: now,
        },
      })
      .run()
  }
}

function chunkRows<T>(rows: T[], size = 32) {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

async function closeChangedRows(
  db: unknown,
  table: AnySQLiteTable & {
    isCurrent: AnySQLiteColumn
    versionHash: AnySQLiteColumn
  },
  idColumn: AnySQLiteColumn<{ data: string }>,
  currentHashes: Map<string, string>,
  values: Record<string, unknown>,
) {
  const typedDb = db as unknown as HarbourReadableDb & HarbourWritableDb
  const existing = await typedDb
    .select({ id: idColumn, versionHash: table.versionHash })
    .from(table)
    .where(eq(table.isCurrent, true))
    .all()
  const closedRows: Array<{ id: string; versionHash: string }> = []
  for (const row of existing) {
    const id = requireString(row.id, 'current row id')
    const versionHash = requireString(row.versionHash, 'current row versionHash')
    if (currentHashes.get(id) === versionHash) continue
    await typedDb
      .update(table)
      .set(values)
      .where(
        and(
          eq(idColumn, id),
          eq(table.versionHash, versionHash),
          eq(table.isCurrent, true),
        ),
      )
      .run()
    closedRows.push({ id, versionHash })
  }
  return closedRows
}
