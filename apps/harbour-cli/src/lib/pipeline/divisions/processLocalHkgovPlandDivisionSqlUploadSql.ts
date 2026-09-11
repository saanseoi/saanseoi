import {
  buildBeginPublicationSql,
  buildCompletePublicationSql,
  buildGuardedPublicationSql,
  buildPublicationRowCountSql,
  type PublicationPreparation,
} from '@repo/core/pipeline/services/publication/sql.ts'
import { eq, inArray, getTableColumns } from 'drizzle-orm'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import {
  buildSqlPipelineArtefactKey,
  writeTextArtefact,
} from '@repo/core/pipeline/services/storage/artefacts'
import type { SqlImportTargetContext } from '../local/sqlImport.ts'
import type { LocalPipelineBucket } from '../local/localBucket.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import { geometryBuildUpsertSql } from './processLocalDivisionGeometrySqlUpload.ts'
import type {
  HkgovPlandDivisionUploadPlan,
  PreparedDivision,
} from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'
import { buildPlandMetaSql } from './processLocalHkgovPlandDivisionSqlUploadMetadata.ts'

export type PlandSqlArtefactManifest = {
  currentKey: string
  historyKey: string
  metaKey: string
  sourceKey: string
}

export type PlandImportTargets = {
  current: SqlImportTargetContext
  history: SqlImportTargetContext
  meta: SqlImportTargetContext
  source: SqlImportTargetContext
}

export type PlandSqlState = {
  changedHistoryIds: string[]
  changedNativeIds: string[]
  missingHistoryIds: string[]
  missingNativeIds: string[]
  records: PreparedDivision[]
  releaseCode: string
  releaseId: string
  snapshotId: string
}

const PLAND_SQL_STATEMENT_BYTE_TARGET = 96 * 1024

/**
 * Serialises the already-planned local mutations into idempotent SQL. The
 * planning cache is deliberately the source of truth here: it lets this
 * specialised processor retain its existing data normalisation while making
 * the remote D1 mutation and cache replay exactly the same operation.
 */
export async function writePlandSqlArtefacts(
  bucket: LocalPipelineBucket,
  context: LocalAddressDbContext,
  plan: HkgovPlandDivisionUploadPlan,
  state: PlandSqlState,
): Promise<PlandSqlArtefactManifest> {
  const runId = [
    'pland',
    plan.source,
    plan.regionCode,
    plan.sourceVersion.slice(0, 4),
    state.releaseId,
  ]
    .join('-')
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
  const artefactKey = (target: string, filename: string) =>
    buildSqlPipelineArtefactKey(
      {
        cohortKey: plan.cohortKey,
        datasetId: state.releaseId,
        rawObjectKey: '',
        regionCode: plan.regionCode,
        releaseCode: state.releaseCode,
        releaseId: state.releaseId,
        source: plan.source,
        sourceVersion: plan.sourceVersion,
        theme: plan.theme,
        resourceType: plan.resourceType,
      },
      target,
      filename,
    )
  const manifest = {
    currentKey: artefactKey('current', `${runId}-current.sql`),
    historyKey: artefactKey('history', `${runId}-history.sql`),
    metaKey: artefactKey('meta', `${runId}-meta.sql`),
    sourceKey: artefactKey('source', `${runId}-source.sql`),
  } satisfies PlandSqlArtefactManifest

  // Planning Unit source geometry is large. Build and persist one artefact at
  // a time so the source, history and current SQL strings do not coexist in
  // the heap while their text encodings are also being written.
  await writePlandSqlArtefact(bucket, manifest.sourceKey, () =>
    buildPlandSourceSql(context, plan, state),
  )
  await writePlandSqlArtefact(bucket, manifest.historyKey, () =>
    buildPlandHistorySql(context, state),
  )
  await writePlandSqlArtefact(bucket, manifest.currentKey, () =>
    buildPlandCurrentSql(context, state),
  )
  await writePlandSqlArtefact(bucket, manifest.metaKey, () =>
    buildPlandMetaSql(context, state),
  )

  return manifest
}

async function writePlandSqlArtefact(
  bucket: LocalPipelineBucket,
  key: string,
  build: () => Promise<string>,
) {
  const contents = await build()
  await writeTextArtefact(bucket, key, contents, 'application/sql; charset=utf-8')
}

