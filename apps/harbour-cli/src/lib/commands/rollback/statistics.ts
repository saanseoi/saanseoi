import type { Database, SQLQueryBindings } from 'bun:sqlite'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { stableJsonStringify } from '@repo/core/pipeline/utils'
import {
  and,
  currentSchema,
  eq,
  getTableColumns,
  historySchema,
  metaSchema,
  ne,
  sql,
} from '@repo/db'
import { versionStatisticsDefinitions } from '../../pipeline/statistics/statisticsRecordIdentity.ts'
import { insertProjectionRow } from './projection.ts'
import {
  readExactProjectionRows,
  resolveValidatedProjectionVersions,
  type ProjectionHistoryTarget,
  type ProjectionRow,
} from './projectionReplay.ts'

type DictionaryTable =
  | 'statsFields'
  | 'statsFieldsI18n'
  | 'statsMeasures'
  | 'statsMeasuresI18n'
type DictionaryReference = {
  datasetCode: string
  identity: string
  versionHash: string
}
type Field = typeof historySchema.statsFields.$inferSelect
type Measure = typeof historySchema.statsMeasures.$inferSelect
type Input = {
  /** Disposable current candidate, with no open transaction. */
  current: Database
  metaDb: HarbourReadableDb
  historyTargets: readonly ProjectionHistoryTarget[]
  snapshotId: string | null
  datasetCode: string
  referencePeriodCode: string
}
const tables = [
  'statsRecords',
  'statsFields',
  'statsFieldsI18n',
  'statsMeasures',
  'statsMeasuresI18n',
] as const
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
const referenceKey = (reference: DictionaryReference) =>
  JSON.stringify([reference.datasetCode, reference.identity, reference.versionHash])

/**
 * Restore the complete retained pack membership for one dataset and exact period.
 * History, provenance, publication receipts and all other serving scopes are untouched.
 * The caller delivers only the final keyed differences from this isolated candidate.
 */
export async function restoreStatisticsProjection(input: Input) {
  if (input.current.inTransaction)
    throw new Error(
      'Statistics rollback requires an isolated candidate outside a transaction.',
    )
  if (!input.datasetCode || !input.referencePeriodCode)
    throw new Error(
      'Statistics rollback requires a dataset and exact reference period.',
    )
  const counts: Record<string, number> = Object.fromEntries(
    tables.map(table => [table, 0]),
  )
  const versions = input.snapshotId
    ? await selectedVersions(input, input.snapshotId)
    : new Map()
  for (const version of versions.values())
    if (version.locale)
      throw new Error('Statistics pack journals cannot have a locale.')
  const owners = new Map(
    [...versions.values()].map(version => [
      JSON.stringify([version.recordId, version.versionHash]),
      version.shard,
    ]),
  )
  const copied = new Set<string>()
  input.current.exec('BEGIN')
  try {
    input.current
      .query('DELETE FROM statsRecords WHERE datasetCode=? AND referencePeriodCode=?')
      .run(input.datasetCode, input.referencePeriodCode)
    for await (const rows of readExactProjectionRows(
      { recordType: 'statsRecord', table: 'statsRecords', id: 'id' },
      versions.values(),
    )) {
      const groups = new Map<HarbourReadableDb, ProjectionRow[]>()
      for (const row of rows) {
        if (
          row.datasetCode !== input.datasetCode ||
          row.referencePeriodCode !== input.referencePeriodCode
        )
          continue
        validatePack(row)
        const owner = owners.get(JSON.stringify([row.id, row.versionHash]))
        if (!owner) throw new Error(`Missing Statistics history owner ${row.id}.`)
        const records = groups.get(owner.db) ?? []
        records.push(row)
        groups.set(owner.db, records)
      }
      for (const [history, records] of groups) {
        // The owner is part of this cache key: a later pack can refer to the same
        // definition hash, but its retained owning copy must still be complete.
        const binding = input.historyTargets.find(
          target => target.db === history,
        )?.bindingName
        if (!binding) throw new Error('Missing named Statistics dictionary owner.')
        await copyReferencedDictionaries(
          input.current,
          history,
          binding,
          records,
          copied,
          counts,
        )
        for (const row of records) {
          const existing = input.current
            .query(
              'SELECT datasetCode,referencePeriodCode FROM statsRecords WHERE id=?',
            )
            .get(row.id as string)
          if (existing)
            throw new Error(
              `Statistics pack ${row.id} would overwrite another serving scope.`,
            )
          insertProjectionRow(input.current, 'statsRecords', row)
          counts.statsRecords = (counts.statsRecords ?? 0) + 1
        }
      }
    }
    input.current.exec('COMMIT')
  } catch (error) {
    input.current.exec('ROLLBACK')
    throw error
  }
  return { tables: [...tables], counts }
}

