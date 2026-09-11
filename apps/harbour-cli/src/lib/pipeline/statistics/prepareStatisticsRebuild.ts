import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { historySchema } from '@repo/db'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  finalisePublishedStatistics,
  type StatisticsD1Database,
} from '../../../../../harbour-api/src/lib/services/statisticsPublication'
import { resolveShardBindingName } from '../../dbCache/localDbCache'
import { planCanonicalStatistics } from './planCanonicalStatistics'
import { packRetainedStatistics, type RetainedSqlRow } from './packRetainedStatistics'
import { hashStatisticContent } from './statisticsRecordIdentity'

const TABLES = [
  'statsRecords',
  'statsFields',
  'statsFieldsI18n',
  'statsMeasures',
  'statsMeasuresI18n',
  'statsValuesI18n',
] as const
const ROOT = resolve(import.meta.dir, '../../../../../..')
type Snapshot = {
  id: string
  parentSnapshotId: string | null
  cohortKey: string
  status: string
  createdAt: string
  sourceReleaseId: string
  sourceVersion: string
  releaseCode: string
  datasetCode: string
}
export type StatisticsRebuildInputs = {
  meta: string
  current: string
  history: Array<{ bindingName: string; path: string }>
  source: string[]
}

/**
 * Prepare a complete replacement of Stats content in a new directory. Inputs
 * are read-only and remain the authority for publication and source evidence.
 */
