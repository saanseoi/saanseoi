import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, openSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import { addressScopes } from '../libs/db/src/addressScope'

type Row = Record<string, unknown>
type Family = 'current' | 'history'
export type AddressScopePlan = {
  manifestVersion: 1
  family: Family
  migrationHash: string
  expectedBefore: string
  expectedAfter: string
  rowCount: number
  changeCount: number
  beforeCounts: Record<string, number>
  afterCounts: Record<string, number>
  rows: Array<{
    id: unknown
    storageId: unknown
    expectedBefore: unknown
    proposedAfter: unknown
  }>
}
const migrations: Record<Family, string> = {
  current: '../libs/db/migrations/current/20261022022411_nifty_mystique/migration.sql',
  history:
    '../libs/db/migrations/history/20261022022445_warm_the_professor/migration.sql',
}
const hash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
const storageKey = (family: Family): string =>
  family === 'current' ? 'scopeId' : 'snapshotId'
const scopeValue = (row: Row): unknown =>
  'granularity' in row ? row.granularity : row.scope

/** Read deterministic address content, preserving every existing identity and payload field. */
function readRows(db: Database, family: Family): Row[] {
  return db
    .query(`SELECT * FROM address2d ORDER BY id, ${storageKey(family)}`)
    .all() as Row[]
}

/** Convert classification vocabulary only; retained publication hashes are evidence, not new publications. */
function convert(row: Row): Row {
  const { granularity, scope: existingScope, premisesType, ...rest } = row
  const scope = granularity === undefined ? existingScope : granularity
  if (scope === 'site' || scope === 'complex') {
    if (premisesType != null && premisesType !== scope)
      throw new Error('Conflicting premises subtype')
    return { ...rest, scope: 'premises', premisesType: scope }
  }
  if (scope != null && !(addressScopes as readonly unknown[]).includes(scope))
    throw new Error(`Unrecognised address scope: ${scope}`)
  if (premisesType != null && !['site', 'complex'].includes(String(premisesType)))
    throw new Error('Invalid premises subtype')
  return { ...rest, scope, premisesType: premisesType ?? null }
}

/** Hash all row fields independent of SQLite column order. */
function digest(rows: Row[]): string {
  return hash(
    rows.map(row =>
      Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))),
    ),
  )
}

