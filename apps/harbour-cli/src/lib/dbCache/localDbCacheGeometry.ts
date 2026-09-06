import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  REMOTE_GEOMETRY_BATCH_BYTE_LIMIT,
  REMOTE_GEOMETRY_HEX_CHUNK_BYTES,
  REMOTE_GEOMETRY_HEX_CHUNKS_PER_QUERY,
  assertBinaryGeometryRow,
  geometrySha256,
  partitionRemoteGeometryRows,
  reassembleHexChunks,
  type BinaryGeometryRow,
} from './binaryGeometryMirror.ts'
import type { RemoteD1QueryClient } from './remoteD1Client.ts'
import type { D1TargetRecord, RemoteTableImport } from './localDbCacheTypes.ts'
import { quoteSqlIdentifier } from './localDbCacheReads.ts'
import { resolveCachePruneOperation } from './localDbCacheProfiles.ts'
import {
  REMOTE_GEOMETRY_PAGE_SIZE,
  REMOTE_GEOMETRY_QUERY_CONCURRENCY,
} from './localDbCacheConfig.ts'
import { mapWithConcurrency } from './localDbCache.ts'

/** Tables whose geometry column may be a jsonTextOrBinary / binaryText BLOB. */
export function resolveBinaryGeometryColumn(tableName: string) {
  switch (tableName) {
    case 'address2d':
    case 'divisions':
    case 'divisionAreas':
    case 'divisionBoundaries':
    case 'hkgovCenstatdDivisionAreaDerivatives':
      return 'geometry'
    case 'hkgovCenstatdDivisionAreas':
      return 'sourceGeometry'
    default:
      return null
  }
}

export function shouldMirrorBinaryGeometryTable(tableName: string) {
  return resolveBinaryGeometryColumn(tableName) !== null
}