export async function prepareStatisticsRebuild(
  input: StatisticsRebuildInputs,
  outputDirectory: string,
) {
  const output = resolve(outputDirectory)
  if (existsSync(output)) throw new Error(`Rebuild output already exists: ${output}.`)
  if (
    !input.history.length ||
    new Set(input.history.map(row => row.bindingName)).size !== input.history.length
  ) {
    throw new Error('Provide a unique binding name for every retained history shard.')
  }
  for (const history of input.history) {
    if (!/^DB_HISTORY_[A-Z]+_(?:BEFORE|\d{4})$/.test(history.bindingName))
      throw new Error(`Invalid history binding: ${history.bindingName}.`)
  }
  const opened: Database[] = []
  const openReadOnly = (path: string) => {
    const db = new Database(resolve(path), { readonly: true })
    db.exec('BEGIN')
    opened.push(db)
    return db
  }
  const meta = openReadOnly(input.meta)
  const currentInput = openReadOnly(input.current)
  const historyInputs = input.history.map(row => ({
    ...row,
    db: openReadOnly(row.path),
  }))
  const sourceInputs = input.source.map(openReadOnly)
  const outputDbs: Database[] = []
  const writers: ReturnType<ReturnType<typeof Bun.file>['writer']>[] = []
  try {
    const snapshots = listRetainedSnapshots(meta)
    const legacyCount = historyInputs.reduce(
      (sum, row) => sum + count(row.db, 'statsRecords'),
      0,
    )
    if (!legacyCount)
      throw new Error('No retained statistic observations were supplied.')
    if (!snapshots.length)
      throw new Error(
        'Retained observations have no Statistics snapshots; recover their metadata first.',
      )
    assertLegacyInventories(historyInputs, snapshots)
    assertCurrentCoveredByHistory(currentInput, historyInputs)
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, 'inputs.json'), JSON.stringify(input, null, 2))
    const current = createOutputDb(join(output, 'current.stats.sqlite'), 'current')
    outputDbs.push(current)
    const outputs = new Map(
      input.history.map(row => {
        const db = createOutputDb(
          join(output, `${row.bindingName}.stats.sqlite`),
          'history',
        )
        outputDbs.push(db)
        return [row.bindingName, db] as const
      }),
    )
    const historyDbs = [...outputs.values()].map(
      db =>
        drizzle({ client: db, schema: historySchema }) as unknown as HarbourReadableDb,
    )
    const metaDb = createLocalHarbourDb(meta)
    const mappingWriter = Bun.file(
      join(output, 'legacy-observation-map.ndjson'),
    ).writer()
    const archiveWriter = Bun.file(
      join(output, 'retained-legacy-statistics.ndjson'),
    ).writer()
    writers.push(mappingWriter, archiveWriter)
    // Preserve input assertions, including unselected local processing versions,
    // before deduplicating the immutable semantic dictionary/content versions.
    for (const shard of historyInputs)
      for (const table of TABLES) {
        for (const row of shard.db.query(`SELECT * FROM ${quote(table)}`).iterate()) {
          archiveWriter.write(
            `${JSON.stringify({ bindingName: shard.bindingName, table, row })}\n`,
          )
        }
      }
    const snapshotReports = []
    const packedIds = new Map<string, string>()
    let selectedLegacyRows = 0
    let retainedValueCount = 0
    for (const snapshot of snapshots) {
      const canonicalInput = readSnapshotInput(historyInputs, snapshot)
      selectedLegacyRows += canonicalInput.records.length
      const packed = packRetainedStatistics({
        ...canonicalInput,
        sourceVersion: snapshot.sourceVersion,
        sourceProperties: sourcePropertiesReader(sourceInputs, snapshot),
      })
      retainedValueCount += packed.canonical.records.reduce(
        (sum, row) => sum + Object.keys(row.values).length,
        0,
      )
      const plan = await planCanonicalStatistics({
        canonical: packed.canonical,
        metaDb,
        historyDbs,
        snapshots: [snapshot],
        sourceReleaseId: snapshot.sourceReleaseId,
        now: snapshot.createdAt,
      })
      const batches = plan.buildBatches()
      for (const history of batches.history) {
        const bindingName = resolveShardBindingName('history', 'HK', history.shardYear)
        const db = outputs.get(bindingName)
        if (!db) throw new Error(`Missing output history shard ${bindingName}.`)
        db.transaction(() => {
          for (const sql of history.batches) db.exec(sql)
        })()
      }
      for (const mapping of packed.mappings) {
        const key = JSON.stringify([snapshot.sourceReleaseId, mapping.legacyId])
        const previous = packedIds.get(key)
        if (previous && previous !== mapping.packedId)
          throw new Error(`Ambiguous packed identity for ${mapping.legacyId}.`)
        packedIds.set(key, mapping.packedId)
        mappingWriter.write(
          `${JSON.stringify({ snapshotId: snapshot.id, sourceReleaseId: snapshot.sourceReleaseId, ...mapping })}\n`,
        )
      }
      snapshotReports.push({
        snapshotId: snapshot.id,
        datasetCode: snapshot.datasetCode,
        referencePeriodCode: snapshot.cohortKey,
        status: snapshot.status,
        legacyRows: canonicalInput.records.length,
        packedRows: packed.canonical.records.length,
        changedRows: plan.changedRecords.length,
        unchangedRows: plan.unchangedRecords,
      })
    }
    const sourceResolutionCount = copySourceResolutions(
      historyInputs,
      outputs,
      packedIds,
    )
    const bindings: { DB_CURRENT: StatisticsD1Database } & Record<string, unknown> = {
      DB_CURRENT: sqliteD1(current),
    }
    for (const [name, db] of outputs) bindings[name] = sqliteD1(db)
    await finalisePublishedStatistics(metaDb, bindings)
    for (const [name, db] of [['current', current], ...outputs] as const) {
      await exportReplacementSql(
        db,
        join(output, `${name}.stats.sql`),
        name === 'current',
      )
    }
    // Running the generated dictionary migrations over duplicate release-scoped
    // definitions can violate their tighter keys. These reviewed preparation
    // files clear only the materialised Stats content before normal migrations.
    writeFileSync(
      join(output, 'current.clear-before-migration.sql'),
      clearSql(currentInput),
    )
    for (const shard of historyInputs)
      writeFileSync(
        join(output, `${shard.bindingName}.clear-before-migration.sql`),
        clearSql(shard.db),
      )
    const report = {
      inputCurrentRows: count(currentInput, 'statsRecords'),
      inputHistoryRows: legacyCount,
      selectedLegacyRows,
      retainedValueCount,
      historyRows: [...outputs.values()].reduce(
        (sum, db) => sum + count(db, 'statsRecords'),
        0,
      ),
      currentRows: count(current, 'statsRecords'),
      publicationStates: count(current, 'statsPublicationState'),
      journalRows: [...outputs.values()].reduce(
        (sum, db) => sum + count(db, 'snapshotVersionChanges'),
        0,
      ),
      sourceResolutions: sourceResolutionCount,
      snapshots: snapshotReports,
      publication:
        'unchanged; current contains only already-published latest selections',
    }
    for (const writer of writers) await writer.end()
    writers.length = 0
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2))
    writeFileSync(
      join(output, 'READY'),
      'Validated offline Statistics preparation. No input database was changed.\n',
    )
    return report
  } finally {
    for (const writer of writers) await writer.end()
    for (const db of outputDbs) db.close()
    for (const db of opened) {
      db.exec('ROLLBACK')
      db.close()
    }
  }
}

