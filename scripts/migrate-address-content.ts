import { Database } from 'bun:sqlite'
import { createHash as sha256 } from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  chmodSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { buildAddressBaseHashInput } from '../libs/core/src/pipeline/services/addresses/normalisation'
import { createHash } from '../libs/core/src/pipeline/utils'

type Family = 'current' | 'history'
type Row = Record<string, unknown>
export type AddressContentPlan = {
  version: 1
  family: Family
  beforeDigest: string
  rowCount: number
  parentLinks: number
  migrations: { path: string; digest: string }[]
  curations: { path: string; digest: string }[]
  rows: {
    id: string
    storageId: string
    parentAddressId: unknown
    premisesType: unknown
    premisesKind: unknown
    granularity: unknown
    previousHash: unknown
    hash: string | null
    scope: unknown
  }[]
}
const root = resolve(import.meta.dir, '..')
const digest = (text: string) => sha256('sha256').update(text).digest('hex')
const key = (family: Family) => (family === 'current' ? 'scopeId' : 'snapshotId')
const migrationPaths = {
  current: [
    '20261022022411_nifty_mystique',
    '20261022093342_sad_misty_knight',
    '20261022100419_easy_iron_patriot',
  ],
  history: [
    '20261022022445_warm_the_professor',
    '20261022093343_minor_pestilence',
    '20261022100419_clumsy_wasp',
  ],
} as const

/** Fingerprint every stored address field, including operational metadata, before mutation. */
function tableDigest(db: Database, family: Family): string {
  const h = sha256('sha256')
  for (const row of db
    .query(`SELECT * FROM address2d ORDER BY id, ${key(family)}`)
    .iterate() as Iterable<Row>)
    h.update(
      JSON.stringify(
        Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))),
      ) + '\n',
    )
  return h.digest('hex')
}
/** Decode SQLite JSON with exactly the values supplied to the canonical hash builder. */
function canonical(row: Row): Row {
  const result: Row = { ...row, scope: row.scope ?? row.granularity }
  if (result.scope === 'site' || result.scope === 'complex') result.scope = 'premises'
  for (const field of ['geometry', 'identifiers', 'sources']) {
    const value = result[field]
    if (typeof value === 'string') result[field] = JSON.parse(value)
  }
  return result
}
/** Plan an in-place prerelease rewrite and archive removed assertions without inventing buildings.
 * @param db Read-only SQLite export or local database.
 * @param family Current or history schema family.
 * @returns Exact row/hash inventory and source-curation fingerprints; no new publications.
 */
export async function planAddressContentMigration(
  db: Database,
  family: Family,
): Promise<AddressContentPlan> {
  const columns = new Set(
    (db.query('PRAGMA table_info(address2d)').all() as { name: string }[]).map(
      row => row.name,
    ),
  )
  if (!columns.has('parentAddressId'))
    throw new Error('Already migrated or unsupported address schema')
  const selected = migrationPaths[family].filter((_, i) =>
    i === 0
      ? columns.has('granularity')
      : i === 1
        ? !columns.has('premisesKind')
        : true,
  )
  const migrations = selected.map(name => {
    const path = `libs/db/migrations/${family}/${name}/migration.sql`
    return { path, digest: digest(readFileSync(resolve(root, path), 'utf8')) }
  })
  const curations = readdirSync(resolve(root, 'fixtures/meta/curations'))
    .filter(name => /address|als/i.test(name))
    .sort()
    .map(name => {
      const path = `fixtures/meta/curations/${name}`
      return { path, digest: digest(readFileSync(resolve(root, path), 'utf8')) }
    })
  const plan: AddressContentPlan = {
    version: 1,
    family,
    beforeDigest: tableDigest(db, family),
    rowCount: 0,
    parentLinks: 0,
    migrations,
    curations,
    rows: [],
  }
  for (const row of db
    .query(`SELECT * FROM address2d ORDER BY id, ${key(family)}`)
    .iterate() as Iterable<Row>) {
    const value = canonical(row)
    const hash =
      row.operation === 'delete'
        ? null
        : await createHash(buildAddressBaseHashInput(value as never))
    plan.rows.push({
      id: String(row.id),
      storageId: String(row[key(family)]),
      parentAddressId: row.parentAddressId ?? null,
      premisesType: row.premisesType ?? null,
      premisesKind: row.premisesKind ?? null,
      granularity: row.granularity ?? row.scope,
      previousHash: row.versionHash ?? null,
      hash,
      scope: value.scope,
    })
    plan.rowCount++
    if (row.parentAddressId != null) plan.parentLinks++
  }
  return plan
}
/** Apply a fenced plan atomically to SQLite, with a full backup and a durable assertion archive.
 * @param db Writable SQLite database; remote databases must first be rehearsed as exports.
 * @param plan Exact reviewed plan, including original parent assertions and hashes.
 * @param backupPath New full backup file; never overwritten.
 * @param archivePath New evidence archive file; never overwritten.
 * @returns Number of preserved address rows. IDs, snapshots, timestamps and tombstones stay intact.
 */