export async function buildPlandSourceSql(
  context: LocalAddressDbContext,
  plan: HkgovPlandDivisionUploadPlan,
  state: PlandSqlState,
) {
  const tableName =
    plan.source === 'hkgov-pland-new-town'
      ? 'hkgovPlandNewTowns'
      : 'hkgovPlandPlanningCells'
  const affectedIdChunks = chunkArray(
    [...new Set([...state.changedNativeIds, ...state.missingNativeIds])],
    getMaxItemsPerInClause(1, 1),
  )
  const affectedRows =
    plan.source === 'hkgov-pland-new-town'
      ? (
          await Promise.all(
            affectedIdChunks.map(chunk =>
              context.sourceDb
                .select()
                .from(sourceSchema.sourceHkgovPlandNewTowns)
                .where(
                  inArray(sourceSchema.sourceHkgovPlandNewTowns.sourceRecordId, chunk),
                )
                .all(),
            ),
          )
        ).flat()
      : (
          await Promise.all(
            affectedIdChunks.map(chunk =>
              context.sourceDb
                .select()
                .from(sourceSchema.sourceHkgovPlandPlanningCells)
                .where(
                  inArray(
                    sourceSchema.sourceHkgovPlandPlanningCells.sourceRecordId,
                    chunk,
                  ),
                )
                .all(),
            ),
          )
        ).flat()
  const columns = plandSourceSqlColumns(plan.source)
  const sourceInsert = prepareRowsForSql(
    affectedRows,
    columns,
    ['sourceRecordId', 'versionHash'],
    ['sourceGeometry'],
  )
  const statements = [
    ...buildCloseSourceStatements(tableName, state.missingNativeIds, state.releaseCode),
    ...buildInsertStatements(tableName, columns, sourceInsert.rows, {
      suffix: buildUpdateSuffix(columns, ['sourceRecordId', 'versionHash']),
    }),
    ...buildLargeTextUpdates(tableName, sourceInsert.largeTextUpdates),
  ]

  return sqlFile(statements)
}

export function plandSourceSqlColumns(source: string) {
  return Object.values(
    getTableColumns(
      source === 'hkgov-pland-new-town'
        ? sourceSchema.sourceHkgovPlandNewTowns
        : sourceSchema.sourceHkgovPlandPlanningCells,
    ),
  ).map(column => column.name)
}

async function buildPlandHistorySql(
  context: LocalAddressDbContext,
  state: PlandSqlState,
) {
  const affectedIds = [
    ...new Set([...state.changedHistoryIds, ...state.missingHistoryIds]),
  ]
  const affectedIdChunks = chunkArray(affectedIds, getMaxItemsPerInClause(1, 1))
  const [divisionRows, i18nRows, changeRows] = await Promise.all([
    Promise.all(
      affectedIdChunks.map(chunk =>
        context.historyDb
          .select()
          .from(historySchema.divisions)
          .where(inArray(historySchema.divisions.id, chunk))
          .all(),
      ),
    ).then(rows => rows.flat()),
    Promise.all(
      affectedIdChunks.map(chunk =>
        context.historyDb
          .select()
          .from(historySchema.divisionsI18n)
          .where(inArray(historySchema.divisionsI18n.divisionId, chunk))
          .all(),
      ),
    ).then(rows => rows.flat()),
    context.historyDb
      .select()
      .from(historySchema.snapshotVersionChanges)
      .where(eq(historySchema.snapshotVersionChanges.snapshotId, state.snapshotId))
      .all(),
  ])
  const i18nColumns = [
    'divisionId',
    'locale',
    'name',
    'nameVariant',
    'nameAlts',
    'nameRules',
    'isLocaleInferred',
    'versionHash',
    'sourceReleaseId',
    'snapshotId',
    'isCurrent',
    'createdAt',
    'updatedAt',
  ]
  const changeColumns = [
    'snapshotId',
    'recordType',
    'recordId',
    'locale',
    'versionHash',
    'operation',
    'sourceReleaseId',
    'createdAt',
    'updatedAt',
  ]
  const i18nInsert = prepareRowsForSql(i18nRows, i18nColumns, [
    'divisionId',
    'versionHash',
    'locale',
  ])
  const statements = [
    ...buildCloseHistoryStatements(affectedIds),
    geometryBuildUpsertSql('divisions', divisionRows as Array<Record<string, unknown>>),
    ...buildInsertStatements('divisionsI18n', i18nColumns, i18nInsert.rows, {
      suffix: buildUpdateSuffix(i18nColumns, ['divisionId', 'versionHash', 'locale']),
    }),
    ...buildLargeTextUpdates('divisionsI18n', i18nInsert.largeTextUpdates),
    `DELETE FROM snapshotVersionChanges WHERE snapshotId = ${sqlLiteral(state.snapshotId)};`,
    ...buildInsertStatements('snapshotVersionChanges', changeColumns, changeRows, {
      suffix: buildUpdateSuffix(changeColumns, [
        'snapshotId',
        'recordType',
        'recordId',
        'locale',
      ]),
    }),
  ]

  return sqlFile(statements)
}