function listRetainedSnapshots(meta: Database) {
  const rows = meta
    .query(`SELECT s.id, s.parentSnapshotId, s.cohortKey, s.status, s.createdAt,
    ss.resourceReleaseId AS sourceReleaseId, r.sourceVersion, r.code AS releaseCode, d.code AS datasetCode
    FROM snapshots s JOIN snapshotSources ss ON ss.snapshotId = s.id
    JOIN releases r ON r.id = ss.resourceReleaseId JOIN datasets d ON d.id = ss.datasetId
    WHERE s.resourceType = 'divisionStatistic' AND ss.role <> 'lookup'
    ORDER BY s.createdAt, s.revision, s.id`)
    .all() as Snapshot[]
  const snapshots = new Map<string, Snapshot>()
  for (const row of rows) {
    if (snapshots.has(row.id))
      throw new Error(`Statistic snapshot ${row.id} has ambiguous source membership.`)
    snapshots.set(row.id, row)
  }
  const ordered: Snapshot[] = []
  const seen = new Set<string>()
  function visit(row: Snapshot, ancestors = new Set<string>()) {
    if (seen.has(row.id)) return
    if (ancestors.has(row.id))
      throw new Error(`Statistic snapshot parent cycle: ${row.id}.`)
    ancestors.add(row.id)
    if (row.parentSnapshotId) {
      const parent = snapshots.get(row.parentSnapshotId)
      if (!parent)
        throw new Error(`Missing retained statistic parent ${row.parentSnapshotId}.`)
      visit(parent, ancestors)
    }
    seen.add(row.id)
    ordered.push(row)
  }
  for (const row of rows) visit(row)
  return ordered
}

function assertLegacyInventories(
  shards: Array<{ db: Database }>,
  snapshots: Snapshot[],
) {
  const scopes = new Set(
    snapshots.map(row => JSON.stringify([row.sourceReleaseId, row.cohortKey])),
  )
  for (const shard of shards) {
    const rows = shard.db
      .query(
        'SELECT sourceReleaseId, referencePeriodCode, COUNT(*) AS count FROM statsRecords GROUP BY sourceReleaseId, referencePeriodCode',
      )
      .all() as Array<{ sourceReleaseId: string; referencePeriodCode: string }>
    for (const row of rows)
      if (!scopes.has(JSON.stringify([row.sourceReleaseId, row.referencePeriodCode]))) {
        throw new Error(
          `Retained statistic ${row.sourceReleaseId}/${row.referencePeriodCode} has no snapshot metadata.`,
        )
      }
  }
}

function assertCurrentCoveredByHistory(
  current: Database,
  shards: Array<{ db: Database }>,
) {
  const projection =
    'id, sourceReleaseId, datasetCode, referencePeriodCode, divisionId, geography, "values"'
  const fingerprint = (row: RetainedSqlRow) =>
    hashStatisticContent({
      ...row,
      geography: JSON.parse(String(row.geography)),
      values: JSON.parse(String(row.values)),
    })
  const retained = new Set<string>()
  for (const shard of shards)
    for (const row of shard.db
      .query(`SELECT ${projection} FROM statsRecords`)
      .iterate() as Iterable<RetainedSqlRow>)
      retained.add(fingerprint(row))
  for (const row of current
    .query(`SELECT ${projection} FROM statsRecords`)
    .iterate() as Iterable<RetainedSqlRow>) {
    if (!retained.has(fingerprint(row)))
      throw new Error(
        `Current statistic ${row.id} has no matching retained history; recover it before conversion.`,
      )
  }
}

