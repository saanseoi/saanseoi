import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { withPrimarySession } from '../d1'
import {
  listPublishedStatisticsTargets,
  type StatisticsPublicationTarget,
} from './statisticsPublicationTargets'

export type StatisticsD1Statement = {
  bind(...values: unknown[]): StatisticsD1Statement
  all<T>(): Promise<{ results: T[] }>
  first<T>(): Promise<T | null>
  run(): Promise<unknown>
}
export type StatisticsD1Database = {
  prepare(sql: string): StatisticsD1Statement
  batch(statements: StatisticsD1Statement[]): Promise<unknown>
}

type PublicationManifest = {
  snapshotId: string
  status: 'publishing' | 'current'
}
type StoredRow = Record<string, string | number | null>
type VersionChange = {
  recordId: string
  versionHash: string | null
  operation: 'upsert' | 'delete'
}
type SelectedChange = VersionChange & { binding: StatisticsD1Database }
type FieldReference = { datasetCode: string; fieldName: string; versionHash: string }
type MeasureReference = {
  datasetCode: string
  measureCode: string
  versionHash: string
}
type StatisticsBindings = { DB_CURRENT: StatisticsD1Database } & Record<string, unknown>
const PAGE_SIZE = 40

/**
 * Publication is the sole writer of the latest statistic packs. The manifest
 * gates public reads during this cross-database operation and makes retries
 * repairable without copying unchanged observations or snapshot membership.
 */
export async function finalisePublishedStatistics(
  db: HarbourReadableDb,
  bindings: StatisticsBindings,
  options: { publishedFamilies?: readonly string[] } = {},
) {
  if (options.publishedFamilies && !options.publishedFamilies.includes('stats')) return
  const current = withPrimarySession(bindings.DB_CURRENT)
  for (const target of await listPublishedStatisticsTargets(db)) {
    await promotePublishedStatisticsTarget(db, current, bindings, target)
  }
}