async function buildPlandCurrentSql(
  context: LocalAddressDbContext,
  state: PlandSqlState,
) {
  const [divisionRows, i18nRows] = await Promise.all([
    context.currentDb
      .select()
      .from(currentSchema.divisions)
      .where(eq(currentSchema.divisions.snapshotId, state.snapshotId))
      .all(),
    context.currentDb
      .select()
      .from(currentSchema.divisionsI18n)
      .where(eq(currentSchema.divisionsI18n.snapshotId, state.snapshotId))
      .all(),
  ])
  const i18nColumns = [
    'snapshotId',
    'divisionId',
    'locale',
    'name',
    'nameVariant',
    'nameAlts',
    'nameRules',
    'isLocaleInferred',
    'createdAt',
    'updatedAt',
  ]
  const i18nInsert = prepareRowsForSql(i18nRows, i18nColumns, [
    'snapshotId',
    'divisionId',
    'locale',
  ])

  const receipt = await context.currentDb
    .select()
    .from(currentSchema.divisionPublicationState)
    .where(eq(currentSchema.divisionPublicationState.snapshotId, state.snapshotId))
    .get()
  if (!receipt?.preparedAt)
    throw new Error('Planning Division publication preparation is incomplete.')
  const publication: PublicationPreparation = {
    ...receipt,
    table: 'divisionPublicationState',
    timestamp: receipt.preparedAt,
  }
  return sqlFile([
    buildBeginPublicationSql(publication),
    buildGuardedPublicationSql(publication, [
      `DELETE FROM divisionsI18n WHERE snapshotId = ${sqlLiteral(state.snapshotId)};`,
      `DELETE FROM divisions WHERE snapshotId = ${sqlLiteral(state.snapshotId)};`,
      geometryBuildUpsertSql(
        'divisions',
        divisionRows as Array<Record<string, unknown>>,
      ),
      ...buildInsertStatements('divisionsI18n', i18nColumns, i18nInsert.rows),
      ...buildLargeTextUpdates('divisionsI18n', i18nInsert.largeTextUpdates),
    ]),
    buildCompletePublicationSql({
      ...publication,
      validationSql: [
        buildPublicationRowCountSql('divisions', state.snapshotId, divisionRows.length),
        buildPublicationRowCountSql('divisionsI18n', state.snapshotId, i18nRows.length),
      ].join(' AND '),
    }),
  ])
}

function buildCloseSourceStatements(
  tableName: string,
  ids: string[],
  releaseCode: string,
) {
  return buildIdChunks(ids).map(idsSql =>
    `
UPDATE ${tableName}
SET isCurrent = 0, validToRelease = ${sqlLiteral(releaseCode)}, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE isCurrent = 1 AND sourceRecordId IN (${idsSql});`.trim(),
  )
}

function buildCloseHistoryStatements(ids: string[]) {
  return buildIdChunks(ids).flatMap(idsSql => [
    `UPDATE divisions SET isCurrent = 0, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE isCurrent = 1 AND id IN (${idsSql});`,
    `UPDATE divisionsI18n SET isCurrent = 0, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE isCurrent = 1 AND divisionId IN (${idsSql});`,
  ])
}

function buildIdChunks(ids: string[]) {
  return chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 4))
    .filter(chunk => chunk.length > 0)
    .map(chunk => chunk.map(sqlLiteral).join(', '))
}

type LargeTextUpdate = {
  column: string
  keys: Record<string, unknown>
  value: string
}

