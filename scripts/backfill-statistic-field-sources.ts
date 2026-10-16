import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  compactStatisticFieldSources,
  expandStatisticFieldSources,
  type StatisticSource,
  type StatisticFieldSources,
} from '../libs/db/src/statisticFieldSources'

const dbHasMigrations = (db: Database) =>
  !!db.query("SELECT 1 FROM sqlite_schema WHERE name='d1_migrations'").get()

const migrations = {
  current: '20261016150108_youthful_dreaming_celestial/migration.sql',
  history: '20261016150118_shallow_madame_web/migration.sql',
}
type Row = Record<string, any>

export function compactRetainedFieldSources(value: unknown, fields: string[]) {
  if (Array.isArray(value)) {
    const expanded = expandStatisticFieldSources(value as StatisticFieldSources, fields)
    return compactStatisticFieldSources(expanded)
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).length !== fields.length ||
    fields.some(field => !Object.hasOwn(value, field))
  )
    throw new Error('Incomplete retained field sources')
  const original = value as Record<string, StatisticSource>
  const compact = compactStatisticFieldSources(original)
  const expanded = expandStatisticFieldSources(compact, fields)
  for (const field of fields) {
    if (
      JSON.stringify(Object.keys(original[field]!).sort()) !==
        '["sourceFeatureRef","sourceReleaseId"]' ||
      expanded[field]!.sourceReleaseId !== original[field]!.sourceReleaseId ||
      expanded[field]!.sourceFeatureRef !== original[field]!.sourceFeatureRef
    )
      throw new Error('Field source round-trip mismatch')
  }
  return compact
}

