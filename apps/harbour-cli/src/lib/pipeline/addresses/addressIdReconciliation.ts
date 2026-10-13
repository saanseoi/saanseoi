import type { Database } from 'bun:sqlite'
import { canonicalAddressId } from '@repo/db'

export type AddressIdMapping = {
  address2d: Map<string, string>
  address3d: Map<string, string>
}
const quoted = (value: string) => `"${value.replaceAll('"', '""')}"`
const tables = (db: Database) =>
  db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map(row => row.name)

/** Inventory all shards together before changing any reference. */
export function planAddressIdReconciliation(databases: Database[]): AddressIdMapping {
  const mapping: AddressIdMapping = { address2d: new Map(), address3d: new Map() }
  for (const db of databases) {
    const names = new Set(tables(db))
    for (const type of ['address2d', 'address3d'] as const) {
      if (!names.has(type)) continue
      const ids = new Set(
        db
          .query<{ id: string }, []>(`SELECT DISTINCT id FROM ${type}`)
          .all()
          .map(row => row.id),
      )
      for (const id of ids) {
        const target = canonicalAddressId(id)
        if (target === id) continue
        if (ids.has(target))
          throw new Error(
            `Ambiguous ${type} identity: both ${id} and ${target} exist in a shard.`,
          )
        mapping[type].set(id, target)
      }
    }
  }
  return mapping
}

/**
 * Rewrite a disposable database copy. Publication is deliberately a separate step:
 * immutable canonical versions must be regenerated before a candidate is published.
 * Publisher properties, audit context, source identities and unit identities stay exact.
 */
export function reconcileAddressIdCopy(db: Database, mapping: AddressIdMapping) {
  const counts: Record<string, number> = {}
  db.transaction(() => {
    db.exec('PRAGMA defer_foreign_keys=ON')
    db.exec(
      'CREATE TEMP TABLE addressIdMapping(kind TEXT,oldId TEXT,newId TEXT,PRIMARY KEY(kind,oldId))',
    )
    const insert = db.query('INSERT INTO addressIdMapping VALUES(?,?,?)')
    for (const [kind, ids] of Object.entries(mapping))
      for (const [oldId, newId] of ids) insert.run(kind, oldId, newId)
    for (const table of tables(db)) {
      const columns = new Set(
        db
          .query<{ name: string }, []>(`PRAGMA table_info(${quoted(table)})`)
          .all()
          .map(row => row.name),
      )
      const fields: Array<[string, keyof AddressIdMapping]> = []
      if (table === 'address2d' || table === 'address3d') fields.push(['id', table])
      for (const field of ['addressId', 'address2dId', 'parentAddressId'])
        if (columns.has(field)) fields.push([field, 'address2d'])
      if (columns.has('address3dId')) fields.push(['address3dId', 'address3d'])
      for (const [field, kind] of fields) {
        const result = db
          .query(
            `UPDATE ${quoted(table)} SET ${quoted(field)}=(SELECT newId FROM addressIdMapping WHERE kind=? AND oldId=${quoted(table)}.${quoted(field)}) WHERE ${quoted(field)} IN (SELECT oldId FROM addressIdMapping WHERE kind=?)`,
          )
          .run(kind, kind)
        if (result.changes) counts[`${table}.${field}`] = result.changes
      }
    }
    db.exec('DROP TABLE addressIdMapping')
    const violations = db.query('PRAGMA foreign_key_check').all()
    if (violations.length)
      throw new Error(
        `Address reconciliation leaves ${violations.length} foreign-key violations.`,
      )
  })()
  return counts
}