export async function applyAddressContentMigration(
  db: Database,
  plan: AddressContentPlan,
  backupPath: string,
  archivePath: string,
): Promise<number> {
  if (plan.version !== 1 || !['current', 'history'].includes(plan.family))
    throw new Error('Unsupported plan')
  const fresh = await planAddressContentMigration(db, plan.family)
  if (JSON.stringify(fresh) !== JSON.stringify(plan))
    throw new Error('Stale or modified migration plan')
  if (existsSync(backupPath) || existsSync(archivePath))
    throw new Error('Refusing to overwrite backup or evidence archive')
  if (db.query('PRAGMA foreign_key_check').get())
    throw new Error('Existing foreign key violations')
  db.query('VACUUM INTO ?').run(resolve(backupPath))
  chmodSync(backupPath, 0o600)
  writeFileSync(archivePath, JSON.stringify(plan) + '\n', { flag: 'wx', mode: 0o600 })
  db.transaction(() => {
    if (tableDigest(db, plan.family) !== plan.beforeDigest)
      throw new Error('Address rows changed after backup')
    for (const migration of plan.migrations)
      db.exec(readFileSync(resolve(root, migration.path), 'utf8'))
    const update = db.query(
      plan.family === 'history'
        ? 'UPDATE address2d SET scope=?, versionHash=? WHERE id=? AND snapshotId=?'
        : 'UPDATE address2d SET scope=? WHERE id=? AND scopeId=?',
    )
    for (const row of plan.rows) {
      const result =
        plan.family === 'history'
          ? update.run(row.scope as never, row.hash, row.id, row.storageId)
          : update.run(row.scope as never, row.id, row.storageId)
      if (result.changes !== 1)
        throw new Error('Address identity changed during migration')
    }
    const rows = db
      .query(`SELECT * FROM address2d ORDER BY id, ${key(plan.family)}`)
      .all() as Row[]
    if (rows.length !== plan.rowCount) throw new Error('Address row count changed')
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!,
        expected = plan.rows[i]!
      if (
        row.id !== expected.id ||
        row[key(plan.family)] !== expected.storageId ||
        (plan.family === 'history' && row.versionHash !== expected.hash)
      )
        throw new Error('Address identity/hash verification failed')
    }
    if (db.query('PRAGMA foreign_key_check').get())
      throw new Error('Foreign key verification failed')
  })()
  return plan.rowCount
}
if (import.meta.main) {
  const [command, family, path, planPath, backupPath, archivePath] = Bun.argv.slice(2)
  if (
    !['plan', 'apply'].includes(command ?? '') ||
    !['current', 'history'].includes(family ?? '') ||
    !path ||
    !planPath
  )
    throw new Error(
      'Usage: bun scripts/migrate-address-content.ts plan|apply current|history DATABASE PLAN [BACKUP ARCHIVE]',
    )
  const db = new Database(resolve(path), {
    readonly: command === 'plan',
    create: false,
  })
  try {
    if (command === 'plan') {
      const plan = await planAddressContentMigration(db, family as Family)
      writeFileSync(planPath, JSON.stringify(plan) + '\n', { flag: 'wx', mode: 0o600 })
      console.log(
        JSON.stringify({
          rows: plan.rowCount,
          parentLinks: plan.parentLinks,
          plan: planPath,
        }),
      )
    } else {
      if (!backupPath || !archivePath)
        throw new Error('Apply requires full backup and evidence archive paths')
      const plan = JSON.parse(readFileSync(planPath, 'utf8')) as AddressContentPlan
      if (plan.family !== family) throw new Error('Plan family mismatch')
      console.log(
        JSON.stringify({
          rows: await applyAddressContentMigration(db, plan, backupPath, archivePath),
        }),
      )
    }
  } finally {
    db.close()
  }
}
