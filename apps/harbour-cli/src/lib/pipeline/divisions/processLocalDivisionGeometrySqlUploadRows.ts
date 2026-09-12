import {
  assertPublishedSnapshotMaterialised,
  beginSnapshotPublication,
  completeSnapshotPublication,
  guardSnapshotPublicationWrites,
} from '../local/snapshotPublication.ts'
import { getPreparedPublication } from '@repo/core/pipeline/services/publication/execute.ts'
import { currentRowChangedSql } from '@repo/core/pipeline/services/publication/currentWrites.ts'
import {
  buildPublicationRowCountSql,
  type PublicationPreparation,
} from '@repo/core/pipeline/services/publication/sql.ts'
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
import { compressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson.ts'
import { toIsoTimestamp } from '@repo/db'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { and, eq, inArray, lte, sql, getTableColumns } from 'drizzle-orm'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils'
import type { AnySQLiteColumn, AnySQLiteTable } from 'drizzle-orm/sqlite-core'
import type { resolveLocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import type {
  GeometryUploadPlan,
  GeometryWriteProgress,
  NormalisedGeometry,
} from './processLocalDivisionGeometrySqlUploadTypes.ts'
import {
  canonicalGeometryBrotliQuality,
  createGeometryChurnCounts,
  getGeometryChurnBaseline,
  decodeStoredGeoJsonGeometry,
  shouldCompressCanonicalGeometry,
} from './processLocalDivisionGeometrySqlUploadStatistics.ts'
import { requireString } from './processLocalDivisionGeometrySqlUploadPreparation.ts'
import { readGeometrySnapshot } from './readGeometrySnapshot.ts'
import { validateGeometryHistoryBaseline } from './geometryHistoryBaseline.ts'

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
      ? version.source === 'hkgov-had'
        ? sourceSchema.sourceHkgovHadDivisionAreas
        : version.source === 'hkgov-censtatd'
          ? sourceSchema.sourceHkgovCenstatdDivisionAreas
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
          publicationToken: version.releaseId,
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
  // Statistics archive geometries are already retained in
  // hkgovCenstatdStatistics; do not duplicate Area/HMA assertions in the
  // district-boundary source table.
  const isCenstatdStatisticGeometry =
    version.source === 'hkgov-censtatd' &&
    rows.some(
      row =>
        !(
          row.source.properties &&
          typeof row.source.properties === 'object' &&
          !Array.isArray(row.source.properties) &&
          'dcClass' in row.source.properties
        ),
    )
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
      !isDisplayDerivative &&
      !isCenstatdStatisticGeometry &&
      version.source !== 'hkgov-pland-pu' &&
      version.source !== 'hkgov-pland-new-town'
    ) {
      sourceHashes.set(
        row.source.sourceRecordId,
        await hashGeometrySourceAssertion(
          row.source,
          version.source,
          version.cohortKey,
        ),
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
      .where(and(eq(currentTable.snapshotId, scopeId), inArray(currentTable.id, ids)))
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
    await recordSnapshotVersionChanges(
      context.historyDb as unknown as HarbourWritableDb,
      {
        snapshotId: version.snapshotId,
        sourceReleaseId: version.releaseId,
        recordType: resourceType,
        operation: 'delete',
        changes: removedHistoryIds.map(recordId => ({ recordId })),
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
      { isCurrent: false, validToRelease: version.sourceVersion },
      geometrySourceScope(sourceTable, version),
    )
  }
  onProgress?.('build write batches')
  const inheritedCurrentRows =
    !version.skipCanonicalMaterialisation && version.merge && version.parentSnapshotId
      ? parentRows
      : []
  const currentRowsById = new Map<string, Record<string, unknown>>(
    inheritedCurrentRows.map(row => [row.id, { ...row, snapshotId: scopeId }]),
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
      snapshotId: scopeId,
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
              validFromRelease: version.sourceVersion,
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
        target: [currentTable.snapshotId, currentTable.id],
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
          identifiers: sql`excluded.identifiers`,
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
  cohortKey: string,
) {
  if (source === 'overture') return hashDivisionGeometrySourceRow(row)
  return hashDivisionGeometrySourceRow({
    ...nativeSourcePayloadHashInput({
      properties: row.properties,
      sourceGeometry: row.sourceGeometry,
    }),
    ...(source === 'hkgov-censtatd' ? { censusYear: cohortKey } : {}),
  })
}

async function writeCenstatdSourceDerivatives(
  db: HarbourReadableDb & HarbourWritableDb,
  rows: Array<NonNullable<NormalisedGeometry>>,
  version: {
    cohortKey: string
    releaseId: string
    sourceVersion: string
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
        validFromRelease: version.sourceVersion,
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
      .set({ isCurrent: false, validToRelease: version.sourceVersion })
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
  scope: ReturnType<typeof and>,
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

function geometrySourceScope(
  table: {
    validFromRelease: AnySQLiteColumn
    censusYear?: AnySQLiteColumn
  },
  version: {
    source: GeometryUploadPlan['source']
    cohortKey: string
    sourceVersion: string
  },
) {
  const beforeOrAtRelease = lte(table.validFromRelease, version.sourceVersion)
  if (version.source !== 'hkgov-censtatd') return beforeOrAtRelease

  if (!table.censusYear)
    throw new Error('C&SD geometry source table has no census-year column.')
  return and(beforeOrAtRelease, eq(table.censusYear, version.cohortKey))
}
