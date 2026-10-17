import { parseI18nMeta } from '@repo/db'
import type { DatasetProcessingMessage } from '@repo/core'
import { divisionLocaleContent } from '@repo/core/pipeline/db/divisionHistory'
import { buildSourceReleaseId } from '@repo/core/pipeline/db/source'
import {
  overtureSourcePayload,
  saanseoiSourcePayload,
} from '@repo/core/pipeline/services/sources/sourcePayload'
import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
  stableJsonStringify,
} from '@repo/core/pipeline/utils'
import { historyDeletionSql } from '@repo/db'
import { splitLargeInsertLiterals } from '../local/largeSqlLiterals.ts'
import {
  PRIMARY_HISTORY_OWNER_KEY,
  PRIMARY_SOURCE_OWNER_KEY,
  SQL_STATEMENT_BYTE_TARGET,
} from './processLocalDivisionSqlUploadConfig.ts'
import {
  buildDivisionSqlRunId,
  buildSqlImportFile,
  groupIdsByOwnerShard,
} from './processLocalDivisionSqlUploadImport.ts'
import {
  jsonText,
  processDivisionRecordBatches,
} from './processLocalDivisionSqlUploadPreparation.ts'
import type {
  DivisionSqlState,
  SqlValue,
} from './processLocalDivisionSqlUploadTypes.ts'

export async function buildDivisionSourceSqlFile(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
) {
  if (message.source !== 'overture' && message.source !== 'saanseoi') {
    return buildSqlImportFile(
      'source',
      `${buildDivisionSqlRunId(message)}-source.sql`,
      ['SELECT 1;'],
    )
  }

  const table = message.source === 'saanseoi' ? 'ssDivision' : 'overtureDivisions'
  const payload =
    message.source === 'saanseoi' ? saanseoiSourcePayload : overtureSourcePayload
  const resourceReleaseId = buildSourceReleaseId(message)
  const changedBaseRows: Record<string, SqlValue>[] = []
  const changedIds: string[] = []

  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (record.isSupplemental) continue
      if (record.sourceChanged) {
        changedIds.push(record.id)
        changedBaseRows.push({
          sourceRecordId: record.id,
          properties: jsonText(payload(record.raw).properties),
          sourceGeometry: jsonText(payload(record.raw).sourceGeometry),
          versionHash: record.sourcePayloadHash,
          resourceReleaseId,
          validFromRelease: message.sourceVersion,
          validToRelease: null,
          isCurrent: true,
        })
      }
    }
  })

  const publisherIds = new Set(
    state.records.filter(record => !record.isSupplemental).map(record => record.id),
  )
  const missingIds = [...state.currentSourceRows.keys()].filter(
    id => !publisherIds.has(id),
  )
  const changedIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentSourceRows,
      changedIds,
      PRIMARY_SOURCE_OWNER_KEY,
    ).get(PRIMARY_SOURCE_OWNER_KEY) ?? []
  const missingIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentSourceRows,
      missingIds,
      PRIMARY_SOURCE_OWNER_KEY,
    ).get(PRIMARY_SOURCE_OWNER_KEY) ?? []
  const now = new Date().toISOString()
  const statements = [
    ...buildCloseSourceVersionStatements(
      changedIdsInPrimary,
      message.sourceVersion,
      now,
      table,
    ),
    ...buildCloseSourceVersionStatements(
      missingIdsInPrimary,
      message.sourceVersion,
      now,
      table,
    ),
    ...buildInsertStatements(
      table,
      [
        'sourceRecordId',
        'properties',
        'sourceGeometry',
        'versionHash',
        'resourceReleaseId',
        'validFromRelease',
        'validToRelease',
        'isCurrent',
      ],
      changedBaseRows,
      {
        suffix: `
ON CONFLICT(sourceRecordId, versionHash, validFromRelease) DO UPDATE SET
  resourceReleaseId = excluded.resourceReleaseId,
  validFromRelease = excluded.validFromRelease,
  validToRelease = NULL,
  isCurrent = 1,
  updatedAt = ${sqlLiteral(now)}
WHERE ${table}.isCurrent <> 1 OR ${table}.validToRelease IS NOT NULL`.trim(),
      },
    ),
  ]

  return buildSqlImportFile(
    'source',
    `${buildDivisionSqlRunId(message)}-source.sql`,
    statements,
  )
}

