import type { Database, SQLQueryBindings } from 'bun:sqlite'

type FixtureSnapshot = {
  id: string
  resourceType: string
  snapshotLineageId?: string | null
  [column: string]: SQLQueryBindings | undefined
}

/** Seed a snapshot and its required lineage together in an in-memory test database. */
export function snapshotFixtureFields(db: Database, input: Record<string, unknown>) {
  const { resourceType, snapshotLineageId, ...fields } = input
  if (typeof input.id !== 'string' || typeof resourceType !== 'string')
    throw new Error('Snapshot fixtures require an id and resource type.')
  const lineageId =
    typeof snapshotLineageId === 'string'
      ? snapshotLineageId
      : `fixture-lineage-${input.id}`
  db.query(`INSERT OR IGNORE INTO snapshotLineages (
    id, code, regionCode, resourceType, variant, identityMode, versionHash, createdAt, updatedAt
  ) VALUES (?, ?, 'hk', ?, 'default', 'persistent', 'fixture', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`).run(
    lineageId,
    lineageId,
    resourceType,
  )
  db.query(
    'UPDATE snapshotLineages SET resourceType = ? WHERE id = ? AND resourceType IS NULL',
  ).run(resourceType, lineageId)
  return { ...fields, snapshotLineageId: lineageId }
}

export function insertFixtureSnapshot(
  db: Database,
  input: FixtureSnapshot,
  ignoreConflict = false,
) {
  const row: Record<string, unknown> = snapshotFixtureFields(db, input)
  const entries = Object.entries(row).filter(
    (entry): entry is [string, SQLQueryBindings] => entry[1] !== undefined,
  )
  db.query(
    `INSERT ${ignoreConflict ? 'OR IGNORE ' : ''}INTO snapshots (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
  ).run(...entries.map(([, value]) => value))
}