/** Count retained scope assertions, including null tombstones, without implying verification. */
function classificationCounts(rows: Row[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const key = String(scopeValue(row) ?? 'null')
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/** Read the generated Drizzle schema migration; its bytes are fenced by the dry-run plan. */
function migrationSql(family: Family): string {
  return readFileSync(new URL(migrations[family], import.meta.url), 'utf8')
}

/** Create an exact-ID dry run without changing any data.
 * @param db Open local CURRENT or HISTORY database, preferably a disposable copy.
 * @param family Physical schema family; SOURCE and META are never migration targets.
 * @returns Fenced plan including the before/after digest and classification assertions.
 */
export function planAddressScopeMigration(
  db: Database,
  family: Family,
): AddressScopePlan {
  if (!['current', 'history'].includes(family))
    throw new Error('Expected current or history family')
  const rows = readRows(db, family)
  const after = rows.map(convert)
  return {
    manifestVersion: 1,
    family,
    migrationHash: hash(migrationSql(family)),
    expectedBefore: digest(rows),
    expectedAfter: digest(after),
    rowCount: rows.length,
    beforeCounts: classificationCounts(rows),
    afterCounts: classificationCounts(after),
    changeCount: rows.filter(
      (row, i) =>
        scopeValue(row) !== after[i]!.scope ||
        (row.premisesType ?? null) !== after[i]!.premisesType,
    ).length,
    rows: rows.map((row, i) => ({
      id: row.id,
      storageId: row[storageKey(family)],
      expectedBefore: {
        scope: scopeValue(row),
        premisesType: row.premisesType ?? null,
      },
      proposedAfter: { scope: after[i]!.scope, premisesType: after[i]!.premisesType },
    })),
  }
}

/** Apply a reviewed local plan atomically with backup, stale rejection and replay verification.
 * @param db Exact local database described by the plan; callers pause all application writers.
 * @param plan Previously persisted dry-run plan.
 * @param backupPath New full database backup path, required before the first mutation.
 * @returns Changed classification count; identical replay returns zero.
 * @remarks This does not deploy or operate on D1 remotely. Each history shard needs its own plan.
 */
export function applyAddressScopeMigration(
  db: Database,
  plan: AddressScopePlan,
  backupPath: string,
): number {
  if (plan.manifestVersion !== 1 || !['current', 'history'].includes(plan.family))
    throw new Error('Unsupported migration plan')
  const sql = migrationSql(plan.family)
  if (hash(sql) !== plan.migrationHash)
    throw new Error('Generated migration changed after planning')
  const columns = db.query('PRAGMA table_info(address2d)').all() as Array<{
    name: string
  }>
  const pending = columns.some(column => column.name === 'granularity')
  const before = readRows(db, plan.family)
  if (!pending && digest(before) === plan.expectedAfter) return 0
  if (before.length !== plan.rowCount || digest(before) !== plan.expectedBefore)
    throw new Error('Stale migration plan')
  const after = before.map(convert)
  if (digest(after) !== plan.expectedAfter)
    throw new Error('Plan does not match conversion contract')
  if (existsSync(backupPath)) throw new Error('Refusing to overwrite database backup')
  if (db.query('PRAGMA foreign_key_check').all().length)
    throw new Error('Existing foreign key violations')
  // Stream a consistent SQLite backup rather than materialising a multi-GB database in memory.
  closeSync(openSync(backupPath, 'wx', 0o600))
  db.query('VACUUM INTO ?').run(backupPath)
  db.transaction(() => {
    // A second fence inside the write transaction prevents intervening writer changes.
    if (digest(readRows(db, plan.family)) !== plan.expectedBefore)
      throw new Error('Stale migration plan')
    if (pending) db.exec(sql)
    const update = db.query(
      `UPDATE address2d SET scope = ?, premisesType = ? WHERE id = ? AND ${storageKey(plan.family)} = ?`,
    )
    for (let i = 0; i < before.length; i++) {
      const row = before[i]!,
        next = after[i]!
      if (
        scopeValue(row) === next.scope &&
        (row.premisesType ?? null) === next.premisesType
      )
        continue
      const result = update.run(
        next.scope as string | null,
        next.premisesType as string | null,
        String(row.id),
        String(row[storageKey(plan.family)]),
      )
      if (result.changes !== 1)
        throw new Error('Address identity changed during migration')
    }
    if (digest(readRows(db, plan.family)) !== plan.expectedAfter)
      throw new Error('Migration readback mismatch')
    if (db.query('PRAGMA foreign_key_check').all().length)
      throw new Error('Migration foreign key violations')
    const integrity = db.query('PRAGMA integrity_check').get() as {
      integrity_check: string
    }
    if (integrity.integrity_check !== 'ok')
      throw new Error('Migration integrity check failed')
    // Preserve existing migration receipts and prevent the ordinary migrator replaying this schema SQL.
    db.exec(
      'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)',
    )
    const name = migrations[plan.family].split('/').slice(-2).join('/')
    db.query('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)').run(name)
  }).immediate()
  return plan.changeCount
}

if (import.meta.main) {
  const [command, family, databasePath, planPath, backupPath] = Bun.argv.slice(2)
  if (
    !['plan', 'apply'].includes(command ?? '') ||
    !['current', 'history'].includes(family ?? '') ||
    !databasePath ||
    !planPath
  )
    throw new Error(
      'Usage: bun scripts/migrate-address-scope.ts plan|apply current|history DATABASE PLAN [BACKUP]',
    )
  const db = new Database(resolve(databasePath), {
    readonly: command === 'plan',
    create: false,
  })
  try {
    if (command === 'plan') {
      const plan = planAddressScopeMigration(db, family as Family)
      const manifest = plan.rows
        .map(row =>
          JSON.stringify({
            manifestVersion: 1,
            addressId: row.id,
            storageId: row.storageId,
            field: 'address.scope',
            expectedBefore: row.expectedBefore,
            proposedAfter: row.proposedAfter,
            decision:
              hash(row.expectedBefore) === hash(row.proposedAfter)
                ? 'no-change'
                : 'supported',
            provenance: {
              kind: 'schema-contract',
              generatedMigrationHash: plan.migrationHash,
            },
          }),
        )
        .join('\n')
      writeFileSync(`${planPath}.jsonl`, `${manifest}\n`, { flag: 'wx', mode: 0o600 })
      writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, {
        flag: 'wx',
        mode: 0o600,
      })
      console.log(
        JSON.stringify({
          rows: plan.rowCount,
          changes: plan.changeCount,
          plan: planPath,
        }),
      )
    } else {
      if (!backupPath) throw new Error('Apply requires a new full backup path')
      const plan = JSON.parse(readFileSync(planPath, 'utf8')) as AddressScopePlan
      if (plan.family !== family) throw new Error('Plan family mismatch')
      console.log(
        JSON.stringify({ changed: applyAddressScopeMigration(db, plan, backupPath) }),
      )
    }
  } finally {
    db.close()
  }
}