export async function buildDivisionHistorySqlFile(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
) {
  const baseRows: Record<string, SqlValue>[] = []
  const i18nRows: Record<string, SqlValue>[] = []
  const changedExistingIds: string[] = []
  await processDivisionRecordBatches(state.records, reportProgress, async batch => {
    for (const record of batch) {
      if (record.omitCanonical) continue
      if (!record.currentChanged) {
        continue
      }

      if (record.currentExists) {
        changedExistingIds.push(record.id)
      }

      baseRows.push({
        id: record.id,
        versionHash: record.versionHash,
        snapshotId: state.snapshotId,
        isCurrent: true,
        divisionCode: record.base.divisionCode,
        identifiers: jsonText(record.base.identifiers),
        level: record.base.level,
        class: record.base.class,
        category: record.base.category,
        hierarchies: jsonText(record.base.hierarchies),
        cartography: jsonText(record.base.cartography),
        sources: jsonText(record.base.sources),
        geometry: jsonText(record.base.geometry),
        createdAt: record.base.createdAt,
      })
      i18nRows.push(
        ...(await Promise.all(
          record.canonicalI18n.map(async localised => ({
            divisionId: record.id,
            versionHash: await createHash(divisionLocaleContent(localised)),
            snapshotId: state.snapshotId,
            isCurrent: true,
            locale: localised.locale,
            name: localised.name ?? null,
            nameVariant: jsonText(localised.nameVariant),
            nameAlts: localised.nameAlts ?? null,
            nameRules: jsonText(localised.nameRules),
            createdAt: record.base.createdAt,
            meta: jsonText(parseI18nMeta(localised.meta)),
          })),
        )),
      )
    }
  })

  const missingIds = [...state.currentRows.keys()].filter(id => !state.seenIds.has(id))
  const _changedExistingIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentRows,
      changedExistingIds,
      PRIMARY_HISTORY_OWNER_KEY,
    ).get(PRIMARY_HISTORY_OWNER_KEY) ?? []
  const _missingIdsInPrimary =
    groupIdsByOwnerShard(state.currentRows, missingIds, PRIMARY_HISTORY_OWNER_KEY).get(
      PRIMARY_HISTORY_OWNER_KEY,
    ) ?? []
  const now = new Date().toISOString()
  const statements = [
    ...buildInsertStatements(
      'divisions',
      [
        'id',
        'versionHash',
        'snapshotId',
        'isCurrent',
        'divisionCode',
        'identifiers',
        'level',
        'class',
        'category',
        'hierarchies',
        'cartography',
        'sources',
        'geometry',
        'createdAt',
      ],
      baseRows,
      {
        suffix: `
ON CONFLICT(id, snapshotId) DO NOTHING`.trim(),
      },
    ),
    ...buildInsertStatements(
      'divisionsI18n',
      [
        'divisionId',
        'versionHash',
        'snapshotId',
        'isCurrent',
        'locale',
        'name',
        'nameVariant',
        'nameAlts',
        'nameRules',
        'meta',
        'createdAt',
      ],
      i18nRows,
      {
        suffix: `
ON CONFLICT(divisionId, snapshotId, locale) DO NOTHING`.trim(),
      },
    ),
    ...missingIds.map(recordId =>
      historyDeletionSql({
        snapshotId: state.snapshotId,
        recordType: 'division',
        recordId,
        createdAt: now,
      }),
    ),
  ]

  return buildSqlImportFile(
    'history',
    `${buildDivisionSqlRunId(message)}-history.sql`,
    statements,
  )
}