export async function mirrorBinaryGeometryTable(
  targetRecord: D1TargetRecord,
  tableName: string,
  workDir: string,
  remoteD1Client: RemoteD1QueryClient,
): Promise<Pick<RemoteTableImport, 'binaryRowsPath'>> {
  const binaryColumn = resolveBinaryGeometryColumn(tableName)
  if (!binaryColumn) {
    throw new Error(`No binary geometry column is configured for ${tableName}.`)
  }
  const columns = await remoteD1Client.query(
    `PRAGMA table_info(${quoteSqlIdentifier(tableName)})`,
  )
  const columnNames = columns.map(column =>
    requireRemoteString(column.name, 'column name'),
  )
  const primaryKeyColumns = columns
    .filter(column => Number(column.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map(column => requireRemoteString(column.name, 'primary-key column'))
  if (!columnNames.includes(binaryColumn) || primaryKeyColumns.length === 0) {
    throw new Error(
      `Binary cache mirror requires a geometry column and primary key for ${targetRecord.bindingName}.${tableName}.`,
    )
  }

  const selectedColumns = columnNames.map(column =>
    column === binaryColumn
      ? `CASE WHEN typeof(${quoteSqlIdentifier(column)}) = 'blob' THEN NULL ELSE ${quoteSqlIdentifier(column)} END AS ${quoteSqlIdentifier(column)}`
      : quoteSqlIdentifier(column),
  )
  const orderBy = primaryKeyColumns.map(quoteSqlIdentifier).join(', ')
  // Binary rows bypass the SQL data export. Mirror the same subset that the
  // cache worker retains so validation never includes intentionally pruned rows.
  const retainedRowsWhereSql = resolveCachePruneOperation(
    targetRecord.bindingName,
    tableName,
  )?.retainedRowsWhereSql
  const rows: BinaryGeometryRow[] = []

  for (let offset = 0; ; offset += REMOTE_GEOMETRY_PAGE_SIZE) {
    const remoteRows = await remoteD1Client.query(
      [
        `SELECT ${selectedColumns.join(', ')},`,
        `typeof(${quoteSqlIdentifier(binaryColumn)}) AS "__geometryType",`,
        `length(${quoteSqlIdentifier(binaryColumn)}) AS "__geometryLength",`,
        `length(CAST(${quoteSqlIdentifier(binaryColumn)} AS BLOB)) AS "__geometryByteLength"`,
        `FROM ${quoteSqlIdentifier(tableName)}`,
        ...(retainedRowsWhereSql ? [`WHERE ${retainedRowsWhereSql}`] : []),
        `ORDER BY ${orderBy}`,
        `LIMIT ${REMOTE_GEOMETRY_PAGE_SIZE} OFFSET ${offset}`,
      ].join(' '),
    )

    const pageRows: BinaryGeometryRow[] = remoteRows.map(remoteRow => {
      let geometryType = requireGeometryType(remoteRow.__geometryType)
      const values = Object.fromEntries(
        columnNames.map(column => [
          column,
          remoteRow[column] === undefined
            ? null
            : normaliseRemoteSqlValue(remoteRow[column]),
        ]),
      )
      const recordId = String(values.id ?? values.sourceRecordId ?? 'unknown-record')
      const snapshotId =
        typeof values.snapshotId === 'string' ? values.snapshotId : null
      let geometryLength = asOptionalRemoteInteger(remoteRow.__geometryLength)

      if (geometryType !== 'blob' && typeof values[binaryColumn] === 'string') {
        if (values[binaryColumn].includes('\uFFFD')) {
          // D1 can expose invalid binary bytes as replacement characters when
          // a BLOB is observed through a TEXT expression. Recover the original
          // bytes through the hex path instead of persisting lossy UTF-8.
          geometryType = 'blob'
          geometryLength =
            asOptionalRemoteInteger(remoteRow.__geometryByteLength) ?? geometryLength
          values[binaryColumn] = null
        }
      }

      return {
        binaryColumn,
        geometry: null,
        geometryDigest: null,
        geometryLength,
        geometryType,
        primaryKeyColumns,
        recordId,
        snapshotId,
        values,
      } satisfies BinaryGeometryRow
    })

    const batches = partitionRemoteGeometryRows(
      pageRows.map(row => ({
        geometryLength: row.geometryLength,
        geometryType: row.geometryType,
      })),
      REMOTE_GEOMETRY_BATCH_BYTE_LIMIT,
    )
    const geometryChunkRows = new Map<string, string[]>()
    const pageKeys = new Set(
      pageRows.map(row => remotePrimaryKey(row.values, primaryKeyColumns)),
    )
    const chunkTasks = batches.flatMap(batch =>
      Array.from(
        {
          length: Math.ceil(batch.maxChunkCount / REMOTE_GEOMETRY_HEX_CHUNKS_PER_QUERY),
        },
        (_, windowIndex) => ({
          batch,
          chunkOffset: windowIndex * REMOTE_GEOMETRY_HEX_CHUNKS_PER_QUERY,
        }),
      ),
    )

    await mapWithConcurrency(
      chunkTasks,
      REMOTE_GEOMETRY_QUERY_CONCURRENCY,
      async task => {
        const chunkCount = Math.min(
          REMOTE_GEOMETRY_HEX_CHUNKS_PER_QUERY,
          task.batch.maxChunkCount - task.chunkOffset,
        )
        const chunkColumns = Array.from(
          { length: chunkCount },
          (_, index) =>
            `hex(substr(CAST(${quoteSqlIdentifier(binaryColumn)} AS BLOB), ${
              1 + (task.chunkOffset + index) * REMOTE_GEOMETRY_HEX_CHUNK_BYTES
            }, ${REMOTE_GEOMETRY_HEX_CHUNK_BYTES})) AS "__hex${index}"`,
        )
        const chunkRows = await remoteD1Client.query(
          [
            `SELECT ${primaryKeyColumns.map(quoteSqlIdentifier).join(', ')},`,
            chunkColumns.join(', '),
            `FROM ${quoteSqlIdentifier(tableName)}`,
            ...(retainedRowsWhereSql ? [`WHERE ${retainedRowsWhereSql}`] : []),
            `ORDER BY ${orderBy}`,
            `LIMIT ${task.batch.count}`,
            `OFFSET ${offset + task.batch.start}`,
          ].join(' '),
        )

        for (const chunkRow of chunkRows) {
          const key = remotePrimaryKey(chunkRow, primaryKeyColumns)
          if (!pageKeys.has(key)) {
            throw new Error(
              `Remote geometry row changed while mirroring ${targetRecord.bindingName}.${tableName}.`,
            )
          }
          const chunks = geometryChunkRows.get(key) ?? []
          for (let index = 0; index < chunkCount; index += 1) {
            const hex = chunkRow[`__hex${index}`]
            if (typeof hex !== 'string') {
              throw new Error(
                `Remote geometry chunk is missing for ${targetRecord.bindingName}.${tableName}.`,
              )
            }
            chunks[task.chunkOffset + index] = hex
          }
          geometryChunkRows.set(key, chunks)
        }
      },
    )

    for (const row of pageRows) {
      if (row.geometryType === 'blob') {
        const chunkCount = Math.ceil(
          Math.max(0, row.geometryLength ?? 0) / REMOTE_GEOMETRY_HEX_CHUNK_BYTES,
        )
        const chunks = geometryChunkRows.get(
          remotePrimaryKey(row.values, primaryKeyColumns),
        )
        const hexChunks = chunks?.slice(0, chunkCount)
        if (
          chunkCount > 0 &&
          (!hexChunks ||
            hexChunks.length !== chunkCount ||
            hexChunks.some(chunk => typeof chunk !== 'string'))
        ) {
          throw new Error(
            `Remote geometry chunks are incomplete for ${targetRecord.bindingName}.${tableName} record=${row.recordId}.`,
          )
        }
        row.geometry = reassembleHexChunks(hexChunks ?? [])
        row.geometryDigest = geometrySha256(row.geometry)
        row.values[binaryColumn] = null
      }
      assertBinaryGeometryRow(row)
      rows.push(row)
    }

    if (remoteRows.length < REMOTE_GEOMETRY_PAGE_SIZE) break
  }

  const binaryRowsPath = resolve(
    workDir,
    `${targetRecord.bindingName}-${tableName}-binary.json`,
  )
  await writeFile(
    binaryRowsPath,
    JSON.stringify(
      rows.map(row => ({
        ...row,
        geometry: row.geometry?.toString('hex') ?? null,
      })),
    ),
  )
  return { binaryRowsPath }
}

function requireRemoteString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Remote D1 returned an invalid ${label}.`)
  }
  return value
}

function remotePrimaryKey(values: Record<string, unknown>, columns: string[]) {
  return JSON.stringify(
    columns.map(column => normaliseRemoteSqlValue(values[column] ?? null)),
  )
}

function normaliseRemoteSqlValue(value: unknown): null | number | string {
  if (value === null || typeof value === 'number' || typeof value === 'string') {
    return value
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  throw new Error(`Remote D1 returned a non-SQL value: ${JSON.stringify(value)}`)
}

function requireGeometryType(value: unknown): 'blob' | 'text' | 'null' {
  if (value === 'blob' || value === 'text' || value === 'null') return value
  throw new Error(
    `Remote D1 returned an unsupported geometry storage type: ${String(value)}.`,
  )
}

function asOptionalRemoteInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}
