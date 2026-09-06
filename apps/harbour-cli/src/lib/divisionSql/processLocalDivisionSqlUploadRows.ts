import type { DatasetProcessingMessage } from '@repo/core'
import { buildSourceReleaseId } from '@repo/core/pipeline/db/source'
import { resolveAdminLevelValue } from '@repo/core/pipeline/services/division'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils'
import type {
  DivisionSqlState,
  SqlValue,
} from './processLocalDivisionSqlUploadTypes.ts'
import {
  buildDivisionSqlRunId,
  buildSqlImportFile,
  groupIdsByOwnerShard,
} from './processLocalDivisionSqlUploadImport.ts'
import {
  asOptionalInteger,
  jsonText,
  processDivisionRecordBatches,
  sourceString,
} from './processLocalDivisionSqlUploadPreparation.ts'
import {
  PRIMARY_HISTORY_OWNER_KEY,
  PRIMARY_SOURCE_OWNER_KEY,
  SQL_STATEMENT_BYTE_TARGET,
} from './processLocalDivisionSqlUploadConfig.ts'

export async function buildDivisionSourceSqlFile(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
) {
  if (message.source !== 'overture') {
    return buildSqlImportFile(
      'source',
      `${buildDivisionSqlRunId(message)}-source.sql`,
      ['SELECT 1;'],
    )
  }

  const releaseId = buildSourceReleaseId(message)
  const changedBaseRows: Record<string, SqlValue>[] = []
  const changedIds: string[] = []
  const unchangedIds: string[] = []

  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (record.sourceChanged) {
        changedIds.push(record.id)
        changedBaseRows.push({
          sourceRecordId: record.id,
          names: jsonText(record.raw.names),
          admin_level: resolveAdminLevelValue(record.raw),
          subtype: sourceString(record.raw.subtype),
          class: sourceString(record.raw.class),
          wikidata: record.base.wikidata,
          hierarchies: jsonText(record.raw.hierarchies),
          cartography: jsonText(record.base.cartography),
          sources: jsonText(record.base.sources),
          rawProperties: jsonText(record.raw),
          version: asOptionalInteger(record.raw.version),
          versionHash: record.sourcePayloadHash,
          releaseId,
          validFromRelease: message.sourceVersion,
          validToRelease: null,
          isCurrent: true,
        })
      } else if (state.currentSourceRows.has(record.id)) {
        unchangedIds.push(record.id)
      }
    }
  })

  const missingIds = [...state.currentSourceRows.keys()].filter(
    id => !state.seenIds.has(id),
  )
  const changedIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentSourceRows,
      changedIds,
      PRIMARY_SOURCE_OWNER_KEY,
    ).get(PRIMARY_SOURCE_OWNER_KEY) ?? []
  const unchangedIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentSourceRows,
      unchangedIds,
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
    ...buildAdvanceSourceReleaseStatements(unchangedIdsInPrimary, releaseId, now),
    ...buildCloseSourceVersionStatements(
      changedIdsInPrimary,
      message.sourceVersion,
      now,
    ),
    ...buildCloseSourceVersionStatements(
      missingIdsInPrimary,
      message.sourceVersion,
      now,
    ),
    ...buildInsertStatements(
      'overtureDivisions',
      [
        'sourceRecordId',
        'names',
        'admin_level',
        'subtype',
        'class',
        'wikidata',
        'hierarchies',
        'cartography',
        'sources',
        'rawProperties',
        'version',
        'versionHash',
        'releaseId',
        'validFromRelease',
        'validToRelease',
        'isCurrent',
      ],
      changedBaseRows,
      {
        suffix: `
ON CONFLICT(sourceRecordId, versionHash) DO UPDATE SET
  releaseId = excluded.releaseId,
  validFromRelease = excluded.validFromRelease,
  validToRelease = NULL,
  isCurrent = 1,
  updatedAt = ${sqlLiteral(now)}`.trim(),
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
  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (!record.currentChanged) {
        continue
      }

      if (record.currentExists) {
        changedExistingIds.push(record.id)
      }

      baseRows.push({
        id: record.id,
        versionHash: record.versionHash,
        sourceReleaseId: message.releaseId ?? message.datasetId,
        snapshotId: state.snapshotId,
        isCurrent: true,
        divisionCode: record.base.divisionCode,
        level: record.base.level,
        type: record.base.type,
        wikidata: record.base.wikidata,
        hierarchy: jsonText(record.base.hierarchy),
        cartography: jsonText(record.base.cartography),
        sources: jsonText(record.base.sources),
        geometry: jsonText(record.base.geometry),
        bbox: jsonText(record.base.bbox),
        createdAt: record.base.createdAt,
        updatedAt: record.base.updatedAt,
      })
      i18nRows.push(
        ...record.canonicalI18n.map(localised => ({
          divisionId: record.id,
          versionHash: record.baseChanged ? record.versionHash : record.i18nVersionHash,
          sourceReleaseId: message.releaseId ?? message.datasetId,
          snapshotId: state.snapshotId,
          isCurrent: true,
          locale: localised.locale,
          name: localised.name ?? null,
          nameVariant: jsonText(localised.nameVariant),
          nameAlts: localised.nameAlts ?? null,
          nameRules: jsonText(localised.nameRules),
          nameProvenance: localised.nameProvenance,
          isLocaleInferred: localised.isLocaleInferred,
          createdAt: record.base.updatedAt,
          updatedAt: record.base.updatedAt,
        })),
      )
    }
  })

  const missingIds = [...state.currentRows.keys()].filter(id => !state.seenIds.has(id))
  const changedExistingIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentRows,
      changedExistingIds,
      PRIMARY_HISTORY_OWNER_KEY,
    ).get(PRIMARY_HISTORY_OWNER_KEY) ?? []
  const missingIdsInPrimary =
    groupIdsByOwnerShard(state.currentRows, missingIds, PRIMARY_HISTORY_OWNER_KEY).get(
      PRIMARY_HISTORY_OWNER_KEY,
    ) ?? []
  const now = new Date().toISOString()
  const statements = [
    ...buildCloseHistoryVersionStatements(changedExistingIdsInPrimary, now),
    ...buildCloseHistoryVersionStatements(missingIdsInPrimary, now),
    ...buildInsertStatements(
      'divisions',
      [
        'id',
        'versionHash',
        'sourceReleaseId',
        'snapshotId',
        'isCurrent',
        'divisionCode',
        'level',
        'type',
        'wikidata',
        'hierarchy',
        'cartography',
        'sources',
        'geometry',
        'bbox',
        'createdAt',
        'updatedAt',
      ],
      baseRows,
      {
        suffix: `
ON CONFLICT(id, versionHash) DO UPDATE SET
  isCurrent = 1,
  sourceReleaseId = excluded.sourceReleaseId,
  snapshotId = excluded.snapshotId,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'divisionsI18n',
      [
        'divisionId',
        'versionHash',
        'sourceReleaseId',
        'snapshotId',
        'isCurrent',
        'locale',
        'name',
        'nameVariant',
        'nameAlts',
        'nameRules',
        'nameProvenance',
        'isLocaleInferred',
        'createdAt',
        'updatedAt',
      ],
      i18nRows,
      {
        suffix: `
ON CONFLICT(divisionId, versionHash, locale) DO UPDATE SET
  sourceReleaseId = excluded.sourceReleaseId,
  snapshotId = excluded.snapshotId,
  isCurrent = 1,
  name = excluded.name,
  nameVariant = excluded.nameVariant,
  nameAlts = excluded.nameAlts,
  nameRules = excluded.nameRules,
  nameProvenance = excluded.nameProvenance,
  isLocaleInferred = excluded.isLocaleInferred,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'snapshotVersionChanges',
      [
        'snapshotId',
        'recordType',
        'recordId',
        'locale',
        'versionHash',
        'operation',
        'sourceReleaseId',
        'createdAt',
        'updatedAt',
      ],
      [
        ...baseRows.map(row => ({
          snapshotId: state.snapshotId,
          recordType: 'division',
          recordId: row.id,
          locale: '',
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: message.releaseId ?? message.datasetId,
          createdAt: now,
          updatedAt: now,
        })),
        ...i18nRows.map(row => ({
          snapshotId: state.snapshotId,
          recordType: 'divisionI18n',
          recordId: row.divisionId,
          locale: row.locale,
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: message.releaseId ?? message.datasetId,
          createdAt: now,
          updatedAt: now,
        })),
        ...missingIds.map(recordId => ({
          snapshotId: state.snapshotId,
          recordType: 'division',
          recordId,
          locale: '',
          versionHash: null,
          operation: 'delete',
          sourceReleaseId: message.releaseId ?? message.datasetId,
          createdAt: now,
          updatedAt: now,
        })),
      ],
      {
        suffix: `
ON CONFLICT(snapshotId, recordType, recordId, locale) DO UPDATE SET
  versionHash = excluded.versionHash,
  operation = excluded.operation,
  sourceReleaseId = excluded.sourceReleaseId,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
  ]

  return buildSqlImportFile(
    'history',
    `${buildDivisionSqlRunId(message)}-history.sql`,
    statements,
  )
}

export async function buildDivisionCurrentInitSqlFile(
  parentSnapshotId: string | null,
  snapshotId: string,
  clonedAt: string,
) {
  const statements: string[] = []

  if (parentSnapshotId && parentSnapshotId !== snapshotId) {
    statements.push(
      `
INSERT INTO divisions (
  snapshotId, id, divisionCode, level, type, wikidata, hierarchy,
  cartography, sources, geometry, bbox, createdAt, updatedAt
)
SELECT
  ${sqlLiteral(snapshotId)}, id, divisionCode, level, type, wikidata, hierarchy,
  cartography, sources, geometry, bbox, ${sqlLiteral(clonedAt)}, ${sqlLiteral(clonedAt)}
FROM divisions
WHERE snapshotId = ${sqlLiteral(parentSnapshotId)}
ON CONFLICT(snapshotId, id) DO NOTHING;`.trim(),
    )
    statements.push(
      `
INSERT INTO divisionsI18n (
  snapshotId, divisionId, locale, name, nameVariant, nameAlts, nameRules,
  nameProvenance, isLocaleInferred, createdAt, updatedAt
)
SELECT
  ${sqlLiteral(snapshotId)}, divisionId, locale, name, nameVariant, nameAlts, nameRules,
  nameProvenance, isLocaleInferred, ${sqlLiteral(clonedAt)}, ${sqlLiteral(clonedAt)}
FROM divisionsI18n
WHERE snapshotId = ${sqlLiteral(parentSnapshotId)}
ON CONFLICT(snapshotId, divisionId, locale) DO NOTHING;`.trim(),
    )
  }

  if (statements.length === 0) {
    return null
  }

  return buildSqlImportFile('current', `${snapshotId}-current-init.sql`, statements)
}

export async function buildDivisionCurrentSqlFile(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
) {
  const baseRows: Record<string, SqlValue>[] = []
  const i18nRows: Record<string, SqlValue>[] = []
  const changedIds: string[] = []
  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (!record.currentChanged) {
        continue
      }

      changedIds.push(record.id)

      if (record.baseChanged) {
        baseRows.push({
          snapshotId: state.snapshotId,
          id: record.id,
          divisionCode: record.base.divisionCode,
          level: record.base.level,
          type: record.base.type,
          wikidata: record.base.wikidata,
          hierarchy: jsonText(record.base.hierarchy),
          cartography: jsonText(record.base.cartography),
          sources: jsonText(record.base.sources),
          geometry: jsonText(record.base.geometry),
          bbox: jsonText(record.base.bbox),
          createdAt: record.base.createdAt,
          updatedAt: record.base.updatedAt,
        })
      }

      i18nRows.push(
        ...record.canonicalI18n.map(localised => ({
          snapshotId: state.snapshotId,
          divisionId: record.id,
          locale: localised.locale,
          name: localised.name ?? null,
          nameVariant: jsonText(localised.nameVariant),
          nameAlts: localised.nameAlts ?? null,
          nameRules: jsonText(localised.nameRules),
          nameProvenance: localised.nameProvenance,
          isLocaleInferred: localised.isLocaleInferred,
          createdAt: record.base.updatedAt,
          updatedAt: record.base.updatedAt,
        })),
      )
    }
  })

  const missingIds = [...state.currentRows.keys()].filter(id => !state.seenIds.has(id))
  const statements = [
    ...buildInsertStatements(
      'divisions',
      [
        'snapshotId',
        'id',
        'divisionCode',
        'level',
        'type',
        'wikidata',
        'hierarchy',
        'cartography',
        'sources',
        'geometry',
        'bbox',
        'createdAt',
        'updatedAt',
      ],
      baseRows,
      {
        suffix: `
ON CONFLICT(snapshotId, id) DO UPDATE SET
  level = excluded.level,
  type = excluded.type,
  wikidata = excluded.wikidata,
  hierarchy = excluded.hierarchy,
  cartography = excluded.cartography,
  sources = excluded.sources,
  geometry = excluded.geometry,
  bbox = excluded.bbox,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildDeleteCurrentI18nStatements(state.snapshotId, changedIds),
    ...buildInsertStatements(
      'divisionsI18n',
      [
        'snapshotId',
        'divisionId',
        'locale',
        'name',
        'nameVariant',
        'nameAlts',
        'nameRules',
        'nameProvenance',
        'isLocaleInferred',
        'createdAt',
        'updatedAt',
      ],
      i18nRows,
      {
        suffix: `
ON CONFLICT(snapshotId, divisionId, locale) DO UPDATE SET
  name = excluded.name,
  nameVariant = excluded.nameVariant,
  nameAlts = excluded.nameAlts,
  nameRules = excluded.nameRules,
  nameProvenance = excluded.nameProvenance,
  isLocaleInferred = excluded.isLocaleInferred,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildDeleteCurrentDivisionStatements(state.snapshotId, missingIds),
  ]

  return buildSqlImportFile(
    'current',
    `${buildDivisionSqlRunId(message)}-current.sql`,
    statements,
  )
}

export function buildAdvanceSourceReleaseStatements(
  sourceRecordIds: string[],
  releaseId: string,
  now: string,
) {
  return chunkArray(sourceRecordIds, getMaxItemsPerInClause(1, 3)).map(chunk =>
    `
UPDATE overtureDivisions
SET releaseId = ${sqlLiteral(releaseId)}, updatedAt = ${sqlLiteral(now)}
WHERE isCurrent = 1
  AND sourceRecordId IN (${chunk.map(sqlLiteral).join(', ')});`.trim(),
  )
}

export function buildCloseSourceVersionStatements(
  sourceRecordIds: string[],
  validToRelease: string,
  now: string,
) {
  return chunkArray(sourceRecordIds, getMaxItemsPerInClause(1, 4)).flatMap(chunk => {
    if (chunk.length === 0) {
      return []
    }

    const values = chunk.map(sqlLiteral).join(', ')

    return [
      `
UPDATE overtureDivisions
SET isCurrent = 0, validToRelease = ${sqlLiteral(validToRelease)}, updatedAt = ${sqlLiteral(now)}
WHERE isCurrent = 1
  AND sourceRecordId IN (${values});`.trim(),
    ]
  })
}

export function buildCloseHistoryVersionStatements(divisionIds: string[], now: string) {
  return chunkArray(divisionIds, getMaxItemsPerInClause(1, 6)).flatMap(chunk => {
    if (chunk.length === 0) {
      return []
    }

    const values = chunk.map(sqlLiteral).join(', ')

    return [
      `
UPDATE divisions
SET isCurrent = 0,
  updatedAt = ${sqlLiteral(now)}
WHERE isCurrent = 1
  AND id IN (${values});`.trim(),
      `
UPDATE divisionsI18n
SET isCurrent = 0,
  updatedAt = ${sqlLiteral(now)}
WHERE isCurrent = 1
  AND divisionId IN (${values});`.trim(),
    ]
  })
}

function buildDeleteCurrentI18nStatements(snapshotId: string, divisionIds: string[]) {
  return chunkArray(divisionIds, getMaxItemsPerInClause(1, 1)).map(chunk =>
    `
DELETE FROM divisionsI18n
WHERE snapshotId = ${sqlLiteral(snapshotId)}
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
WHERE snapshotId = ${sqlLiteral(snapshotId)}
  AND divisionId IN (${values});`.trim(),
      `
DELETE FROM divisions
WHERE snapshotId = ${sqlLiteral(snapshotId)}
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
