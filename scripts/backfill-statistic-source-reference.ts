import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expandStatisticFieldSources } from '../libs/db/src/statisticFieldSources'

export const migrations = {
  current: '20261017022757_greedy_the_hunter/migration.sql',
  history: '20261017022758_eminent_silverclaw/migration.sql',
}
type Row = Record<string, any>
const literal = (s: string) => `'${s.replaceAll("'", "''")}'`

function fingerprint(db: Database) {
  const hash = createHash('sha256')
  const columns = db.query('PRAGMA table_info(statsRecords)').all() as Row[]
  const order = columns
    .filter(c => c.pk)
    .sort((a, b) => a.pk - b.pk)
    .map(c => `"${c.name}"`)
    .join(',')
  for (const row of db
    .query(`SELECT * FROM statsRecords ORDER BY ${order}`)
    .iterate() as Iterable<Row>) {
    const { sourceFeatureRef, ...retained } = row
    if (row.operation !== 'delete')
      expandStatisticFieldSources(
        JSON.parse(row.fieldSources),
        Object.keys(JSON.parse(row.values)),
      )
    hash.update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(retained).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
  }
  return hash.digest('hex')
}

/** Remove only the redundant canonical reference; preserve every other stored value exactly. */
export function backfillStatisticSourceReference(
  paths: string[],
  output: string,
  apply = false,
) {
  if (!paths.length || new Set(paths.map(p => resolve(p))).size !== paths.length)
    throw new Error('Distinct local database paths required')
  if (existsSync(output)) throw new Error('Recovery directory already exists')
  mkdirSync(output, { recursive: true })
  const connections: Database[] = []
  const plans: Row[] = []
  try {
    for (const path of paths) {
      if (!existsSync(path)) throw new Error(`Missing database: ${path}`)
      const db = apply ? new Database(path) : new Database(path, { readonly: true })
      connections.push(db)
      db.exec(
        apply
          ? 'PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON; BEGIN IMMEDIATE'
          : 'BEGIN',
      )
      const columns = db.query('PRAGMA table_info(statsRecords)').all() as Row[]
      if (!columns.length) throw new Error(`No statsRecords in ${path}`)
      const family = columns.some(c => c.name === 'snapshotId') ? 'history' : 'current'
      const migration = migrations[family]
      const needed = columns.some(c => c.name === 'sourceFeatureRef')
      const journal = !!db
        .query("SELECT 1 FROM sqlite_schema WHERE name='d1_migrations'")
        .get()
      if (
        needed &&
        journal &&
        db.query('SELECT 1 FROM d1_migrations WHERE name=?').get(migration)
      )
        throw new Error('Migration journal disagrees with schema')
      plans.push({
        path,
        family,
        migration,
        needed,
        journal,
        rows: (db.query('SELECT count(*) n FROM statsRecords').get() as Row).n,
        fingerprint: fingerprint(db),
        schema: db
          .query(
            "SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='statsRecords' OR name='historyEvents'",
          )
          .all(),
      })
    }
    writeFileSync(`${output}/plan.json`, JSON.stringify(plans, null, 2))
    if (apply) {
      // Save every affected table and its original DDL before changing any database.
      plans.forEach((plan, i) => {
        if (!plan.needed) return
        const backup = new Database(`${output}/${i}-before.sqlite`)
        backup.query('ATTACH DATABASE ? AS original').run(plan.path)
        backup.exec('CREATE TABLE statsRecords AS SELECT * FROM original.statsRecords')
        backup.close()
        writeFileSync(
          `${output}/${i}-rollback.sql`,
          [
            `ATTACH DATABASE ${literal(resolve(output, `${i}-before.sqlite`))} AS recovery;`,
            'PRAGMA foreign_keys=OFF;',
            'PRAGMA legacy_alter_table=ON;',
            'BEGIN IMMEDIATE;',
            ...(plan.family === 'history'
              ? ['DROP VIEW IF EXISTS historyEvents;']
              : []),
            'DROP TABLE statsRecords;',
            `${plan.schema.find((s: Row) => s.type === 'table').sql};`,
            'INSERT INTO statsRecords SELECT * FROM recovery.statsRecords;',
            ...plan.schema
              .filter((s: Row) => s.type !== 'table' && s.sql)
              .map((s: Row) => `${s.sql};`),
            ...(plan.journal
              ? [`DELETE FROM d1_migrations WHERE name=${literal(plan.migration)};`]
              : []),
            'COMMIT;',
            'DETACH DATABASE recovery;',
          ].join('\n'),
        )
      })
      plans.forEach((plan, i) => {
        const db = connections[i]!
        if (plan.needed) {
          db.exec(
            readFileSync(
              resolve(
                import.meta.dir,
                '../libs/db/migrations',
                plan.family,
                plan.migration,
              ),
              'utf8',
            ),
          )
          if (plan.journal)
            db.query('INSERT INTO d1_migrations(name) VALUES (?)').run(plan.migration)
        }
        if (fingerprint(db) !== plan.fingerprint)
          throw new Error(`Retained content changed: ${plan.path}`)
        if (
          (db.query('PRAGMA table_info(statsRecords)').all() as Row[]).some(
            c => c.name === 'sourceFeatureRef',
          )
        )
          throw new Error('Redundant reference remains')
        if (db.query('PRAGMA foreign_key_check(statsRecords)').all().length)
          throw new Error('Statistics foreign key failure')
        if (
          JSON.stringify(db.query('PRAGMA quick_check(statsRecords)').all()) !==
          '[{"quick_check":"ok"}]'
        )
          throw new Error('Statistics integrity failure')
      })
    }
    for (const db of connections) db.exec('COMMIT')
    const result = {
      applied: apply,
      rows: plans.filter(p => p.needed).reduce((n, p) => n + p.rows, 0),
      databases: plans.map(({ schema, ...plan }) => plan),
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
  const { discover } = await import('../apps/harbour-app/ingestion/server')
  const paths = (await discover())
    .filter(s => /^DB_(CURRENT|HISTORY_)/.test(s.binding) && existsSync(s.path))
    .map(s => s.path)
  const output = process.argv.find(a => a.startsWith('--output='))?.slice(9)
  if (!output) throw new Error('Provide --output=<new recovery directory> [--apply]')
  console.log(
    JSON.stringify(
      backfillStatisticSourceReference(paths, output, process.argv.includes('--apply')),
      null,
      2,
    ),
  )
}
