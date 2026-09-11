import {
  buildBeginPublicationSql,
  buildCompletePublicationSql,
  buildGuardedPublicationSql,
  buildPublicationRowCountSql,
  type PublicationPreparation,
} from '@repo/core/pipeline/services/publication/sql.ts'
import { currentRowChangedSqlText } from '@repo/core/pipeline/services/publication/currentWrites.ts'
import type { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows.ts'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deliverSqlPhase } from '../local/sqlDeliveryPhase.ts'
import type { UploadTarget } from '../../cli/options.ts'
import {
  type resolveLocalAddressDbContext,
  resolveShardBindingName,
} from '../../dbCache/localDbCache.ts'
import { executeSqlText, type SqlImportExecutionOptions } from '../local/sqlImport.ts'
import type { GeometryUploadPlan } from './processLocalDivisionGeometrySqlUploadTypes.ts'
import { describeRemoteGeometryImport } from './processLocalDivisionGeometrySqlUploadProgress.ts'
import {
  HARBOUR_WRANGLER_PATH,
  MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
} from './processLocalDivisionGeometrySqlUploadConfig.ts'

export async function replayGeometryIntoRemote(
  target: UploadTarget,
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  plan: GeometryUploadPlan,
  releaseId: string,
  snapshotId: string,
  skipCanonicalMaterialisation: boolean,
  runProgressPhase: <T>(subject: string, operation: () => Promise<T>) => Promise<T>,
  preparedSha256: string,
  releaseCode: string,
  currentChanges?: Awaited<ReturnType<typeof writeGeometryRows>>['currentChanges'],
  deliveryContext = context,
) {
  const metaBindingName = 'DB_META'
  const currentBindingName = 'DB_CURRENT'
  const regionToken = plan.regionCode.toUpperCase()
  const historyBindingName = resolveShardBindingName(
    'history',
    regionToken,
    plan.sourceVersion.slice(0, 4),
  )
  const sourceBindingName = resolveShardBindingName(
    'source',
    regionToken,
    plan.sourceVersion.slice(0, 4),
  )
  const generate = async () => {
    const metaRows = readGeometryReplayMetadata(
      context.state.dbCacheDir,
      metaBindingName,
      releaseId,
      snapshotId,
    )
    const currentTable =
      plan.resourceType === 'divisionArea' ? 'divisionAreas' : 'divisionBoundaries'
    const stateTable =
      plan.resourceType === 'divisionArea'
        ? 'divisionAreaPublicationState'
        : 'divisionBoundaryPublicationState'
    const receipt = skipCanonicalMaterialisation
      ? null
      : readGeometryCacheRows(
          context.state.dbCacheDir,
          currentBindingName,
          `SELECT * FROM "${stateTable}" WHERE snapshotId = ${geometrySqlLiteral(snapshotId)}`,
        )[0]
    if (!skipCanonicalMaterialisation && !receipt?.preparedAt)
      throw new Error('Geometry publication preparation is incomplete.')
    const publication = receipt
      ? ({
          ...receipt,
          table: stateTable,
          timestamp: receipt.preparedAt,
          previous: currentChanges?.publication?.previous,
        } as PublicationPreparation)
      : null
    const historyTable = currentTable
    const sourceTable = resolveGeometrySourceTable(plan)
    const currentRows = skipCanonicalMaterialisation
      ? []
      : iterateGeometryCacheRows(
          context.state.dbCacheDir,
          currentBindingName,
          `SELECT * FROM "${currentTable}" WHERE "snapshotId" = ${geometrySqlLiteral(publication?.scopeId)}`,
        )
    if (!skipCanonicalMaterialisation && !currentChanges)
      throw new Error('Missing planned geometry current changes.')
    const changedIds = new Set(currentChanges?.changedCurrentIds ?? [])
    const historyRows = skipCanonicalMaterialisation
      ? []
      : iterateGeometryCacheRows(
          context.state.dbCacheDir,
          historyBindingName,
          `SELECT * FROM "${historyTable}" WHERE "snapshotId" = ${geometrySqlLiteral(snapshotId)}`,
        )
    const changeRows = skipCanonicalMaterialisation
      ? []
      : iterateGeometryCacheRows(
          context.state.dbCacheDir,
          historyBindingName,
          `SELECT * FROM "snapshotVersionChanges" WHERE "snapshotId" = ${geometrySqlLiteral(snapshotId)}`,
        )
    const sourceRows = sourceTable
      ? iterateGeometryCacheRows(
          context.state.dbCacheDir,
          sourceBindingName,
          `SELECT * FROM "${sourceTable}" WHERE "releaseId" = ${geometrySqlLiteral(releaseId)}`,
        )
      : []
    const options: SqlImportExecutionOptions = {
      accountId: resolveGeometryCloudflareAccountId(target),
      apiToken: process.env.CLOUDFLARE_D1_TOKEN?.trim(),
      isLocal: false,
    }

    const tableImports = [
      {
        bindingName: metaBindingName,
        databaseId: context.state.bindings[metaBindingName]?.databaseId,
        name: 'meta' as const,
        sql: [metaRows],
      },
      ...(!skipCanonicalMaterialisation
        ? [
            {
              bindingName: currentBindingName,
              databaseId: context.state.bindings[currentBindingName]?.databaseId,
              name: 'current' as const,
              sql: (function* () {
                if (!publication)
                  throw new Error('Missing geometry publication receipt.')
                yield buildBeginPublicationSql(publication)
                let count = 0
                for (const id of currentChanges?.removedCurrentIds ?? [])
                  yield buildGuardedPublicationSql(publication, [
                    `DELETE FROM "${currentTable}" WHERE snapshotId = ${geometrySqlLiteral(publication.scopeId)} AND id = ${geometrySqlLiteral(id)};`,
                  ])
                for (const statement of geometryIterateUpsertSql(
                  currentTable,
                  (function* () {
                    for (const row of currentRows) {
                      count += 1
                      if (changedIds.has(String(row.id))) yield row
                    }
                  })(),
                  { current: true },
                ))
                  yield buildGuardedPublicationSql(publication, [statement])
                yield buildCompletePublicationSql({
                  ...publication,
                  validationSql: buildPublicationRowCountSql(
                    currentTable,
                    publication.scopeId,
                    count,
                  ),
                })
              })(),
            },
          ]
        : []),
      ...(!skipCanonicalMaterialisation
        ? [
            {
              bindingName: historyBindingName,
              databaseId: context.state.bindings[historyBindingName]?.databaseId,
              name: 'history' as const,
              sql: (function* () {
                yield* geometryIterateClosureSql(
                  historyTable,
                  iterateGeometryCacheRows(
                    context.state.dbCacheDir,
                    historyBindingName,
                    `SELECT "id", "versionHash", "isCurrent", "updatedAt" FROM "${historyTable}" WHERE "isCurrent" = 0 AND "id" IN (SELECT "recordId" FROM "snapshotVersionChanges" WHERE "snapshotId" = ${geometrySqlLiteral(snapshotId)} AND "recordType" = ${geometrySqlLiteral(plan.resourceType)})`,
                  ),
                  ['id', 'versionHash'],
                )
                yield geometrySqlLiteralDelete(historyTable, 'snapshotId', snapshotId)
                yield geometrySqlLiteralDelete(
                  'snapshotVersionChanges',
                  'snapshotId',
                  snapshotId,
                )
                yield* geometryIterateUpsertSql(historyTable, historyRows)
                yield* geometryIterateUpsertSql('snapshotVersionChanges', changeRows)
              })(),
            },
          ]
        : []),
      {
        bindingName: sourceBindingName,
        databaseId: context.state.bindings[sourceBindingName]?.databaseId,
        name: 'source' as const,
        sql: (function* () {
          if (sourceTable) {
            yield* geometryIterateClosureSql(
              sourceTable,
              iterateGeometryCacheRows(
                context.state.dbCacheDir,
                sourceBindingName,
                `SELECT "sourceRecordId", "versionHash", "isCurrent", "validToRelease", "updatedAt" FROM "${sourceTable}" WHERE "isCurrent" = 0 AND "validToRelease" = ${geometrySqlLiteral(releaseCode)}`,
              ),
              ['sourceRecordId', 'versionHash'],
            )
            yield* geometryReplayStatements(
              sourceTable,
              sourceRows,
              geometrySqlLiteralDelete(sourceTable, 'releaseId', releaseId),
            )
          }
          if (plan.source === 'hkgov-censtatd' && plan.transform === 'simplified') {
            const table = 'hkgovCenstatdDivisionAreaDerivatives'
            yield* geometryIterateClosureSql(
              table,
              iterateGeometryCacheRows(
                context.state.dbCacheDir,
                sourceBindingName,
                `SELECT "sourceRecordId", "inputVersionHash", "transform", "versionHash", "isCurrent", "validToRelease", "updatedAt" FROM "${table}" WHERE "isCurrent" = 0 AND "validToRelease" = ${geometrySqlLiteral(releaseCode)}`,
              ),
              ['sourceRecordId', 'inputVersionHash', 'transform', 'versionHash'],
            )
            yield geometrySqlLiteralDelete(table, 'releaseId', releaseId)
            yield* geometryIterateUpsertSql(
              table,
              iterateGeometryCacheRows(
                context.state.dbCacheDir,
                sourceBindingName,
                `SELECT * FROM "${table}" WHERE "releaseId" = ${geometrySqlLiteral(releaseId)}`,
              ),
            )
          }
        })(),
      },
    ]

    for (const tableImport of tableImports) {
      await runProgressPhase(
        describeRemoteGeometryImport(tableImport.name, plan, target),
        async () => {
          for (const sql of tableImport.sql) {
            if (!sql.trim()) continue
            await executeSqlText(
              { databaseId: tableImport.databaseId ?? null, name: tableImport.name },
              sql,
              options,
            )
          }
        },
      )
    }
  }

  try {
    await deliverSqlPhase(
      {
        context: deliveryContext,
        releaseId,
        phase: `division-geometry-${plan.resourceType.toLowerCase()}-${skipCanonicalMaterialisation ? 'source' : 'canonical'}-${String(
          plan.transform ?? 'exact',
        )
          .replace(/[^a-z0-9-]/gi, '-')
          .toLowerCase()}`,
        inputs: {
          preparedSha256,
          snapshotId,
          sourceVersion: plan.sourceVersion,
          releaseCode,
        },
      },
      generate,
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Remote geometry replay failed. ${reason}`)
  }
}

function readGeometryReplayMetadata(
  cacheDir: string,
  bindingName: string,
  releaseId: string,
  snapshotId: string,
) {
  const snapshot = readGeometryCacheRows(
    cacheDir,
    bindingName,
    `SELECT * FROM "snapshots" WHERE "id" = ${geometrySqlLiteral(snapshotId)}`,
  )
  if (snapshot.length === 0) {
    throw new Error(`Local meta cache is missing snapshot ${snapshotId}.`)
  }
  const lineageId = snapshot[0]?.snapshotLineageId
  const assemblyRuns = readGeometryCacheRows(
    cacheDir,
    bindingName,
    `SELECT * FROM "snapshotAssemblyRuns" WHERE "snapshotId" = ${geometrySqlLiteral(snapshotId)}`,
  )
  const assemblyIds = assemblyRuns
    .map(row => row.snapshotAssemblyId)
    .filter((value): value is string => typeof value === 'string')
  const idList = assemblyIds.map(geometrySqlLiteral).join(', ')
  const tables = [
    ['snapshotLineages', lineageId ? `"id" = ${geometrySqlLiteral(lineageId)}` : '0'],
    ['snapshots', `"id" = ${geometrySqlLiteral(snapshotId)}`],
    ['snapshotSources', `"snapshotId" = ${geometrySqlLiteral(snapshotId)}`],
    ['snapshotAssembly', idList ? `"id" IN (${idList})` : '0'],
    ['snapshotAssemblySources', idList ? `"snapshotAssemblyId" IN (${idList})` : '0'],
    ['snapshotAssemblyRuns', `"snapshotId" = ${geometrySqlLiteral(snapshotId)}`],
    ['releaseShardAssignments', `"releaseId" = ${geometrySqlLiteral(releaseId)}`],
    ['snapshotShardAssignments', `"snapshotId" = ${geometrySqlLiteral(snapshotId)}`],
    ['releaseProcessingActions', `"releaseId" = ${geometrySqlLiteral(releaseId)}`],
    ['releaseProcessingActionChunks', `"releaseId" = ${geometrySqlLiteral(releaseId)}`],
    ['stats', `"releaseId" = ${geometrySqlLiteral(releaseId)}`],
  ] as const

  return tables
    .flatMap(([tableName, where]) => {
      const rows = readGeometryCacheRows(
        cacheDir,
        bindingName,
        `SELECT * FROM "${tableName}" WHERE ${where}`,
      )
      return geometryBuildUpsertSql(tableName, rows)
    })
    .join('\n')
}

function readGeometryCacheRows(cacheDir: string, bindingName: string, query: string) {
  return [...iterateGeometryCacheRows(cacheDir, bindingName, query)]
}

function* iterateGeometryCacheRows(
  cacheDir: string,
  bindingName: string,
  query: string,
) {
  const sqlite = new SQLiteDatabase(join(cacheDir, `${bindingName}.sqlite`), {
    readonly: true,
  })
  try {
    yield* sqlite.query(query).iterate() as IterableIterator<Record<string, unknown>>
  } finally {
    sqlite.close()
  }
}

export function geometryBuildUpsertSql(
  tableName: string,
  rows: Array<Record<string, unknown>>,
  options: { current?: boolean } = {},
) {
  return [...geometryIterateUpsertSql(tableName, rows, options)].join('\n')
}

/** Small version-qualified updates: never replace historical geometry or newer versions. */
export function* geometryIterateClosureSql(
  tableName: string,
  rows: Iterable<Record<string, unknown>>,
  keys: string[],
) {
  for (const row of rows) {
    if (row.isCurrent !== 0 || !keys.length || keys.some(key => row[key] == null))
      throw new Error('Invalid closed geometry version.')
    const updates = Object.keys(row).filter(column => !keys.includes(column))
    const statement = `UPDATE "${tableName}" SET ${updates.map(column => `"${column}" = ${geometrySqlLiteral(row[column])}`).join(', ')} WHERE ${keys.map(column => `"${column}" = ${geometrySqlLiteral(row[column])}`).join(' AND ')};`
    if (Buffer.byteLength(statement) > MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES)
      throw new Error('Geometry closure exceeds the SQL statement budget.')
    yield statement
  }
}

function* geometryReplayStatements(
  tableName: string,
  rows: Iterable<Record<string, unknown>>,
  initial: string,
) {
  yield initial
  yield* geometryIterateUpsertSql(tableName, rows)
}

export function* geometryIterateUpsertSql(
  tableName: string,
  rows: Iterable<Record<string, unknown>>,
  options: { current?: boolean } = {},
) {
  let columns: string[] | undefined
  let prefix = ''
  let suffix = ''
  let overheadBytes = 0
  let valuesBytes = 0
  let values: string[] = []

  for (const row of rows) {
    if (!columns) {
      columns = Object.keys(row)
      prefix = `INSERT INTO "${tableName}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES `
      const updated = options.current
        ? columns.filter(column => column !== 'createdAt')
        : columns
      suffix = ` ON CONFLICT DO UPDATE SET ${updated.map(column => `"${column}" = excluded."${column}"`).join(', ')}${options.current ? ` WHERE ${currentRowChangedSqlText(tableName, columns)}` : ''};`
      overheadBytes = Buffer.byteLength(prefix) + Buffer.byteLength(suffix)
    }
    const value = `(${columns.map(column => geometrySqlLiteral(row[column])).join(', ')})`
    const valueBytes = Buffer.byteLength(value)
    const rowStatementBytes = overheadBytes + valueBytes

    if (rowStatementBytes > MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES) {
      if (values.length > 0) {
        yield `${prefix}${values.join(', ')}${suffix}`
        values = []
        valuesBytes = 0
      }

      yield geometryBuildChunkedUpsertSql(tableName, columns, row, prefix, suffix)
      continue
    }

    const candidateBytes =
      overheadBytes + valuesBytes + (values.length ? 2 : 0) + valueBytes

    if (candidateBytes > MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES) {
      yield `${prefix}${values.join(', ')}${suffix}`
      values = [value]
      valuesBytes = valueBytes
    } else {
      valuesBytes += (values.length ? 2 : 0) + valueBytes
      values.push(value)
    }
  }

  if (values.length > 0) {
    yield `${prefix}${values.join(', ')}${suffix}`
  }
}

function geometryBuildChunkedUpsertSql(
  tableName: string,
  columns: string[],
  row: Record<string, unknown>,
  prefix: string,
  suffix: string,
) {
  const keyColumns = geometryReplayKeyColumns(row)
  if (!keyColumns) {
    const rowBytes = new TextEncoder().encode(
      `${prefix}(${columns.map(column => geometrySqlLiteral(row[column])).join(', ')})${suffix}`,
    ).byteLength
    throw new Error(
      `Cannot replay ${tableName} geometry row: its ${rowBytes}-byte SQL statement exceeds D1's ${MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES}-byte safe limit.`,
    )
  }

  const chunkedColumns = columns
    .map(column => ({ column, value: geometrySqlLargeValue(row[column]) }))
    .filter(
      (entry): entry is { column: string; value: string | Uint8Array } =>
        entry.value !== null && !keyColumns.includes(entry.column),
    )
    .sort(
      (left, right) =>
        new TextEncoder().encode(geometrySqlLiteral(right.value)).byteLength -
        new TextEncoder().encode(geometrySqlLiteral(left.value)).byteLength,
    )
  const selectedColumns = chunkedColumns.filter(
    entry =>
      new TextEncoder().encode(geometrySqlLiteral(entry.value)).byteLength >
      MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
  )

  const buildPlaceholderUpsert = () => {
    const placeholderValue = `(${columns
      .map(column =>
        selectedColumns.some(entry => entry.column === column)
          ? geometrySqlLiteral('')
          : geometrySqlLiteral(row[column]),
      )
      .join(', ')})`
    return `${prefix}${placeholderValue}${suffix}`
  }
  let upsert = buildPlaceholderUpsert()
  let upsertBytes = new TextEncoder().encode(upsert).byteLength

  for (const entry of chunkedColumns) {
    if (upsertBytes <= MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES) break
    if (selectedColumns.some(selected => selected.column === entry.column)) continue

    selectedColumns.push(entry)
    upsert = buildPlaceholderUpsert()
    upsertBytes = new TextEncoder().encode(upsert).byteLength
  }

  if (selectedColumns.length === 0) {
    const rowBytes = new TextEncoder().encode(
      `${prefix}(${columns.map(column => geometrySqlLiteral(row[column])).join(', ')})${suffix}`,
    ).byteLength
    throw new Error(
      `Cannot replay ${tableName} geometry row: its ${rowBytes}-byte SQL statement exceeds D1's ${MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES}-byte safe limit.`,
    )
  }

  if (upsertBytes > MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES) {
    throw new Error(
      `Cannot replay ${tableName} geometry row: its non-chunked SQL is ${upsertBytes} bytes and exceeds D1's ${MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES}-byte safe limit.`,
    )
  }

  const where = keyColumns
    .map(column => `"${column}" = ${geometrySqlLiteral(row[column])}`)
    .join(' AND ')
  return [
    upsert,
    ...selectedColumns.flatMap(({ column, value }) => {
      const isBinary = value instanceof Uint8Array
      const updatePrefix = isBinary
        ? `UPDATE "${tableName}" SET "${column}" = CAST("${column}" || `
        : `UPDATE "${tableName}" SET "${column}" = "${column}" || `
      const updateSuffix = isBinary ? ` AS BLOB) WHERE ${where};` : ` WHERE ${where};`
      const chunkByteLimit =
        MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES -
        new TextEncoder().encode(
          `${updatePrefix}${isBinary ? "X''" : geometrySqlLiteral('')}${updateSuffix}`,
        ).byteLength

      if (chunkByteLimit <= 0) {
        throw new Error(
          `Cannot replay ${tableName} geometry row: its key columns leave no space for ${column} data within D1's ${MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES}-byte safe limit.`,
        )
      }

      const chunks = isBinary
        ? geometrySplitBytes(value, Math.floor(chunkByteLimit / 2))
        : geometrySplitUtf8(value, chunkByteLimit)

      return chunks.map(
        chunk => `${updatePrefix}${geometrySqlLiteral(chunk)}${updateSuffix}`,
      )
    }),
  ].join('\n')
}

function geometryReplayKeyColumns(row: Record<string, unknown>) {
  if (typeof row.snapshotId === 'string' && typeof row.id === 'string') {
    return ['snapshotId', 'id']
  }

  if (typeof row.id === 'string' && typeof row.versionHash === 'string') {
    return ['id', 'versionHash']
  }

  if (typeof row.sourceRecordId === 'string' && typeof row.versionHash === 'string') {
    return ['sourceRecordId', 'versionHash']
  }

  return null
}

function geometrySqlLargeValue(value: unknown) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return JSON.stringify(value)
  return null
}