/** D1 rejects a single SQL statement above its statement-size limit. */
function prepareRowsForSql(
  rows: unknown[],
  columns: string[],
  keyColumns: string[],
  requiredTextColumns: string[] = [],
) {
  const largeTextUpdates: LargeTextUpdate[] = []
  const preparedRows = rows.map(value => {
    const row = { ...(value as Record<string, unknown>) }
    const keys = Object.fromEntries(keyColumns.map(column => [column, row[column]]))

    for (const column of columns) {
      const text = serialiseSqlText(row[column])

      if (
        text === null ||
        new TextEncoder().encode(sqlLiteral(text)).byteLength <=
          PLAND_SQL_STATEMENT_BYTE_TARGET / 4
      ) {
        continue
      }

      largeTextUpdates.push({ column, keys, value: text })
      row[column] = requiredTextColumns.includes(column) ? '' : null
    }

    return row
  })

  return { largeTextUpdates, rows: preparedRows }
}

function buildLargeTextUpdates(table: string, updates: LargeTextUpdate[]) {
  return updates.flatMap(update => {
    const where = Object.entries(update.keys)
      .map(([column, value]) => `${column} = ${sqlLiteral(value)}`)
      .join(' AND ')
    const statements = [`UPDATE ${table} SET ${update.column} = '' WHERE ${where};`]

    for (const chunk of splitPlandSqlText(update.value)) {
      statements.push(
        `UPDATE ${table} SET ${update.column} = ${update.column} || ${sqlLiteral(chunk)} WHERE ${where};`,
      )
    }

    return statements
  })
}

export function splitPlandSqlText(value: string) {
  // At most three UTF-8 bytes are emitted for each UTF-16 code unit. Keeping
  // slices below 8 Ki code units therefore remains comfortably under D1's
  // 96 KiB statement ceiling, including SQL escaping. Slicing is linear; the
  // former character-by-character concatenation allocated quadratically for
  // large Planning Unit source geometries.
  const maxCodeUnits = 8 * 1024
  const chunks: string[] = []
  let start = 0

  while (start < value.length) {
    let end = Math.min(start + maxCodeUnits, value.length)
    if (
      end < value.length &&
      isHighSurrogate(value.charCodeAt(end - 1)) &&
      isLowSurrogate(value.charCodeAt(end))
    ) {
      end -= 1
    }
    chunks.push(value.slice(start, end))
    start = end
  }

  return chunks
}

function isHighSurrogate(value: number) {
  return value >= 0xd800 && value <= 0xdbff
}

function isLowSurrogate(value: number) {
  return value >= 0xdc00 && value <= 0xdfff
}

function serialiseSqlText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return JSON.stringify(value)
  return null
}

export function buildInsertStatements(
  table: string,
  columns: string[],
  rows: unknown[],
  options: { suffix?: string } = {},
) {
  if (rows.length === 0) return []
  const statements: string[] = []
  const prefix = `INSERT INTO ${table} (${columns.join(', ')}) VALUES `
  const suffix = options.suffix ? ` ${options.suffix}` : ''
  let values: string[] = []
  for (const row of rows) {
    const rowRecord = row as Record<string, unknown>
    const value = `(${columns.map(column => sqlLiteral(rowRecord[column])).join(', ')})`
    const candidate = `${prefix}${[...values, value].join(', ')}${suffix};`
    const rowBytes = new TextEncoder().encode(`${prefix}${value}${suffix};`).byteLength
    if (rowBytes > PLAND_SQL_STATEMENT_BYTE_TARGET) {
      throw new Error(
        `Cannot serialise ${table} row: its ${rowBytes}-byte SQL statement exceeds the ${PLAND_SQL_STATEMENT_BYTE_TARGET}-byte safe limit.`,
      )
    }
    if (
      values.length > 0 &&
      new TextEncoder().encode(candidate).byteLength > PLAND_SQL_STATEMENT_BYTE_TARGET
    ) {
      statements.push(`${prefix}${values.join(', ')}${suffix};`)
      values = [value]
    } else {
      values.push(value)
    }
  }
  if (values.length > 0) statements.push(`${prefix}${values.join(', ')}${suffix};`)
  return statements
}

export function buildUpdateSuffix(columns: string[], keys: string[]) {
  const updates = columns.filter(column => !keys.includes(column))
  return `ON CONFLICT(${keys.join(', ')}) DO UPDATE SET ${updates.map(column => `${column} = excluded.${column}`).join(', ')}`
}

export function sqlFile(statements: string[]) {
  return `${statements.filter(Boolean).join('\n\n')}\n`
}

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replaceAll("'", "''")}'`
}
