import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { recordHistoryDeletions } from '@repo/core/pipeline/db/historyDeletions'
import {
  hashDivisionGeometryRow,
  hashDivisionGeometrySourceRow,
} from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { currentRowChangedSql } from '@repo/core/pipeline/services/publication/currentWrites.ts'
import { getPreparedPublication } from '@repo/core/pipeline/services/publication/execute.ts'
import {
  buildPublicationRowCountSql,
  type PublicationPreparation,
} from '@repo/core/pipeline/services/publication/sql.ts'
import {
  censtatdDerivativeRow,
  censtatdGeometryId,
  censtatdGeometryRow,
} from '@repo/core/pipeline/services/sources/censtatdGeometry'
import { nativeSourcePayloadHashInput } from '@repo/core/pipeline/services/sources/sourcePayload'
import { compressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson.ts'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils'
import { currentSchema, historySchema, sourceSchema, toIsoTimestamp } from '@repo/db'
import { and, eq, getTableColumns, inArray, lte, sql } from 'drizzle-orm'
import type { AnySQLiteColumn, AnySQLiteTable } from 'drizzle-orm/sqlite-core'
import type { resolveLocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import {
  assertPublishedSnapshotMaterialised,
  beginSnapshotPublication,
  completeSnapshotPublication,
  guardSnapshotPublicationWrites,
} from '../local/snapshotPublication.ts'
import { validateGeometryHistoryBaseline } from './geometryHistoryBaseline.ts'
import { requireString } from './processLocalDivisionGeometrySqlUploadPreparation.ts'
import {
  canonicalGeometryBrotliQuality,
  createGeometryChurnCounts,
  decodeStoredGeoJsonGeometry,
  getGeometryChurnBaseline,
  shouldCompressCanonicalGeometry,
} from './processLocalDivisionGeometrySqlUploadStatistics.ts'
import type {
  GeometryUploadPlan,
  GeometryWriteProgress,
  NormalisedGeometry,
} from './processLocalDivisionGeometrySqlUploadTypes.ts'
import { readGeometrySnapshot } from './readGeometrySnapshot.ts'

export async function writeGeometryRows(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  resourceType: GeometryUploadPlan['resourceType'],
  rows: Array<NonNullable<NormalisedGeometry>>,
  version: {
    datasetCode?: string
    publisherRows?: Array<NonNullable<NormalisedGeometry>>
    source: GeometryUploadPlan['source']
    variant: string
    resourceReleaseId: string
    releaseCode: string
    sourceVersion: string
    snapshotId: string
    snapshotLineageId: string
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
      ? version.source === 'saanseoi'
        ? sourceSchema.sourceSsDivisionArea
        : version.source === 'hkgov-had'
          ? sourceSchema.sourceHkgovHadDivisionAreas
          : version.source === 'hkgov-censtatd'
            ? sourceSchema.sourceHkgovCenstatdStatistics
            : sourceSchema.sourceOvertureDivisionAreas
      : sourceSchema.sourceOvertureDivisionBoundaries
  const publicationTable =
    resourceType === 'divisionArea'
      ? 'divisionAreaPublicationState'
      : 'divisionBoundaryPublicationState'
  const scopeId = JSON.stringify([version.snapshotLineageId, version.cohortKey])
  if (version.skipCanonicalMaterialisation)
    await assertPublishedSnapshotMaterialised(
      context.currentDb as unknown as HarbourReadableDb,
      publicationTable,
      version.snapshotId,
    )
  // Read before beginning publication: the scope receipt is replaced by this
  // revision, while historical parents are resolved from their journal branch.
  const parentRows =
    !version.skipCanonicalMaterialisation && version.parentSnapshotId
      ? await readGeometrySnapshot(context, resourceType, version.parentSnapshotId)
      : []
  const publication: PublicationPreparation | null =
    !version.skipCanonicalMaterialisation
      ? {
          table: publicationTable,
          scopeId,
          snapshotId: version.snapshotId,
          publicationToken: version.resourceReleaseId,
          timestamp: now,
        }
      : null
  const publicationDb = context.currentDb
  if (publication)
    publication.previous = await getPreparedPublication(
      publicationDb as never,
      publicationTable,
      scopeId,
    )
  const isDisplayDerivative = version.transform === 'simplified'
  const isCenstatdDerivative =
    version.source === 'hkgov-censtatd' && isDisplayDerivative
  onProgress?.(
    version.skipCanonicalMaterialisation
      ? 'retain verified geometry snapshot'
      : version.merge
        ? 'retain companion rows'
        : 'clear current rows',
  )
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
    : new Map(
        await Promise.all(
          parentRows.map(
            async row =>
              [
                row.id,
                {
                  id: row.id,
                  type: row.type,
                  versionHash:
                    row.versionHash ??
                    (await hashDivisionGeometryRow({
                      ...row,
                      geometry: decodeStoredGeoJsonGeometry(row.geometry),
                    })),
                },
              ] as const,
          ),
        ),
      )
  const currentBaseline = version.skipCanonicalMaterialisation
    ? new Map()
    : await getGeometryChurnBaseline(context.currentDb, resourceType, scopeId)
  if (version.parentSnapshotId && !version.skipCanonicalMaterialisation)
    await validateGeometryHistoryBaseline(
      context,
      resourceType,
      version.parentSnapshotId,
      previousById,
    )
  // Validate inheritance before preparing a receipt or mutating any database.
  if (publication) {
    await beginSnapshotPublication(publicationDb, publication)
    context = {
      ...context,
      currentDb: guardSnapshotPublicationWrites(publicationDb, publication),
    }
  }
  const nextIds = new Set([
    ...historyHashes.keys(),
    ...(version.merge ? previousById.keys() : []),
  ])
  const removedCurrentIds: string[] = !version.skipCanonicalMaterialisation
    ? [...currentBaseline.keys()].filter(id => !nextIds.has(id))
    : []
  for (const ids of chunkArray(removedCurrentIds, getMaxItemsPerInClause(1, 1))) {
    await context.currentDb
      .delete(currentTable)
      .where(and(eq(currentTable.scopeId, scopeId), inArray(currentTable.id, ids)))
      .run()
  }
  const churn = createGeometryChurnCounts(rows, historyHashes, previousById, {
    merge: version.merge,
  })
  onProgress?.('record geometry membership removals')
  // Content hashes can be shared by independent cohorts and variants. Only
  // snapshot membership changes; retained geometry versions are immutable.
  const removedHistoryIds =
    version.merge || version.skipCanonicalMaterialisation
      ? []
      : [...previousById.keys()].filter(id => !historyHashes.has(id))
  if (!version.skipCanonicalMaterialisation) {
    await recordHistoryDeletions(context.historyDb as unknown as HarbourWritableDb, {
      snapshotId: version.snapshotId,
      sourceReleaseId: version.resourceReleaseId,
      recordType: resourceType,
      operation: 'delete',
      changes: removedHistoryIds.map(recordId => ({ recordId })),
    })
  }
  // Repeated content can have disjoint validity periods (A -> B -> A).
  // Continue an open period only; never reopen a closed occurrence.
  const periodSource =
    !isDisplayDerivative &&
    !['hkgov-censtatd', 'hkgov-pland-pu', 'hkgov-pland-new-town'].includes(
      version.source,
    )
  const sourceDatabases = [
    context.sourceDb,
    ...(periodSource ? (context.sourceTargets ?? []) : [])
      .filter(target => target.db !== context.sourceDb)
      .map(target => target.db as typeof context.sourceDb),
  ]
  const periodsByDatabase = periodSource
    ? await Promise.all(
        sourceDatabases.map(async db => ({
          db,
          rows: await db
            .select({
              sourceRecordId: sourceTable.sourceRecordId,
              versionHash: sourceTable.versionHash,
              validFromRelease: sourceTable.validFromRelease,
            })
            .from(sourceTable)
            .where(
              and(
                eq(sourceTable.isCurrent, true),
                geometrySourceScope(sourceTable, version),
              ),
            )
            .all(),
        })),
      )
    : []
  const openSourcePeriods = periodsByDatabase.flatMap(periods => periods.rows)
  const inheritedSourcePeriods = new Set(
    periodsByDatabase
      .filter(periods => periods.db !== context.sourceDb)
      .flatMap(periods => periods.rows)
      .map(row => `${row.sourceRecordId}:${row.versionHash}`),
  )
  const sourcePeriodStarts = new Map(
    openSourcePeriods.map(row => [
      `${row.sourceRecordId}:${row.versionHash}`,
      row.validFromRelease,
    ]),
  )
  onProgress?.('close source rows')
  if (
    !isDisplayDerivative &&
    version.source !== 'hkgov-pland-pu' &&
    version.source !== 'hkgov-pland-new-town'
  ) {
    for (const sourceDb of sourceDatabases)
      await closeChangedRows(
        sourceDb,
        sourceTable,
        sourceTable.sourceRecordId,
        sourceHashes,
        { isCurrent: false, validToRelease: version.sourceVersion },
        geometrySourceScope(sourceTable, version),
        version.source === 'hkgov-censtatd',
      )
  }
  onProgress?.('build write batches')
  const inheritedCurrentRows =
    !version.skipCanonicalMaterialisation && version.merge && version.parentSnapshotId
      ? parentRows
      : []
  const currentRowsById = new Map<string, Record<string, unknown>>(
    inheritedCurrentRows.map(row => [row.id, { ...row, scopeId: scopeId }]),
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
              canonicalGeometryBrotliQuality(version.source),
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
      scopeId: scopeId,
      createdAt: now,
      updatedAt: now,
    }))) {
      currentRowsById.set(row.id, row)
    }
  const currentRows = [...currentRowsById.values()]
  const changedCurrentRows = currentRows.filter(
    row =>
      !currentBaseline.has(String(row.id)) ||
      currentBaseline.get(String(row.id))?.versionHash !==
        (historyHashes.get(String(row.id)) ??
          previousById.get(String(row.id))?.versionHash),
  )
  const changedCurrentIds = changedCurrentRows.map(row => String(row.id))
  // Merge membership is inherited by the journal replay; its content stays in
  // the shard that owns the parent's upsert instead of being copied forward.
  const historyRowsById = new Map<string, Record<string, unknown>>()
  if (!version.skipCanonicalMaterialisation)
    for (const row of rows
      .filter(
        row =>
          previousById.get(row.canonical.id)?.versionHash !==
          historyHashes.get(row.canonical.id),
      )
      .map(row => ({
        ...row.canonical,
        geometry: requireMaterialisedGeometry(
          materialisedGeometryById,
          row.canonical.id,
        ),
        versionHash: requireGeometryHash(historyHashes, row.canonical.id),
        sourceReleaseId: version.resourceReleaseId,
        snapshotId: version.snapshotId,
        isCurrent: true,
        createdAt: now,
      }))) {
      historyRowsById.set(row.id, row)
    }
  const historyRows = [...historyRowsById.values()]
  const sourceRows =
    isDisplayDerivative ||
    version.source === 'hkgov-pland-pu' ||
    version.source === 'hkgov-pland-new-town'
      ? []
      : await Promise.all(
          publisherRows
            .filter(
              row =>
                !inheritedSourcePeriods.has(
                  `${row.source.sourceRecordId}:${requireGeometryHash(sourceHashes, row.source.sourceRecordId)}`,
                ),
            )
            .map(async row => {
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
                        datasetCode: requireString(
                          version.datasetCode,
                          'C&SD datasetCode',
                        ),
                        sourceLocator: row.source.sourceLocator ?? null,
                        geometryId: censtatdGeometryId(sourceGeometry),
                      }
                    : {
                        sourceGeometry:
                          version.source === 'overture'
                            ? compressJsonBrotli(sourceGeometry)
                            : sourceGeometry,
                      }),
                versionHash: requireGeometryHash(
                  sourceHashes,
                  row.source.sourceRecordId,
                ),
                resourceReleaseId: version.resourceReleaseId,
                validFromRelease:
                  sourcePeriodStarts.get(
                    `${row.source.sourceRecordId}:${requireGeometryHash(sourceHashes, row.source.sourceRecordId)}`,
                  ) ?? version.sourceVersion,
                validToRelease: null,
                isCurrent: true,
                createdAt: now,
                updatedAt: now,
              }
            }),
        )

  let writtenCurrentRows = 0
  onProgress?.('write current rows', writtenCurrentRows, currentRows.length)
  for (const chunk of chunkRows(changedCurrentRows)) {
    await context.currentDb
      .insert(currentTable)
      .values(chunk as never)
      .onConflictDoUpdate({
        target: [currentTable.scopeId, currentTable.id],
        set: {
          ...(resourceType === 'divisionArea'
            ? { divisionId: sql`excluded.divisionId` }
            : {
                leftDivisionId: sql`excluded.leftDivisionId`,
                rightDivisionId: sql`excluded.rightDivisionId`,
              }),
          bbox: sql`excluded.bbox`,
          geometry: sql`excluded.geometry`,
          isLand: sql`excluded.isLand`,
          isTerritorial: sql`excluded.isTerritorial`,
          sources: sql`excluded.sources`,
          type: sql`excluded.type`,
          variant: sql`excluded.variant`,
          updatedAt: now,
        },
        setWhere: currentRowChangedSql(
          resourceType === 'divisionArea' ? 'divisionAreas' : 'divisionBoundaries',
          Object.keys(getTableColumns(currentTable)),
        ),
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
        .onConflictDoNothing()
        .run()
      writtenHistoryRows += chunk.length
      onProgress?.('write history rows', writtenHistoryRows, historyRows.length)
    }
  }
  if (version.source === 'hkgov-censtatd' && !isDisplayDerivative) {
    const table = sourceSchema.sourceHkgovCenstatdGeometry
    const geometries = [
      ...new Map(
        publisherRows.map(row => {
          const geometry = censtatdGeometryRow(row.source.sourceGeometry)
          return [geometry.id, geometry] as const
        }),
      ).values(),
    ]
    let created = 0
    for (const chunk of chunkRows(
      geometries,
      Math.floor(96 / Object.keys(getTableColumns(table)).length),
    )) {
      created += (
        await context.sourceDb
          .insert(table)
          .values(chunk)
          .onConflictDoUpdate({
            target: table.id,
            set: { sourceGeometry: sql`excluded.sourceGeometry` },
            // A failed chunked statistics delivery may have retained only a prefix.
            // Canonical JSON and fixed compression settings give a stable byte length.
            setWhere: sql`length(${table.sourceGeometry}) < length(excluded.sourceGeometry)`,
          })
          .returning({ id: table.id })
          .all()
      ).length
    }
    onProgress?.(
      `source geometry: ${created} new, ${geometries.length - created} reused`,
    )
  }
  if (sourceRows.length) {
    let writtenSourceRows = 0
    onProgress?.('write source rows', writtenSourceRows, sourceRows.length)
    for (const chunk of chunkRows(
      sourceRows,
      version.source === 'hkgov-censtatd'
        ? Math.floor(
            96 /
              Object.keys(getTableColumns(sourceSchema.sourceHkgovCenstatdStatistics))
                .length,
          )
        : 32,
    )) {
      const insert = context.sourceDb.insert(sourceTable).values(chunk as never)
      if (periodSource) {
        await insert.onConflictDoNothing().run()
      } else
        await insert
          .onConflictDoUpdate({
            target:
              version.source === 'hkgov-censtatd'
                ? [
                    sourceSchema.sourceHkgovCenstatdStatistics.datasetCode,
                    sourceTable.resourceReleaseId,
                    sourceTable.sourceRecordId,
                    sourceTable.versionHash,
                  ]
                : [
                    sourceTable.sourceRecordId,
                    sourceTable.versionHash,
                    sourceTable.validFromRelease,
                  ],
            setWhere: sql`isCurrent <> 1 OR validToRelease IS NOT NULL`,
            set: {
              resourceReleaseId: version.resourceReleaseId,
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
  if (isCenstatdDerivative) {
    await writeCenstatdSourceDerivatives(
      context.sourceDb as unknown as HarbourReadableDb & HarbourWritableDb,
      rows,
      version,
    )
  }

  if (publication)
    await completeSnapshotPublication(
      publicationDb,
      publication,
      buildPublicationRowCountSql(
        resourceType === 'divisionArea' ? 'divisionAreas' : 'divisionBoundaries',
        scopeId,
        currentRows.length,
      ),
    )
  return {
    churn,
    currentChanges: { publication, changedCurrentIds, removedCurrentIds },
  }
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
  return hashDivisionGeometrySourceRow({
    ...nativeSourcePayloadHashInput({
      properties: row.properties,
      sourceGeometry: row.sourceGeometry,
    }),
  })
}

async function writeCenstatdSourceDerivatives(
  db: HarbourReadableDb & HarbourWritableDb,
  rows: Array<NonNullable<NormalisedGeometry>>,
  version: {
    datasetCode?: string
    cohortKey: string
    resourceReleaseId: string
    sourceVersion: string
    transform?: 'simplified'
  },
) {
  const transform = version.transform
  if (!transform) {
    throw new Error('C&SD derivative write requires a named transform.')
  }

  const geometries = sourceSchema.sourceHkgovCenstatdGeometry
  const derivatives = sourceSchema.sourceHkgovCenstatdGeometryDerivatives
  const coverageGeometryIds = rows.map(row =>
    censtatdGeometryId(row.source.sourceGeometry),
  )
  const derivativeRows = []
  for (const row of rows) {
    const geometryId = censtatdGeometryId(row.source.sourceGeometry)
    if (
      !(await db
        .select({ id: geometries.id })
        .from(geometries)
        .where(eq(geometries.id, geometryId))
        .get())
    ) {
      throw new Error(
        `C&SD derivative ${row.source.sourceRecordId} requires its exact source geometry to be ingested first.`,
      )
    }
    if (!row.source.derivation)
      throw new Error('C&SD derivative has no derivation metadata.')
    const derivative = censtatdDerivativeRow({
      geometryId,
      transform,
      coverageGeometryIds,
      derivation: row.source.derivation,
      geometry: row.canonical.geometry,
      bbox: row.canonical.bbox,
    })
    const existing = await db
      .select({ versionHash: derivatives.versionHash })
      .from(derivatives)
      .where(
        and(
          eq(derivatives.geometryId, geometryId),
          eq(derivatives.transform, transform),
          eq(derivatives.transformHash, derivative.transformHash),
        ),
      )
      .get()
    if (existing && existing.versionHash !== derivative.versionHash)
      throw new Error(
        `C&SD geometry ${geometryId} has conflicting output for the same transform context.`,
      )
    derivativeRows.push(derivative)
  }
  for (const chunk of chunkRows(
    derivativeRows,
    Math.floor(96 / Object.keys(getTableColumns(derivatives)).length),
  )) {
    await db
      .insert(derivatives)
      .values(chunk as never)
      .onConflictDoNothing()
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
  scope: ReturnType<typeof and>,
  retainUnrepresented = false,
) {
  const typedDb = db as unknown as HarbourReadableDb & HarbourWritableDb
  const existing = await typedDb
    .select({ id: idColumn, versionHash: table.versionHash })
    .from(table)
    .where(and(eq(table.isCurrent, true), scope))
    .all()
  const closedRows: Array<{ id: string; versionHash: string }> = []
  for (const row of existing) {
    const id = requireString(row.id, 'current row id')
    const versionHash = requireString(row.versionHash, 'current row versionHash')
    if (retainUnrepresented && !currentHashes.has(id)) continue
    if (currentHashes.get(id) === versionHash) continue
    await typedDb
      .update(table)
      .set(values)
      .where(
        and(
          scope,
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

function geometrySourceScope(
  table: {
    validFromRelease: AnySQLiteColumn
    datasetCode?: AnySQLiteColumn
  },
  version: {
    source: GeometryUploadPlan['source']
    datasetCode?: string
    cohortKey: string
    sourceVersion: string
  },
) {
  const beforeOrAtRelease = lte(table.validFromRelease, version.sourceVersion)
  if (version.source !== 'hkgov-censtatd') return beforeOrAtRelease

  if (!table.datasetCode)
    throw new Error('C&SD geometry source table has no dataset column.')
  return and(
    beforeOrAtRelease,
    eq(table.datasetCode, requireString(version.datasetCode, 'C&SD datasetCode')),
  )
}