function geometrySplitUtf8(value: string, byteLimit: number) {
  const chunks: string[] = []
  let chunk = ''
  let chunkBytes = 0

  for (const character of value) {
    const characterBytes =
      new TextEncoder().encode(geometrySqlLiteral(character)).byteLength - 2

    if (chunk && chunkBytes + characterBytes > byteLimit) {
      chunks.push(chunk)
      chunk = ''
      chunkBytes = 0
    }

    chunk += character
    chunkBytes += characterBytes
  }

  if (chunk) chunks.push(chunk)

  return chunks
}

function geometrySplitBytes(value: Uint8Array, byteLimit: number) {
  if (byteLimit <= 0) return []

  const chunks: Uint8Array[] = []
  for (let start = 0; start < value.byteLength; start += byteLimit) {
    chunks.push(value.slice(start, start + byteLimit))
  }
  return chunks
}

function geometrySqlLiteralDelete(tableName: string, column: string, value: string) {
  return `DELETE FROM "${tableName}" WHERE "${column}" = ${geometrySqlLiteral(value)};`
}

function geometrySqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString('hex')}'`
  }
  if (value instanceof ArrayBuffer) {
    return `X'${Buffer.from(new Uint8Array(value)).toString('hex')}'`
  }
  if (typeof value === 'object') return geometrySqlLiteral(JSON.stringify(value))
  return `'${String(value).replaceAll("'", "''")}'`
}

function resolveGeometrySourceTable(plan: GeometryUploadPlan) {
  if (plan.resourceType === 'divisionBoundary') return 'overtureDivisionBoundaries'
  if (plan.source === 'hkgov-had') return 'hkgovHadDivisionAreas'
  if (plan.source === 'hkgov-censtatd') return 'hkgovCenstatdDivisionAreas'
  if (plan.source === 'overture') return 'overtureDivisionAreas'
  return null
}

function resolveGeometryCloudflareAccountId(target: UploadTarget) {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (fromEnv) return fromEnv
  const config = JSON.parse(readFileSync(HARBOUR_WRANGLER_PATH, 'utf8')) as {
    vars?: Record<string, unknown>
    env?: Record<string, { vars?: Record<string, unknown> }>
  }
  const accountId = (
    target.environment === 'production'
      ? config.env?.production?.vars
      : config.env?.preview?.vars
  )?.CLOUDFLARE_ACCOUNT_ID
  return typeof accountId === 'string' ? accountId.trim() : undefined
}