export async function promotePublishedStatisticsTarget(
  db: HarbourReadableDb,
  current: StatisticsD1Database,
  bindings: Record<string, unknown>,
  target: StatisticsPublicationTarget,
) {
  const manifest = await current
    .prepare(
      'SELECT snapshotId, status FROM statsPublicationState WHERE datasetCode = ? AND referencePeriodCode = ?',
    )
    .bind(target.datasetCode, target.referencePeriodCode)
    .first<PublicationManifest>()
  if (manifest?.status === 'current' && manifest.snapshotId === target.snapshotId) {
    return { changedRecords: 0 }
  }

  const plan = await resolveSnapshotReplayPlan(db, target.snapshotId)
  if (manifest && !plan.some(step => step.snapshotId === manifest.snapshotId)) {
    const selectedPlan = await resolveSnapshotReplayPlan(db, manifest.snapshotId)
    if (selectedPlan.some(step => step.snapshotId === target.snapshotId)) {
      // A concurrently completed later publication must never be rolled back
      // by an older finalisation request that selected its work beforehand.
      return { changedRecords: 0 }
    }
    throw new Error(
      `Statistic publication ${target.snapshotId} does not extend current selection ${manifest.snapshotId}.`,
    )
  }
  // Only an entirely completed ancestor is a trusted incremental baseline.
  // A failed finalisation may already contain an arbitrary prefix of changes.
  const ancestorIndex =
    manifest?.status === 'current'
      ? plan.findIndex(step => step.snapshotId === manifest.snapshotId)
      : -1
  const steps = ancestorIndex < 0 ? plan : plan.slice(ancestorIndex + 1)
  const changes = new Map<string, SelectedChange>()
  for (const step of steps) {
    if (step.shards.length === 0) {
      throw new Error(
        `Statistic snapshot ${step.snapshotId} has no history shard assignment.`,
      )
    }
    for (const assignment of step.shards) {
      const binding = requireHistoryBinding(bindings, assignment.bindingName)
      const result = await binding
        .prepare(
          'SELECT recordId, versionHash, operation FROM snapshotVersionChanges WHERE snapshotId = ? AND recordType = ?',
        )
        .bind(step.snapshotId, 'statsRecord')
        .all<VersionChange>()
      for (const change of result.results) {
        changes.set(change.recordId, { ...change, binding })
      }
    }
  }

  const now = new Date().toISOString()
  await current
    .prepare(
      `INSERT INTO statsPublicationState
       (datasetCode, referencePeriodCode, snapshotId, status, createdAt, updatedAt)
       VALUES (?, ?, ?, 'publishing', ?, ?)
       ON CONFLICT(datasetCode, referencePeriodCode) DO UPDATE SET
         snapshotId = excluded.snapshotId, status = 'publishing', updatedAt = excluded.updatedAt
       WHERE statsPublicationState.snapshotId IS ? AND statsPublicationState.status IS ?`,
    )
    .bind(
      target.datasetCode,
      target.referencePeriodCode,
      target.snapshotId,
      now,
      now,
      manifest?.snapshotId ?? null,
      manifest?.status ?? null,
    )
    .run()
  const acquired = await current
    .prepare(
      'SELECT snapshotId, status FROM statsPublicationState WHERE datasetCode = ? AND referencePeriodCode = ?',
    )
    .bind(target.datasetCode, target.referencePeriodCode)
    .first<PublicationManifest>()
  if (acquired?.snapshotId !== target.snapshotId || acquired.status !== 'publishing') {
    throw new Error(
      `Statistic publication selection changed during finalisation of ${target.snapshotId}.`,
    )
  }

  let changedRecords = 0
  const copiedDictionaryVersions = new Set<string>()
  for (const page of pages([...changes.values()])) {
    const existing = await current
      .prepare(
        'SELECT id, versionHash FROM statsRecords WHERE id IN (SELECT value FROM json_each(?))',
      )
      .bind(JSON.stringify(page.map(change => change.recordId)))
      .all<{ id: string; versionHash: string }>()
    const existingVersions = new Map(
      existing.results.map(row => [row.id, row.versionHash]),
    )
    const byBinding = new Map<StatisticsD1Database, SelectedChange[]>()
    const deletes: StatisticsD1Statement[] = []
    for (const change of page) {
      if (change.operation === 'delete') {
        if (!existingVersions.has(change.recordId)) continue
        deletes.push(
          current
            .prepare(
              `DELETE FROM statsRecords WHERE id = ? AND datasetCode = ? AND referencePeriodCode = ? AND ${publicationGuard()}`,
            )
            .bind(
              change.recordId,
              target.datasetCode,
              target.referencePeriodCode,
              ...publicationIdentity(target),
            ),
        )
        continue
      }
      if (!change.versionHash)
        throw new Error(`Missing statistic version for ${change.recordId}.`)
      if (existingVersions.get(change.recordId) === change.versionHash) continue
      const selected = byBinding.get(change.binding) ?? []
      selected.push(change)
      byBinding.set(change.binding, selected)
    }
    if (deletes.length) {
      await current.batch(deletes)
      changedRecords += deletes.length
    }
    for (const [history, selected] of byBinding) {
      const result = await history
        .prepare(
          `SELECT r.* FROM statsRecords r JOIN json_each(?) selected
           ON r.id = json_extract(selected.value, '$.recordId')
           AND r.versionHash = json_extract(selected.value, '$.versionHash')`,
        )
        .bind(
          JSON.stringify(
            selected.map(({ recordId, versionHash }) => ({ recordId, versionHash })),
          ),
        )
        .all<StoredRow>()
      if (result.results.length !== selected.length) {
        throw new Error(
          `Missing retained statistic versions for snapshot ${target.snapshotId}.`,
        )
      }
      const rows = result.results.filter(
        row =>
          row.datasetCode === target.datasetCode &&
          row.referencePeriodCode === target.referencePeriodCode,
      )
      await copyReferencedDictionaries(
        history,
        current,
        target,
        rows,
        copiedDictionaryVersions,
      )
      const statements = rows.map(row => currentRecordUpsert(current, target, row))
      if (statements.length) await current.batch(statements)
      changedRecords += statements.length
    }
  }

  await current
    .prepare(
      `UPDATE statsPublicationState SET status = 'current', updatedAt = ?
       WHERE datasetCode = ? AND referencePeriodCode = ? AND snapshotId = ? AND status = 'publishing'`,
    )
    .bind(new Date().toISOString(), ...publicationIdentity(target))
    .run()
  return { changedRecords }
}