async function selectedVersions(input: Input, snapshotId: string) {
  const snapshot = await input.metaDb
    .select({
      resourceType: metaSchema.metaSnapshots.resourceType,
      cohortKey: metaSchema.metaSnapshots.cohortKey,
    })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, snapshotId))
    .get()
  if (
    snapshot?.resourceType !== 'divisionStatistic' ||
    snapshot.cohortKey !== input.referencePeriodCode
  )
    throw new Error(
      `Statistics snapshot ${snapshotId} does not identify reference period ${input.referencePeriodCode}.`,
    )
  const source = await input.metaDb
    .select({ datasetCode: metaSchema.metaDatasets.code })
    .from(metaSchema.metaSnapshotSources)
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaSnapshotSources.datasetId, metaSchema.metaDatasets.id),
    )
    .where(
      and(
        eq(metaSchema.metaSnapshotSources.snapshotId, snapshotId),
        eq(metaSchema.metaDatasets.code, input.datasetCode),
        ne(metaSchema.metaSnapshotSources.role, 'lookup'),
      ),
    )
    .limit(1)
    .get()
  if (!source)
    throw new Error(
      `Statistics snapshot ${snapshotId} does not select dataset ${input.datasetCode}.`,
    )
  return resolveValidatedProjectionVersions({
    ...input,
    snapshotId,
    recordTypes: ['statsRecord'],
  })
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.entries(value).some(([key, item]) => !key || typeof item !== 'string')
  )
    throw new Error(`Invalid Statistics ${label}.`)
  return value as Record<string, string>
}

function validatePack(row: ProjectionRow) {
  const values = stringRecord(row.values, `values for ${row.id}`)
  const definitions = stringRecord(
    row.fieldDefinitionHashes,
    `field definitions for ${row.id}`,
  )
  if (
    Object.keys(values).length !== Object.keys(definitions).length ||
    Object.keys(values).some(field => !definitions[field])
  )
    throw new Error(
      `Statistics pack ${row.id} has incomplete field definition versions.`,
    )
  const sources = row.fieldSources
  if (
    !sources ||
    typeof sources !== 'object' ||
    Array.isArray(sources) ||
    Object.keys(values).some(field => {
      const source = (sources as Record<string, unknown>)[field]
      return (
        !source ||
        typeof source !== 'object' ||
        Array.isArray(source) ||
        !('sourceReleaseId' in source) ||
        typeof source.sourceReleaseId !== 'string' ||
        !source.sourceReleaseId ||
        !('sourceFeatureRef' in source) ||
        typeof source.sourceFeatureRef !== 'string' ||
        !source.sourceFeatureRef
      )
    })
  )
    throw new Error(
      `Statistics pack ${row.id} has incomplete retained field provenance.`,
    )
}