export async function buildDivisionCurrentSqlFile(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
  scopeId = state.snapshotId,
) {
  const baseRows: Record<string, SqlValue>[] = []
  const i18nRows: Record<string, SqlValue>[] = []
  const removedI18nStatements: string[] = []
  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (record.omitCanonical || !record.currentChanged) {
        continue
      }

      const incomingLocales = new Set(record.canonicalI18n.map(row => row.locale))
      for (const previous of state.currentRows.get(record.id)?.localisedRows ?? []) {
        if (incomingLocales.has(previous.locale)) continue
        removedI18nStatements.push(
          `DELETE FROM divisionsI18n WHERE scopeId = ${sqlLiteral(scopeId)} AND divisionId = ${sqlLiteral(record.id)} AND locale = ${sqlLiteral(previous.locale)};`,
        )
      }

      if (record.baseChanged) {
        baseRows.push({
          scopeId: scopeId,
          id: record.id,
          divisionCode: record.base.divisionCode,
          identifiers: jsonText(record.base.identifiers),
          level: record.base.level,
          class: record.base.class,
          category: record.base.category,
          hierarchies: jsonText(record.base.hierarchies),
          cartography: jsonText(record.base.cartography),
          sources: jsonText(record.base.sources),
          geometry: jsonText(record.base.geometry),
          createdAt: record.base.createdAt,
        })
      }

      i18nRows.push(
        ...record.canonicalI18n
          .filter(
            localised =>
              stableJsonStringify(localised) !==
              stableJsonStringify(
                state.currentRows
                  .get(record.id)
                  ?.localisedRows.find(row => row.locale === localised.locale),
              ),
          )
          .map(localised => ({
            scopeId: scopeId,
            divisionId: record.id,
            locale: localised.locale,
            name: localised.name ?? null,
            nameVariant: jsonText(localised.nameVariant),
            nameAlts: localised.nameAlts ?? null,
            nameRules: jsonText(localised.nameRules),
            createdAt: record.base.createdAt,

            meta: jsonText(parseI18nMeta(localised.meta)),
          })),
      )
    }
  })

  const missingIds = [...state.currentRows.keys()].filter(id => !state.seenIds.has(id))
  const statements = [
    ...buildInsertStatements(
      'divisions',
      [
        'scopeId',
        'id',
        'divisionCode',
        'identifiers',
        'level',
        'class',
        'category',
        'hierarchies',
        'cartography',
        'sources',
        'geometry',
        'createdAt',
      ],
      baseRows,
      {
        suffix: `
ON CONFLICT(scopeId, id) DO UPDATE SET
  divisionCode = excluded.divisionCode,
  identifiers = excluded.identifiers,
  level = excluded.level,
  class = excluded.class,
  category = excluded.category,
  hierarchies = excluded.hierarchies,
  cartography = excluded.cartography,
  sources = excluded.sources,
  geometry = excluded.geometry`.trim(),
      },
    ),
    ...removedI18nStatements,
    ...buildInsertStatements(
      'divisionsI18n',
      [
        'scopeId',
        'divisionId',
        'locale',
        'name',
        'nameVariant',
        'nameAlts',
        'nameRules',
        'meta',
        'createdAt',
      ],
      i18nRows,
      {
        suffix: `
ON CONFLICT(scopeId, divisionId, locale) DO UPDATE SET
  name = excluded.name,
  nameVariant = excluded.nameVariant,
  nameAlts = excluded.nameAlts,
  nameRules = excluded.nameRules,
  meta = excluded.meta
WHERE divisionsI18n.name IS NOT excluded.name
  OR divisionsI18n.nameVariant IS NOT excluded.nameVariant
  OR divisionsI18n.nameAlts IS NOT excluded.nameAlts
  OR divisionsI18n.nameRules IS NOT excluded.nameRules
  OR divisionsI18n.meta IS NOT excluded.meta`.trim(),
      },
    ),
    ...buildDeleteCurrentDivisionStatements(scopeId, missingIds),
  ]

  return buildSqlImportFile(
    'current',
    `${buildDivisionSqlRunId(message)}-current.sql`,
    statements,
  )
}

