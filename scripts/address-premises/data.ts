import { createHash } from 'node:crypto'
import { migrateAddressLocaleRow } from '../migrate-address-premises-name'

export type Row = Record<string, unknown>
export type Statement = { sql: string; params?: unknown[] }
/** Each batch must run atomically, including failed assertions. */
export type Query = (statements: Statement[]) => Promise<Row[][]>
export const marker = 'data-address-premises-name-v1'
export const lockPrefix = '_premises_lock_'
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
export const assertSql = (condition: string) =>
  `SELECT CASE WHEN (${condition}) THEN 1 ELSE json('Premises migration assertion failed') END`
export const lockName = (table: string, operation: string) =>
  `${lockPrefix}${table}_${operation}`
export const lockSql = (table: string, operation: string) =>
  `CREATE TRIGGER IF NOT EXISTS ${quote(lockName(table, operation))} BEFORE ${operation} ON ${quote(table)} BEGIN SELECT RAISE(ABORT, 'Premises migration: writes paused'); END`

export async function tables(query: Query) {
  const [rows] = await query([
    { sql: "SELECT name, sql FROM sqlite_master WHERE type='table'" },
  ])
  const virtual = rows!
    .filter(row => /^CREATE VIRTUAL TABLE/i.test(String(row.sql)))
    .map(row => String(row.name))
  return rows!
    .map(row => String(row.name))
    .filter(
      name =>
        !name.startsWith('sqlite_') &&
        !name.startsWith('_cf_') &&
        name !== 'd1_migrations' &&
        !virtual.some(v => name === v || name.startsWith(`${v}_`)),
    )
    .sort()
}

export async function lock(query: Query) {
  for (const table of await tables(query))
    await query(['INSERT', 'UPDATE', 'DELETE'].map(op => ({ sql: lockSql(table, op) })))
}

export async function unlock(query: Query) {
  const [rows] = await query([
    {
      sql: "SELECT name FROM sqlite_master WHERE type='trigger' AND substr(name,1,15) = '_premises_lock_'",
    },
  ])
  for (const row of rows!)
    await query([{ sql: `DROP TRIGGER ${quote(String(row.name))}` }])
}

export async function counts(query: Query) {
  const result: Record<string, number> = {}
  for (const table of await tables(query)) {
    const [rows] = await query([{ sql: `SELECT count(*) AS n FROM ${quote(table)}` }])
    result[table] = Number(rows![0]!.n)
  }
  return result
}

export async function assertLocked(query: Query) {
  const [rows] = await query([
    { sql: "SELECT name FROM sqlite_master WHERE type='trigger'" },
  ])
  const names = new Set(rows!.map(row => row.name))
  for (const table of await tables(query))
    for (const op of ['INSERT', 'UPDATE', 'DELETE'])
      if (!names.has(lockName(table, op)))
        throw new Error(`Missing write lock: ${table}/${op}`)
}

/** Stream by rowid, preserving all fields except the two explicitly migrated fields. */
export async function locales(
  query: Query,
  history: boolean,
  apply: boolean,
  progress?: (event: { stage: string; rows: number; changed: number }) => void,
) {
  let after = Number.MIN_SAFE_INTEGER
  let changed = 0
  let count = 0
  const digest = createHash('sha256')
  for (;;) {
    const [rows] = await query([
      {
        sql: 'SELECT rowid AS _rowid, * FROM address2dI18n WHERE rowid > ? ORDER BY rowid LIMIT 500',
        params: [after],
      },
    ])
    if (!rows!.length) break
    const updates: Row[] = []
    for (const row of rows!) {
      const { versionHash, meta, ...preserved } = row
      count++
      if (history && row.operation !== 'upsert') {
        // Tombstones, including their metadata and null hash, must remain byte-identical.
        digest.update(`${JSON.stringify({ ...preserved, versionHash, meta })}\n`)
        continue
      }
      const next = await migrateAddressLocaleRow(row, history)
      digest.update(
        `${JSON.stringify({ ...preserved, meta: next.metadataChanged ? JSON.stringify(next.meta) : meta })}\n`,
      )
      if (next.metadataChanged || (history && next.hash !== versionHash)) {
        changed++
        updates.push({
          id: row._rowid,
          oldHash: versionHash ?? null,
          oldMeta: meta ?? null,
          hash: next.hash,
          meta: next.metadataChanged ? JSON.stringify(next.meta) : (meta ?? null),
        })
      }
    }
    if (updates.length && apply) {
      const payload = JSON.stringify(updates)
      const guard = `SELECT count(*) = json_array_length(?) FROM json_each(?) j JOIN address2dI18n a ON a.rowid = json_extract(j.value,'$.id') WHERE a.meta IS json_extract(j.value,'$.oldMeta')${history ? " AND a.versionHash IS json_extract(j.value,'$.oldHash')" : ''}`
      // D1's atomic batch restores the lock and rolls back updates on any assertion failure.
      await query([
        { sql: `DROP TRIGGER ${quote(lockName('address2dI18n', 'UPDATE'))}` },
        { sql: assertSql(guard), params: [payload, payload] },
        {
          sql: `UPDATE address2dI18n AS a SET meta=json_extract(j.value,'$.meta')${history ? ", versionHash=json_extract(j.value,'$.hash')" : ''} FROM json_each(?) j WHERE a.rowid=json_extract(j.value,'$.id')`,
          params: [payload],
        },
        { sql: lockSql('address2dI18n', 'UPDATE') },
      ])
    }
    after = Number(rows!.at(-1)!._rowid)
    if (count % 10000 === 0)
      progress?.({ stage: apply ? 'update' : 'verify', rows: count, changed })
  }
  progress?.({ stage: apply ? 'updated' : 'verified', rows: count, changed })
  return { count, changed, digest: digest.digest('hex') }
}