/** Local repair without new snapshots, releases, record IDs or content hashes. */
export function backfillStatisticFieldSources(
  paths: string[],
  output: string,
  apply = false,
) {
  if (!paths.length || new Set(paths.map(p => resolve(p))).size !== paths.length)
    throw new Error('Distinct local SQLite paths required')
  if (existsSync(output)) throw new Error('Recovery directory already exists')
  mkdirSync(output, { recursive: true })
  const connections: Database[] = []
  const plans: Array<{
    path: string
    family: 'current' | 'history'
    changes: Array<{ rowid: number; old: string; value: string }>
    oldBytes: number
    newBytes: number
    fingerprint: string
    schema: any
    migrationNeeded: boolean
  }> = []
  const fingerprint = (db: Database) => {
    const hash = createHash('sha256')
    for (const row of db
      .query('SELECT * FROM statsRecords ORDER BY id, versionHash')
      .all() as Iterable<Row>) {
      const { fieldSources, ...rest } = row
      hash.update(JSON.stringify(rest))
    }
    return hash.digest('hex')
  }
  try {
    // Acquire all writer locks before planning; release every lock on a pre-commit failure.
    for (const path of paths) {
      if (!existsSync(path)) throw new Error(`Missing local database: ${path}`)
      const db = apply ? new Database(path) : new Database(path, { readonly: true })
      connections.push(db)
      if (apply)
        db.exec(
          'PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON; BEGIN IMMEDIATE',
        )
      else db.exec('BEGIN')
    }
    connections.forEach((db, i) => {
      const family = (db.query('PRAGMA table_info(statsRecords)').all() as Row[]).some(
        c => c.name === 'snapshotId',
      )
        ? 'history'
        : 'current'
      const changes: Array<{ rowid: number; old: string; value: string }> = []
      let oldBytes = 0,
        newBytes = 0
      for (const row of db
        .query('SELECT rowid AS _rowid, * FROM statsRecords')
        .all() as Iterable<Row>) {
        if (row.operation === 'delete') {
          if (row.fieldSources !== null) {
            if (!['{}', '[]'].includes(row.fieldSources))
              throw new Error('Delete event has provenance payload')
            if (row.fieldSources === '{}')
              changes.push({ rowid: row._rowid, old: row.fieldSources, value: '[]' })
          }
          continue
        }
        const value = JSON.stringify(
          compactRetainedFieldSources(
            JSON.parse(row.fieldSources),
            Object.keys(JSON.parse(row.values)),
          ),
        )
        oldBytes += Buffer.byteLength(row.fieldSources)
        newBytes += Buffer.byteLength(value)
        if (row.fieldSources !== value)
          changes.push({ rowid: row._rowid, old: row.fieldSources, value })
      }
      const schema = db
        .query(
          "SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='statsRecords' OR name='historyEvents'",
        )
        .all()
      const column = (db.query('PRAGMA table_info(statsRecords)').all() as Row[]).find(
        c => c.name === 'fieldSources',
      )
      plans.push({
        path: resolve(paths[i]!),
        family,
        changes,
        oldBytes,
        newBytes,
        fingerprint: fingerprint(db),
        schema,
        migrationNeeded: column?.dflt_value !== "'[]'",
      })
    })
    writeFileSync(
      `${output}/plan.json`,
      JSON.stringify(
        plans.map(({ changes, ...plan }) => ({ ...plan, changedRows: changes.length })),
        null,
        2,
      ),
    )
    if (apply) {
      // Independent recovery databases are committed before any live rows are modified.
      plans.forEach((plan, i) => {
        const backup = new Database(`${output}/${i}-before.sqlite`)
        backup.query('ATTACH DATABASE ? AS original').run(plan.path)
        backup.exec(
          "CREATE TABLE statsRecords AS SELECT * FROM original.statsRecords; CREATE TABLE schemaBefore AS SELECT * FROM original.sqlite_schema WHERE tbl_name='statsRecords' OR name='historyEvents'",
        )
        backup.close()
        const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'"
        const schema = plan.schema as Array<{
          type: string
          name: string
          sql: string | null
        }>
        writeFileSync(
          `${output}/${i}-rollback.sql`,
          [
            `ATTACH DATABASE ${quote(resolve(output, `${i}-before.sqlite`))} AS recovery;`,
            'PRAGMA foreign_keys=OFF;',
            'BEGIN IMMEDIATE;',
            ...(plan.family === 'history'
              ? ['DROP VIEW IF EXISTS historyEvents;']
              : []),
            'DROP TABLE statsRecords;',
            schema.find(item => item.type === 'table')!.sql + ';',
            'INSERT INTO statsRecords SELECT * FROM recovery.statsRecords;',
            ...schema
              .filter(item => item.type !== 'table' && item.sql)
              .map(item => item.sql + ';'),
            ...(dbHasMigrations(connections[i]!) && plan.migrationNeeded
              ? [
                  `DELETE FROM d1_migrations WHERE name=${quote(migrations[plan.family])};`,
                ]
              : []),
            'COMMIT;',
            'DETACH DATABASE recovery;',
          ].join('\n'),
        )
      })
      plans.forEach((plan, i) => {
        const db = connections[i]!
        for (const change of plan.changes) {
          const result = db
            .query(
              'UPDATE statsRecords SET fieldSources=? WHERE rowid=? AND fieldSources=?',
            )
            .run(change.value, change.rowid, change.old)
          if (result.changes !== 1) throw new Error('Concurrent row change')
        }
        if (plan.migrationNeeded) {
          db.exec(
            readFileSync(
              resolve(
                import.meta.dir,
                '../libs/db/migrations',
                plan.family,
                migrations[plan.family],
              ),
              'utf8',
            ),
          )
          if (db.query("SELECT 1 FROM sqlite_schema WHERE name='d1_migrations'").get())
            db.query('INSERT INTO d1_migrations(name) VALUES (?)').run(
              migrations[plan.family],
            )
        }
        if (fingerprint(db) !== plan.fingerprint)
          throw new Error('Non-provenance data changed')
        for (const row of db
          .query(
            'SELECT fieldSources,"values" FROM statsRecords WHERE fieldSources IS NOT NULL',
          )
          .all() as Iterable<Row>)
          expandStatisticFieldSources(
            JSON.parse(row.fieldSources),
            Object.keys(JSON.parse(row.values) ?? {}),
          )
        if (
          JSON.stringify(db.query('PRAGMA quick_check(statsRecords)').all()) !==
          '[{"quick_check":"ok"}]'
        )
          throw new Error('Statistics integrity check failed')
        if (db.query('PRAGMA foreign_key_check(statsRecords)').all().length)
          throw new Error('Statistics foreign key check failed')
      })
    }
    // Recovery copies cover an interrupted multi-file commit; no logical revision is issued.
    for (const db of connections) db.exec('COMMIT')
    const result = {
      applied: apply,
      rows: plans.reduce((n, p) => n + p.changes.length, 0),
      oldBytes: plans.reduce((n, p) => n + p.oldBytes, 0),
      newBytes: plans.reduce((n, p) => n + p.newBytes, 0),
      databases: plans.map(p => ({
        path: p.path,
        rows: p.changes.length,
        migrationNeeded: p.migrationNeeded,
      })),
    }
    writeFileSync(`${output}/result.json`, JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    for (const db of connections)
      try {
        db.exec('ROLLBACK')
      } catch {}
    throw error
  } finally {
    for (const db of connections) db.close()
  }
}
if (import.meta.main) {
  const args = process.argv.slice(2),
    apply = args.includes('--apply')
  const [output, ...paths] = args.filter(a => a !== '--apply')
  if (!output)
    throw new Error(
      'Usage: bun scripts/backfill-statistic-field-sources.ts [--apply] RECOVERY_DIR SQLITE_PATH...',
    )
  console.log(backfillStatisticFieldSources(paths, output, apply))
}
