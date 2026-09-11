import {
  sourceResolutionSql,
  resolvedEntities,
} from '@repo/core/pipeline/db/sourceResolutions'
import { overtureSourcePayload } from '@repo/core/pipeline/services/sources/sourcePayload'
import type { DatasetProcessingMessage } from '@repo/core'
import { splitLargeInsertLiterals } from '../local/largeSqlLiterals.ts'
import { buildSourceReleaseId } from '@repo/core/pipeline/db/source'
import {
  chunkArray,
  getMaxItemsPerInClause,
  stableJsonStringify,
} from '@repo/core/pipeline/utils'
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
  jsonText,
  processDivisionRecordBatches,
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

  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (record.isSupplemental) continue
      if (record.sourceChanged) {
        changedIds.push(record.id)
        changedBaseRows.push({
          sourceRecordId: record.id,
          sourceLocator: jsonText(overtureSourcePayload(record.raw).sourceLocator),
          properties: jsonText(overtureSourcePayload(record.raw).properties),
          sourceGeometry: jsonText(overtureSourcePayload(record.raw).sourceGeometry),
          versionHash: record.sourcePayloadHash,
          releaseId,
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
        'sourceLocator',
        'properties',
        'sourceGeometry',
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
  updatedAt = ${sqlLiteral(now)}
WHERE overtureDivisions.isCurrent <> 1 OR overtureDivisions.validToRelease IS NOT NULL`.trim(),
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
  const resolutionStatements: string[] = []
  const baseRows: Record<string, SqlValue>[] = []
  const i18nRows: Record<string, SqlValue>[] = []
  const changedExistingIds: string[] = []
  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (message.source === 'overture' && !record.isSupplemental)
        resolutionStatements.push(
          sourceResolutionSql({
            snapshotId: state.snapshotId,
            sourceReleaseId: message.releaseId ?? message.datasetId,
            sourceRecordId: record.id,
            sourceVersionHash: record.sourcePayloadHash,
            resolutions: { entities: resolvedEntities({ division: record.id }) },
          }),
        )
      if (record.sourceResolution)
        resolutionStatements.push(sourceResolutionSql(record.sourceResolution))
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
        class: record.base.class,
        category: record.base.category,
        wikidata: record.base.wikidata,
        hierarchies: jsonText(record.base.hierarchies),
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
    ...resolutionStatements,
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
        'class',
        'category',
        'wikidata',
        'hierarchies',
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
      if (!record.currentChanged) {
        continue
      }

      const incomingLocales = new Set(record.canonicalI18n.map(row => row.locale))
      for (const previous of state.currentRows.get(record.id)?.localisedRows ?? []) {
        if (incomingLocales.has(previous.locale)) continue
        removedI18nStatements.push(
          `DELETE FROM divisionsI18n WHERE snapshotId = ${sqlLiteral(scopeId)} AND divisionId = ${sqlLiteral(record.id)} AND locale = ${sqlLiteral(previous.locale)};`,
        )
      }

      if (record.baseChanged) {
        baseRows.push({
          snapshotId: scopeId,
          id: record.id,
          divisionCode: record.base.divisionCode,
          identifiers: jsonText(record.base.identifiers),
          level: record.base.level,
          class: record.base.class,
          category: record.base.category,
          wikidata: record.base.wikidata,
          hierarchies: jsonText(record.base.hierarchies),
          cartography: jsonText(record.base.cartography),
          sources: jsonText(record.base.sources),
          geometry: jsonText(record.base.geometry),
          bbox: jsonText(record.base.bbox),
          createdAt: record.base.createdAt,
          updatedAt: record.base.updatedAt,
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
            snapshotId: scopeId,
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
        'identifiers',
        'level',
        'class',
        'category',
        'wikidata',
        'hierarchies',
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
  divisionCode = excluded.divisionCode,
  identifiers = excluded.identifiers,
  level = excluded.level,
  class = excluded.class,
  category = excluded.category,
  wikidata = excluded.wikidata,
  hierarchies = excluded.hierarchies,
  cartography = excluded.cartography,
  sources = excluded.sources,
  geometry = excluded.geometry,
  bbox = excluded.bbox,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...removedI18nStatements,
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
  updatedAt = excluded.updatedAt
WHERE divisionsI18n.name IS NOT excluded.name
  OR divisionsI18n.nameVariant IS NOT excluded.nameVariant
  OR divisionsI18n.nameAlts IS NOT excluded.nameAlts
  OR divisionsI18n.nameRules IS NOT excluded.nameRules
  OR divisionsI18n.nameProvenance IS NOT excluded.nameProvenance
  OR divisionsI18n.isLocaleInferred IS NOT excluded.isLocaleInferred`.trim(),
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