const ftsNames = [
  'scopeId',
  'addressId',
  'locale',
  'formattedAddress',
  'buildingName',
  'buildingNumber',
  'blockExpression',
  'phaseExpression',
  'premisesName',
  'streetName',
]
export async function search(query: Query) {
  const [schema] = await query([
    { sql: "SELECT sql FROM sqlite_master WHERE name='addressSearchFts'" },
  ])
  if (!schema!.length) return // A database without any search index stays without an index.
  const sql = String(schema![0]!.sql)
  if (!sql.includes('estateName')) {
    if (!sql.includes('premisesName')) throw new Error('Unexpected address FTS schema')
    return
  }
  const stage = '_premises_fts_stage'
  await query([
    { sql: `DROP TABLE IF EXISTS ${stage}` },
    {
      sql: sql
        .replace('addressSearchFts', stage)
        .replaceAll('estateName', 'premisesName'),
    },
  ])
  const source = ftsNames.map(n => (n === 'premisesName' ? 'estateName' : n)).join(',')
  let after = Number.MIN_SAFE_INTEGER
  for (;;) {
    const [rows] = await query([
      {
        sql: 'SELECT rowid FROM addressSearchFts WHERE rowid > ? ORDER BY rowid LIMIT 2000',
        params: [after],
      },
    ])
    if (!rows!.length) break
    const end = Number(rows!.at(-1)!.rowid)
    await query([
      {
        sql: `INSERT INTO ${stage}(rowid,${ftsNames.join(',')}) SELECT rowid,${source} FROM addressSearchFts WHERE rowid > ? AND rowid <= ?`,
        params: [after, end],
      },
    ])
    after = end
  }
  await query([
    {
      sql: assertSql(
        `NOT EXISTS(SELECT rowid,${source} FROM addressSearchFts EXCEPT SELECT rowid,${ftsNames.join(',')} FROM ${stage}) AND NOT EXISTS(SELECT rowid,${ftsNames.join(',')} FROM ${stage} EXCEPT SELECT rowid,${source} FROM addressSearchFts)`,
      ),
    },
    { sql: 'DROP TABLE addressSearchFts' },
    { sql: `ALTER TABLE ${stage} RENAME TO addressSearchFts` },
  ])
}

export async function migrate(
  query: Query,
  history: boolean,
  progress?: (event: { stage: string; rows: number; changed: number }) => void,
) {
  await assertLocked(query)
  const [columns] = await query([{ sql: 'PRAGMA table_info(address2dI18n)' }])
  if (
    !columns!.some(c => c.name === 'premisesName') ||
    columns!.some(c => c.name === 'estateName')
  )
    throw new Error('Apply the generated column migration before data maintenance')
  const before = await counts(query)
  const result = await locales(query, history, true, progress)
  if (!history) await search(query)
  const verified = await locales(query, history, false, progress)
  if (
    verified.changed ||
    verified.count !== result.count ||
    verified.digest !== result.digest
  )
    throw new Error('Locale preservation or canonical hash verification failed')
  if (JSON.stringify(before) !== JSON.stringify(await counts(query)))
    throw new Error('Table counts changed')
  const [foreignKeys] = await query([{ sql: 'PRAGMA foreign_key_check' }])
  if (foreignKeys!.length) throw new Error('Foreign-key violations after migration')
  await assertLocked(query)
  return { ...verified, changed: result.changed, tables: before }
}
