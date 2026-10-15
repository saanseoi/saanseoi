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

/** Seed a real primary input for isolated HISTORY replay fixtures. */
export function insertSnapshotProducerFixture(
  db: Database,
  snapshotId: string,
  resourceReleaseId = `producer-${snapshotId}`,
) {
  const snapshot = db
    .query<{ resourceType: string }, [string]>(
      `SELECT l.resourceType FROM snapshots s JOIN snapshotLineages l ON l.id=s.snapshotLineageId WHERE s.id=?`,
    )
    .get(snapshotId)
  if (!snapshot) throw new Error(`Missing fixture snapshot ${snapshotId}.`)
  const datasetId = `fixture-producer-${snapshot.resourceType}`
  db.query(
    `INSERT OR IGNORE INTO publishers(id,code,versionHash) VALUES('fixture-producer','fixture-producer','fixture')`,
  ).run()
  db.query(
    `INSERT OR IGNORE INTO datasets(id,code,publisherId,regionCode,releaseType,releaseFrequency,theme,versionHash) VALUES(?,?,'fixture-producer','hk','static','monthly','divisions','fixture')`,
  ).run(datasetId, datasetId)
  db.query(
    `INSERT OR IGNORE INTO sourceReleases(id,datasetId,code,sourceVersion,cohortKey,status) VALUES(?,?,?,?,'2026','current')`,
  ).run(
    `source-${resourceReleaseId}`,
    datasetId,
    `source-${resourceReleaseId}`,
    resourceReleaseId,
  )
  db.query(
    `INSERT OR IGNORE INTO resourceReleases(id,sourceReleaseId,code,resourceType,status) VALUES(?,?,?,?,'current')`,
  ).run(
    resourceReleaseId,
    `source-${resourceReleaseId}`,
    resourceReleaseId,
    snapshot.resourceType,
  )
  db.query(
    `INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,role) VALUES(?,?,'primary')`,
  ).run(snapshotId, resourceReleaseId)
}

/** Complete migrated replay fixtures that omit a producing input for an ancestor. */
export function seedSnapshotProducerFixtures(db: Database) {
  const snapshots = db
    .query<{ id: string }, []>(`SELECT id FROM snapshots s WHERE NOT EXISTS (
    SELECT 1 FROM snapshotResourceReleases p WHERE p.snapshotId=s.id AND p.role='primary'
  )`)
    .all()
  for (const { id } of snapshots) insertSnapshotProducerFixture(db, id)
}
