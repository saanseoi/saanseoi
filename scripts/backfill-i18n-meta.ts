import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compactLocaleJson, parseI18nMeta } from '../libs/db/src/i18nMeta'

const migrations = {
  current: '20261016171310_supreme_bullseye/migration.sql',
  history: '20261016171310_mushy_rage/migration.sql',
}
const q = (s: string) => '"' + s.replaceAll('"', '""') + '"'
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'"
type Row = Record<string, any>

function canonicalRow(row: Row, column: string) {
  return {
    ...row,
    [column]:
      row[column] == null
        ? null
        : column === 'meta'
          ? parseI18nMeta(JSON.parse(row[column]))
          : compactLocaleJson(JSON.parse(row[column])),
  }
}
function fingerprint(db: Database, table: string, column: string) {
  const hash = createHash('sha256')
  const columns = db.query(`PRAGMA table_info(${q(table)})`).all() as Row[]
  const order =
    columns
      .filter(c => c.pk)
      .sort((a, b) => a.pk - b.pk)
      .map(c => q(c.name))
      .join(',') || 'rowid'
  for (const row of db
    .query(`SELECT * FROM ${q(table)} ORDER BY ${order}`)
    .iterate() as Iterable<Row>)
    hash.update(JSON.stringify(canonicalRow(row, column)))
  return hash.digest('hex')
}