function readSnapshotInput(shards: Array<{ db: Database }>, snapshot: Snapshot) {
  const groups = new Map<string, RetainedSqlRow[]>()
  for (const table of TABLES) {
    const rows = shards.flatMap(
      shard =>
        shard.db
          .query(
            `SELECT * FROM ${quote(table)} WHERE sourceReleaseId = ? AND isCurrent = 1${table === 'statsRecords' ? ' AND referencePeriodCode = ?' : ''}`,
          )
          .all(
            ...(table === 'statsRecords'
              ? [snapshot.sourceReleaseId, snapshot.cohortKey]
              : [snapshot.sourceReleaseId]),
          ) as RetainedSqlRow[],
    )
    // Dictionary copies in multiple period shards have the same original row.
    const identities = new Map<string, RetainedSqlRow>()
    for (const row of rows) {
      const keys =
        table === 'statsRecords'
          ? ['id']
          : table.startsWith('statsFields')
            ? [
                'datasetCode',
                'fieldName',
                ...(table.endsWith('I18n') ? ['locale'] : []),
              ]
            : table.startsWith('statsMeasures')
              ? [
                  'datasetCode',
                  'measureCode',
                  ...(table.endsWith('I18n') ? ['locale'] : []),
                ]
              : ['datasetCode', 'dimensionCode', 'valueCode', 'locale']
      const key = JSON.stringify(keys.map(key => row[key]))
      const previous = identities.get(key)
      if (previous && JSON.stringify(previous) !== JSON.stringify(row))
        throw new Error(`Ambiguous retained ${table} definition for ${key}.`)
      identities.set(key, row)
    }
    groups.set(table, [...identities.values()])
  }
  if (!groups.get('statsRecords')?.length)
    throw new Error(
      `Statistic snapshot ${snapshot.id} has no retained selected records.`,
    )
  if (groups.get('statsValuesI18n')?.length)
    throw new Error(
      'Retained dimension-value labels require explicit version linkage before conversion.',
    )
  return {
    records: (groups.get('statsRecords') ?? []).sort(
      (a, b) =>
        String(a.sourceFeatureRef).localeCompare(String(b.sourceFeatureRef)) ||
        String(a.id).localeCompare(String(b.id)),
    ),
    fields: groups.get('statsFields') ?? [],
    fieldsI18n: groups.get('statsFieldsI18n') ?? [],
    measures: groups.get('statsMeasures') ?? [],
    measuresI18n: groups.get('statsMeasuresI18n') ?? [],
  }
}

function sourcePropertiesReader(dbs: Database[], snapshot: Snapshot) {
  const cache = new Map<string, Record<string, unknown>>()
  return (sourceFeatureRef: string) => {
    const cached = cache.get(sourceFeatureRef)
    if (cached) return cached
    const prefix = `hkgov-censtatd/${snapshot.datasetCode}/${snapshot.sourceVersion}/`
    if (!sourceFeatureRef.startsWith(prefix))
      throw new Error(
        `Unrecognised retained source feature reference: ${sourceFeatureRef}.`,
      )
    const sourceRecordId = `CENSTATD:${sourceFeatureRef.slice(prefix.length)}`
    const boundary = snapshot.sourceVersion
    const properties = dbs.flatMap(
      db =>
        db
          .query(`SELECT properties FROM hkgovCenstatdStatistics
      WHERE sourceRecordId = ? AND (releaseId = ? OR (validFromRelease <= ? AND (validToRelease IS NULL OR validToRelease > ?)))`)
          .all(sourceRecordId, snapshot.sourceReleaseId, boundary, boundary) as Array<{
          properties: string
        }>,
    )
    const unique = new Set(properties.map(row => row.properties))
    if (unique.size !== 1)
      throw new Error(
        `Missing or ambiguous retained publisher geography for ${sourceFeatureRef}.`,
      )
    const result = JSON.parse([...unique][0] ?? '{}') as Record<string, unknown>
    cache.set(sourceFeatureRef, result)
    return result
  }
}

function createOutputDb(path: string, family: 'current' | 'history') {
  const db = new Database(path, { create: true })
  db.exec(
    loadMigrationSql(join(ROOT, 'libs/db/migrations'), [family]).replaceAll(
      '--> statement-breakpoint',
      '',
    ),
  )
  return db
}

async function exportReplacementSql(db: Database, path: string, current: boolean) {
  const writer = Bun.file(path).writer()
  try {
    writer.write('BEGIN;\n')
    for (const table of [
      ...TABLES,
      ...(current ? ['statsPublicationState'] : ['snapshotVersionChanges']),
    ]) {
      const where =
        table === 'snapshotVersionChanges' ? " WHERE recordType = 'statsRecord'" : ''
      writer.write(`DELETE FROM ${quote(table)}${where};\n`)
      for (const row of db
        .query(`SELECT * FROM ${quote(table)}${where}`)
        .iterate() as Iterable<RetainedSqlRow>) {
        const columns = Object.keys(row)
        writer.write(
          `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(column => literal(row[column])).join(',')});\n`,
        )
      }
    }
    if (!current) {
      for (const row of db
        .query('SELECT * FROM sourceResolutions')
        .iterate() as Iterable<RetainedSqlRow>) {
        const columns = Object.keys(row)
        writer.write(
          `INSERT OR REPLACE INTO sourceResolutions (${columns.map(quote).join(',')}) VALUES (${columns.map(column => literal(row[column])).join(',')});\n`,
        )
      }
    }
    writer.write('COMMIT;\n')
  } finally {
    await writer.end()
  }
}