async function copyReferencedDictionaries(
  history: StatisticsD1Database,
  current: StatisticsD1Database,
  target: StatisticsPublicationTarget,
  records: StoredRow[],
  copied: Set<string>,
) {
  const fields = new Map<string, FieldReference>()
  for (const record of records) {
    const definitions = parseObject(record.fieldDefinitionHashes)
    for (const [fieldName, versionHash] of Object.entries(definitions)) {
      const reference = {
        datasetCode: String(record.datasetCode),
        fieldName,
        versionHash,
      }
      const key = JSON.stringify(reference)
      if (!copied.has(key)) fields.set(key, reference)
    }
  }
  if (!fields.size) return
  const references = [...fields.values()]
  const fieldRows = await selectDictionaryVersions(
    history,
    'statsFields',
    references,
    'fieldName',
  )
  if (fieldRows.length !== fields.size) {
    throw new Error(
      `Missing statistic field definitions for snapshot ${target.snapshotId}.`,
    )
  }
  const measures = new Map<string, MeasureReference>()
  for (const row of fieldRows) {
    const reference = {
      datasetCode: String(row.datasetCode),
      measureCode: String(row.measureCode),
      versionHash: String(row.measureVersionHash),
    }
    measures.set(JSON.stringify(reference), reference)
  }
  const measureReferences = [...measures.values()]
  const measureRows = await selectDictionaryVersions(
    history,
    'statsMeasures',
    measureReferences,
    'measureCode',
  )
  if (measureRows.length !== measures.size) {
    throw new Error(
      `Missing statistic measure definitions for snapshot ${target.snapshotId}.`,
    )
  }
  const dictionaries: Array<{ table: string; rows: StoredRow[] }> = [
    { table: 'statsFields', rows: fieldRows },
    {
      table: 'statsFieldsI18n',
      rows: await selectDictionaryVersions(
        history,
        'statsFieldsI18n',
        references,
        'fieldName',
      ),
    },
    { table: 'statsMeasures', rows: measureRows },
    {
      table: 'statsMeasuresI18n',
      rows: await selectDictionaryVersions(
        history,
        'statsMeasuresI18n',
        measureReferences,
        'measureCode',
      ),
    },
  ]
  for (const dictionary of dictionaries) {
    for (const page of pages(dictionary.rows)) {
      await current.batch(
        page.map(row =>
          immutableDictionaryInsert(current, target, dictionary.table, row),
        ),
      )
    }
  }
  for (const key of fields.keys()) copied.add(key)
}

async function selectDictionaryVersions(
  history: StatisticsD1Database,
  table: string,
  references: FieldReference[] | MeasureReference[],
  identity: 'fieldName' | 'measureCode',
) {
  const rows: StoredRow[] = []
  for (const page of pages<FieldReference | MeasureReference>(references)) {
    const result = await history
      .prepare(
        `SELECT d.* FROM ${quote(table)} d JOIN json_each(?) selected
         ON d.datasetCode = json_extract(selected.value, '$.datasetCode')
         AND d.${quote(identity)} = json_extract(selected.value, '$.${identity}')
         AND d.versionHash = json_extract(selected.value, '$.versionHash')`,
      )
      .bind(JSON.stringify(page))
      .all<StoredRow>()
    rows.push(...result.results)
  }
  return rows
}

function currentRecordUpsert(
  current: StatisticsD1Database,
  target: StatisticsPublicationTarget,
  row: StoredRow,
) {
  const canonical = currentColumns(row)
  const columns = Object.keys(canonical)
  return current
    .prepare(
      `INSERT INTO statsRecords (${columns.map(quote).join(', ')})
       SELECT ${columns.map(() => '?').join(', ')} WHERE ${publicationGuard()}
       ON CONFLICT(id) DO UPDATE SET ${columns
         .filter(column => column !== 'id')
         .map(column => `${quote(column)} = excluded.${quote(column)}`)
         .join(', ')}
       WHERE statsRecords.versionHash IS NOT excluded.versionHash`,
    )
    .bind(...Object.values(canonical), ...publicationIdentity(target))
}

function immutableDictionaryInsert(
  current: StatisticsD1Database,
  target: StatisticsPublicationTarget,
  table: string,
  row: StoredRow,
) {
  const { sourceReleaseId: _sourceReleaseId, ...canonical } = currentColumns(row)
  const columns = Object.keys(canonical)
  return current
    .prepare(
      `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')})
       SELECT ${columns.map(() => '?').join(', ')} WHERE ${publicationGuard()}
       ON CONFLICT DO NOTHING`,
    )
    .bind(...Object.values(canonical), ...publicationIdentity(target))
}

function currentColumns(row: StoredRow) {
  const { isCurrent: _isCurrent, snapshotId: _snapshotId, ...canonical } = row
  return canonical
}

function publicationGuard() {
  return `EXISTS (SELECT 1 FROM statsPublicationState
    WHERE datasetCode = ? AND referencePeriodCode = ? AND snapshotId = ? AND status = 'publishing')`
}

function publicationIdentity(target: StatisticsPublicationTarget) {
  return [target.datasetCode, target.referencePeriodCode, target.snapshotId]
}

function parseObject(value: StoredRow[string] | undefined): Record<string, string> {
  if (typeof value !== 'string')
    throw new Error('Missing packed statistic definition hashes.')
  return JSON.parse(value) as Record<string, string>
}

function requireHistoryBinding(bindings: Record<string, unknown>, name: string) {
  const binding = bindings[name]
  if (!binding || typeof binding !== 'object' || !('prepare' in binding)) {
    throw new Error(`Unavailable statistic history binding ${name}.`)
  }
  return withPrimarySession(binding as StatisticsD1Database)
}

function pages<T>(rows: readonly T[]): T[][] {
  const result: T[][] = []
  for (let index = 0; index < rows.length; index += PAGE_SIZE) {
    result.push(rows.slice(index, index + PAGE_SIZE))
  }
  return result
}

function quote(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}