/** Representation-only local repair. Recovery tables and SQL precede every live write. */
export function backfillI18nMeta(
  shards: Array<{ binding: string; path: string }>,
  output: string,
  apply = false,
) {
  if (existsSync(output)) throw new Error('Recovery directory already exists')
  mkdirSync(output, { recursive: true })
  const connections: Database[] = []
  const plans: Row[] = []
  let stage = 'planning'
  try {
    for (const shard of shards) {
      if (!existsSync(shard.path)) throw new Error(`Missing database ${shard.path}`)
      const db = apply
        ? new Database(shard.path)
        : new Database(shard.path, { readonly: true })
      connections.push(db)
      db.exec(
        apply
          ? 'PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON; BEGIN IMMEDIATE'
          : 'BEGIN',
      )
      const family =
        shard.binding === 'DB_CURRENT'
          ? 'current'
          : shard.binding.startsWith('DB_HISTORY_')
            ? 'history'
            : null
      const migration = family ? migrations[family] : null
      const hasJournal = !!db
        .query("SELECT 1 FROM sqlite_schema WHERE name='d1_migrations'")
        .get()
      const migrationNeeded =
        migration &&
        hasJournal &&
        !db.query('SELECT 1 FROM d1_migrations WHERE name=?').get(migration)
      const schema = db
        .query('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL')
        .all() as Row[]
      const tables: Row[] = []
      for (const item of schema.filter(
        s => s.type === 'table' && !s.name.startsWith('sqlite_'),
      )) {
        const cols = (
          db.query(`PRAGMA table_info(${q(item.name)})`).all() as Row[]
        ).map(c => c.name)
        const column =
          cols.includes('meta') && cols.includes('locale')
            ? 'meta'
            : cols.includes('i18n')
              ? 'i18n'
              : null
        if (!column) continue
        let changedRows = 0,
          oldBytes = 0,
          newBytes = 0
        for (const row of db
          .query(`SELECT ${q(column)} FROM ${q(item.name)}`)
          .iterate() as Iterable<Row>) {
          const val = canonicalRow(row, column)[column]
          const text = val === null ? null : JSON.stringify(val)
          if (text !== row[column]) changedRows++
          oldBytes += Buffer.byteLength(row[column] ?? '')
          newBytes += Buffer.byteLength(text ?? '')
        }
        tables.push({
          name: item.name,
          column,
          changedRows,
          oldBytes,
          newBytes,
          fingerprint: fingerprint(db, item.name, column),
        })
      }
      plans.push({ ...shard, family, migration, migrationNeeded, schema, tables })
    }
    writeFileSync(`${output}/plan.json`, JSON.stringify(plans, null, 2))
    if (apply) {
      plans.forEach((plan, i) => {
        if (!plan.tables.length) return
        stage = `backup ${plan.binding}`
        const backup = new Database(`${output}/${i}-before.sqlite`)
        backup.query('ATTACH DATABASE ? AS original').run(plan.path)
        backup.transaction(() => {
          for (const table of plan.tables)
            backup.exec(
              `CREATE TABLE ${q(table.name)} AS SELECT * FROM original.${q(table.name)}`,
            )
        })()
        backup.close()
        const names = new Set(plan.tables.map((t: Row) => t.name))
        const views = plan.schema.filter((s: Row) => s.type === 'view')
        writeFileSync(
          `${output}/${i}-rollback.sql`,
          [
            `ATTACH DATABASE ${literal(resolve(output, `${i}-before.sqlite`))} AS recovery;`,
            'PRAGMA foreign_keys=OFF;',
            'PRAGMA legacy_alter_table=ON;',
            'BEGIN IMMEDIATE;',
            ...views.map((s: Row) => `DROP VIEW IF EXISTS ${q(s.name)};`),
            ...plan.tables.flatMap((t: Row) => [
              `DROP TABLE ${q(t.name)};`,
              plan.schema.find((s: Row) => s.type === 'table' && s.name === t.name)
                .sql + ';',
              `INSERT INTO ${q(t.name)} SELECT * FROM recovery.${q(t.name)};`,
            ]),
            ...plan.schema
              .filter(
                (s: Row) =>
                  names.has(s.tbl_name) && ['index', 'trigger'].includes(s.type),
              )
              .map((s: Row) => s.sql + ';'),
            ...views.map((s: Row) => s.sql + ';'),
            ...(plan.migrationNeeded
              ? [`DELETE FROM d1_migrations WHERE name=${literal(plan.migration)};`]
              : []),
            'COMMIT;',
            'DETACH DATABASE recovery;',
          ].join('\n'),
        )
      })
      plans.forEach((plan, i) => {
        const db = connections[i]!
        stage = `migration ${plan.binding}`
        if (plan.migrationNeeded) {
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
          db.query('INSERT INTO d1_migrations(name) VALUES (?)').run(plan.migration)
        }
        for (const table of plan.tables) {
          stage = `update ${plan.binding}.${table.name}`
          const update = db.query(
            `UPDATE ${q(table.name)} SET ${q(table.column)}=? WHERE rowid=?`,
          )
          // Materialise only identities and metadata; never load geometry or complete address rows for writes.
          const rows = db
            .query(`SELECT rowid AS _rowid, ${q(table.column)} FROM ${q(table.name)}`)
            .all() as Row[]
          for (const row of rows) {
            const val = canonicalRow(row, table.column)[table.column]
            const text = val === null ? null : JSON.stringify(val)
            if (text !== row[table.column]) update.run(text, row._rowid)
          }
          stage = `verify ${plan.binding}.${table.name}`
          if (fingerprint(db, table.name, table.column) !== table.fingerprint)
            throw new Error(`Effective data changed: ${table.name}`)
          if (db.query(`PRAGMA foreign_key_check(${q(table.name)})`).all().length)
            throw new Error(`Foreign key failure: ${table.name}`)
          if (
            JSON.stringify(db.query(`PRAGMA quick_check(${q(table.name)})`).all()) !==
            '[{"quick_check":"ok"}]'
          )
            throw new Error(`Integrity failure: ${table.name}`)
        }
      })
    }
    stage = 'commit'
    for (const db of connections) db.exec('COMMIT')
    const result = { applied: apply, shards: plans.map(({ schema, ...plan }) => plan) }
    writeFileSync(`${output}/result.json`, JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    for (const db of connections)
      try {
        db.exec('ROLLBACK')
      } catch {}
    throw new Error(`${stage}: ${error}`, { cause: error })
  } finally {
    for (const db of connections) db.close()
  }
}
if (import.meta.main) {
  const { discover } = await import('../apps/harbour-app/ingestion/server')
  const shards = (await discover()).filter(s => existsSync(s.path))
  const output = process.argv.find(a => a.startsWith('--output='))?.slice(9)
  if (!output) throw new Error('Provide --output=<new recovery directory> [--apply]')
  const result = backfillI18nMeta(shards, output, process.argv.includes('--apply'))
  console.log(
    JSON.stringify(
      result.shards.map(s => ({ binding: s.binding, tables: s.tables })),
      null,
      2,
    ),
  )
}