function copySourceResolutions(
  inputs: Array<{ db: Database; bindingName: string }>,
  outputs: Map<string, Database>,
  packedIds: Map<string, string>,
) {
  let count = 0
  for (const input of inputs) {
    if (
      !input.db
        .query(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sourceResolutions'",
        )
        .get()
    )
      continue
    const output = outputs.get(input.bindingName)
    if (!output) throw new Error(`Missing output history shard ${input.bindingName}.`)
    output.transaction(() => {
      for (const row of input.db
        .query(
          "SELECT * FROM sourceResolutions WHERE json_type(resolutions, '$.entities.statistic') = 'array'",
        )
        .iterate() as Iterable<RetainedSqlRow>) {
        const resolutions = JSON.parse(String(row.resolutions)) as {
          entities: { statistic: string[] }
        }
        resolutions.entities.statistic = [
          ...new Set(
            resolutions.entities.statistic.map(id => {
              const packed = packedIds.get(JSON.stringify([row.sourceReleaseId, id]))
              if (!packed)
                throw new Error(
                  `Unresolved retained statistic provenance target ${id}.`,
                )
              return packed
            }),
          ),
        ].sort()
        const converted: RetainedSqlRow = {
          ...row,
          resolutions: JSON.stringify(resolutions),
        }
        const columns = Object.keys(converted)
        output
          .query(
            `INSERT INTO sourceResolutions (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          )
          .run(...columns.map(key => converted[key] as string | number | null))
        count += 1
      }
    })()
  }
  return count
}

function clearSql(db: Database) {
  const statements = ['BEGIN;', ...TABLES.map(table => `DELETE FROM ${quote(table)};`)]
  for (const table of ['statsPublicationState', 'snapshotVersionChanges']) {
    if (
      db
        .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table)
    ) {
      statements.push(
        `DELETE FROM ${quote(table)}${table === 'snapshotVersionChanges' ? " WHERE recordType = 'statsRecord'" : ''};`,
      )
    }
  }
  return [...statements, 'COMMIT;', ''].join('\n')
}

function count(db: Database, table: string) {
  return (
    db.query(`SELECT COUNT(*) AS count FROM ${quote(table)}`).get() as { count: number }
  ).count
}

function quote(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}
function literal(value: unknown) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replaceAll("'", "''")}'`
}

/** Local adapter retains D1 batch transaction semantics during offline verification. */
function sqliteD1(db: Database): StatisticsD1Database {
  const operations = new WeakMap<object, () => unknown>()
  return {
    prepare(sql: string) {
      let values: Array<string | number | null> = []
      const statement = {
        bind(...parameters: Array<string | number | null>) {
          values = parameters
          return statement
        },
        async all() {
          return { success: true, results: db.query(sql).all(...values) }
        },
        async first() {
          return db.query(sql).get(...values)
        },
        async run() {
          return operations.get(statement)?.()
        },
      }
      operations.set(statement, () => ({
        success: true,
        results: [],
        meta: db.query(sql).run(...values),
      }))
      return statement
    },
    async batch(statements: object[]) {
      return db.transaction(() =>
        statements.map(statement => operations.get(statement)?.()),
      )()
    },
  } as unknown as StatisticsD1Database
}

export function readStatisticsRebuildInputs(path: string): StatisticsRebuildInputs {
  const input: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!input || typeof input !== 'object')
    throw new Error('Invalid Statistics input manifest.')
  const row = input as StatisticsRebuildInputs
  if (
    typeof row.meta !== 'string' ||
    typeof row.current !== 'string' ||
    !Array.isArray(row.history) ||
    !Array.isArray(row.source)
  )
    throw new Error(
      'Expected meta/current paths, history binding/path entries, and source paths.',
    )
  return row
}