export function buildCloseSourceVersionStatements(
  sourceRecordIds: string[],
  validToRelease: string,
  now: string,
  table: 'overtureDivisions' | 'ssDivision' = 'overtureDivisions',
) {
  return chunkArray(sourceRecordIds, getMaxItemsPerInClause(1, 4)).flatMap(chunk => {
    if (chunk.length === 0) {
      return []
    }

    const values = chunk.map(sqlLiteral).join(', ')

    return [
      `
UPDATE ${table}
SET isCurrent = 0, validToRelease = ${sqlLiteral(validToRelease)}, updatedAt = ${sqlLiteral(now)}
WHERE isCurrent = 1
  AND sourceRecordId IN (${values});`.trim(),
    ]
  })
}

function _buildDeleteCurrentI18nStatements(snapshotId: string, divisionIds: string[]) {
  return chunkArray(divisionIds, getMaxItemsPerInClause(1, 1)).map(chunk =>
    `
DELETE FROM divisionsI18n
WHERE scopeId = ${sqlLiteral(snapshotId)}
  AND divisionId IN (${chunk.map(sqlLiteral).join(', ')});`.trim(),
  )
}

function buildDeleteCurrentDivisionStatements(
  snapshotId: string,
  divisionIds: string[],
) {
  return chunkArray(divisionIds, getMaxItemsPerInClause(1, 2)).flatMap(chunk => {
    if (chunk.length === 0) {
      return []
    }

    const values = chunk.map(sqlLiteral).join(', ')

    return [
      `
DELETE FROM divisionsI18n
WHERE scopeId = ${sqlLiteral(snapshotId)}
  AND divisionId IN (${values});`.trim(),
      `
DELETE FROM divisions
WHERE scopeId = ${sqlLiteral(snapshotId)}
  AND id IN (${values});`.trim(),
    ]
  })
}

export function buildInsertStatements(
  tableName: string,
  columns: readonly string[],
  rows: Record<string, SqlValue>[],
  options: {
    maxStatementBytes?: number
    suffix?: string
    verb?: string
  } = {},
) {
  if (rows.length === 0) {
    return []
  }

  const statements: string[] = []
  const maxStatementBytes = options.maxStatementBytes ?? SQL_STATEMENT_BYTE_TARGET
  const suffix = options.suffix ? ` ${options.suffix.trim()}` : ''
  const verb = options.verb ?? 'INSERT INTO'
  let currentValues: string[] = []
  const prefix = `${verb} ${tableName} (${columns.join(', ')}) VALUES `

  for (const row of rows) {
    const valueSql = `(${columns.map(column => sqlLiteral(row[column])).join(', ')})`
    const single = `${prefix}${valueSql}${suffix};`
    if (Buffer.byteLength(single) > maxStatementBytes) {
      if (currentValues.length) {
        statements.push(`${prefix}${currentValues.join(', ')}${suffix};`)
        currentValues = []
      }
      statements.push(...splitLargeInsertLiterals(single, maxStatementBytes))
      continue
    }
    const candidate = `${prefix}${[...currentValues, valueSql].join(', ')}${suffix};`

    if (
      currentValues.length > 0 &&
      new TextEncoder().encode(candidate).byteLength > maxStatementBytes
    ) {
      statements.push(`${prefix}${currentValues.join(', ')}${suffix};`)
      currentValues = [valueSql]
      continue
    }

    currentValues.push(valueSql)
  }

  if (currentValues.length > 0) {
    statements.push(`${prefix}${currentValues.join(', ')}${suffix};`)
  }

  return statements
}

export function sqlLiteral(value: SqlValue) {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  return `'${String(value).replaceAll("'", "''")}'`
}