async function copyReferencedDictionaries(
  current: Database,
  history: HarbourReadableDb,
  binding: string,
  records: ProjectionRow[],
  copied: Set<string>,
  counts: Record<string, number>,
) {
  const wanted = new Map<string, DictionaryReference>()
  for (const record of records)
    for (const [identity, versionHash] of Object.entries(
      stringRecord(record.fieldDefinitionHashes, 'field definitions'),
    )) {
      const reference = {
        datasetCode: String(record.datasetCode),
        identity,
        versionHash,
      }
      const key = referenceKey(reference)
      if (!copied.has(JSON.stringify([binding, key]))) wanted.set(key, reference)
    }
  if (!wanted.size) return
  const references = [...wanted.values()]
  const fields = (await readDefinitions(history, 'statsFields', references)) as Field[]
  requireCompleteDefinitions(fields, references, 'fieldName', 'field')
  const fieldLocales = await readDefinitions(history, 'statsFieldsI18n', references)
  const measureReferences = new Map<string, DictionaryReference>()
  for (const field of fields) {
    if (!field.measureCode || !field.measureVersionHash)
      throw new Error(`Missing Statistics measure version for ${field.fieldName}.`)
    const reference = {
      datasetCode: field.datasetCode,
      identity: field.measureCode,
      versionHash: field.measureVersionHash,
    }
    measureReferences.set(referenceKey(reference), reference)
  }
  const measures = (await readDefinitions(history, 'statsMeasures', [
    ...measureReferences.values(),
  ])) as Measure[]
  requireCompleteDefinitions(
    measures,
    [...measureReferences.values()],
    'measureCode',
    'measure',
  )
  const measureLocales = await readDefinitions(history, 'statsMeasuresI18n', [
    ...measureReferences.values(),
  ])
  for (const field of fields) {
    const measure = measures.find(
      row =>
        row.datasetCode === field.datasetCode &&
        row.measureCode === field.measureCode &&
        row.versionHash === field.measureVersionHash,
    )
    if (!measure)
      throw new Error(`Missing Statistics measure content for ${field.fieldName}.`)
    const definitions = versionStatisticsDefinitions({
      fields: [field],
      measures: [measure],
      fieldsI18n: fieldLocales.filter(
        row =>
          row.datasetCode === field.datasetCode &&
          row.fieldName === field.fieldName &&
          row.versionHash === field.versionHash,
      ),
      measuresI18n: measureLocales.filter(
        row =>
          row.datasetCode === measure.datasetCode &&
          row.measureCode === measure.measureCode &&
          row.versionHash === measure.versionHash,
      ),
    })
    if (
      definitions.fields[0]?.versionHash !== field.versionHash ||
      definitions.measures[0]?.versionHash !== measure.versionHash
    )
      throw new Error(
        `Statistics definition content or localisations do not match retained versions for ${field.fieldName}.`,
      )
  }
  for (const [table, rows] of [
    ['statsFields', fields],
    ['statsFieldsI18n', fieldLocales],
    ['statsMeasures', measures],
    ['statsMeasuresI18n', measureLocales],
  ] as const)
    for (const row of rows)
      if (insertMissingDictionary(current, table, row))
        counts[table] = (counts[table] ?? 0) + 1
  for (const key of wanted.keys()) copied.add(JSON.stringify([binding, key]))
}

async function readDefinitions(
  history: HarbourReadableDb,
  name: DictionaryTable,
  references: DictionaryReference[],
) {
  const table = historySchema[name]
  const identity = 'fieldName' in table ? table.fieldName : table.measureCode
  const rows: ProjectionRow[] = []
  for (let offset = 0; offset < references.length; offset += 100) {
    // A JSON tuple set uses one SQL parameter, even for complete packed dictionaries.
    const page = JSON.stringify(references.slice(offset, offset + 100))
    rows.push(
      ...(await history
        .select()
        .from(table)
        .where(sql`exists (select 1 from json_each(${page}) selected
      where ${table.datasetCode} = json_extract(selected.value, '$.datasetCode')
      and ${identity} = json_extract(selected.value, '$.identity')
      and ${table.versionHash} = json_extract(selected.value, '$.versionHash'))`)
        .all()),
    )
  }
  return rows
}

function requireCompleteDefinitions(
  rows: ProjectionRow[],
  references: DictionaryReference[],
  identity: string,
  label: string,
) {
  const expected = new Set(references.map(referenceKey))
  for (const row of rows) {
    const key = referenceKey({
      datasetCode: String(row.datasetCode),
      identity: String(row[identity]),
      versionHash: String(row.versionHash),
    })
    if (!expected.delete(key))
      throw new Error(`Ambiguous Statistics ${label} definition ${key}.`)
  }
  if (expected.size)
    throw new Error(`Missing Statistics ${label} definitions in owning history shard.`)
}

function insertMissingDictionary(
  current: Database,
  name: DictionaryTable,
  row: ProjectionRow,
) {
  const columns = getTableColumns(currentSchema[name])
  const keys = [
    'datasetCode',
    name.startsWith('statsFields') ? 'fieldName' : 'measureCode',
    'versionHash',
    ...(name.endsWith('I18n') ? ['locale'] : []),
  ]
  const existing = current
    .query<ProjectionRow, SQLQueryBindings[]>(
      `SELECT * FROM ${quote(name)} WHERE ${keys.map(key => `${quote(key)}=?`).join(' AND ')}`,
    )
    .get(...keys.map(key => row[key] as SQLQueryBindings))
  if (existing) {
    for (const column of Object.values(columns)) {
      if (column.name === 'createdAt' || column.name === 'updatedAt') continue
      const stored = existing[column.name]
      const decoded = stored == null ? null : column.mapFromDriverValue(stored)
      if (
        stableJsonStringify(decoded) !== stableJsonStringify(row[column.name] ?? null)
      )
        throw new Error(
          `Conflicting immutable Statistics dictionary ${name}/${keys.map(key => row[key]).join('/')}.`,
        )
    }
    return false
  }
  insertProjectionRow(current, name, row)
  return true
}
