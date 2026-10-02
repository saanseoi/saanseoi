import { expect, test } from 'bun:test'
import { selectApiInventory } from './apiInventory'
const member = (type: string, variant: string, role: string) => ({
  snapshotResourceType: type,
  variant,
  role,
  snapshotId: `${type}:${variant}`,
})
const snapshots = [
  member('division', 'saanseoi', 'primary'),
  member('division', 'overture', 'inventory'),
  member('division', 'hkgov-landsd', 'lookup'),
  member('divisionArea', 'saanseoi', 'geometry'),
  member('divisionArea', 'overture', 'geometry'),
]
test('inventory selects a coherent primary and its compatible companions', () => {
  expect(selectApiInventory(snapshots, 'division').inventory).toBe('saanseoi')
  const native = selectApiInventory(snapshots, 'division', 'overture')
  expect(native.snapshots.map(s => s.snapshotId)).toEqual([
    'division:overture',
    'divisionArea:overture',
  ])
  expect(native.snapshots[0]!.role).toBe('primary')
  expect(snapshots[1]!.role).toBe('inventory')
  expect(() => selectApiInventory(snapshots, 'division', 'hkgov-landsd')).toThrow(
    'unavailable',
  )
  expect(() =>
    selectApiInventory(snapshots.slice(0, 1), 'division', 'overture'),
  ).toThrow('unavailable')
})

test('publication keeps distinct ruleset pins with their API version associations', async () => {
  const { Database } = await import('bun:sqlite')
  const { resolve } = await import('node:path')
  const { loadMigrationSql } = await import('../../testing/metaFixtures')
  const { createLocalHarbourDb } = await import('../../testing/localDb')
  const { ensureDraftReleaseSetForRelease } = await import('./metaRegistry')
  const db = new Database(':memory:')
  try {
    db.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), ['meta']),
    )
    db.exec(`INSERT INTO apiVersions(id,code,familyType,version,status,versionHash)
      VALUES ('v01','api-divisions-v0.1','divisions','0.1','current','test'),
             ('v02','api-divisions-v0.2','divisions','0.2','current','test')`)
    const meta = createLocalHarbourDb(db)
    const old = await ensureDraftReleaseSetForRelease(
      meta,
      'division',
      { cohortKey: '2026-09-01.0', regionCode: 'hk' },
      {
        domainCode: 'geographic',
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
      },
    )
    const reviewed = await ensureDraftReleaseSetForRelease(
      meta,
      'division',
      { cohortKey: '2026-09-01.0', regionCode: 'hk' },
      {
        domainCode: 'geographic',
        apiVersion: 'api-divisions-v0.2',
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v2',
      },
    )
    expect(old.id).not.toBe(reviewed.id)
    expect(old.code).toBe(reviewed.code)
    expect(
      db
        .query('SELECT apiVersionId FROM apiVersionReleaseSets WHERE apiReleaseSetId=?')
        .get(old.id),
    ).toEqual({ apiVersionId: 'v01' })
    expect(
      db
        .query('SELECT apiVersionId FROM apiVersionReleaseSets WHERE apiReleaseSetId=?')
        .get(reviewed.id),
    ).toEqual({ apiVersionId: 'v02' })
  } finally {
    db.close()
  }
})

test('publication rejects unknown stored pins before attaching snapshots', async () => {
  const { Database } = await import('bun:sqlite')
  const { resolve } = await import('node:path')
  const { loadMigrationSql } = await import('../../testing/metaFixtures')
  const { createLocalHarbourDb } = await import('../../testing/localDb')
  const { publishReleaseArtefacts } = await import('./metaRegistry')
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), ['meta']),
    )
    sqlite.exec(`
      INSERT INTO apiVersions(id, code, familyType, version, status, versionHash)
      VALUES ('api', 'api-divisions-v0.2', 'divisions', '0.2', 'current', 'test');
      INSERT INTO apiReleaseSets(id, code, schemaVersion, rulesetVersion, versionHash)
      VALUES ('release', 'release', 'sv-missing-v1', 'rs-division-merge-v2', 'test');
      INSERT INTO apiVersionReleaseSets(id, apiVersionId, apiReleaseSetId, status, versionHash)
      VALUES ('association', 'api', 'release', 'draft', 'test');
    `)
    await expect(
      publishReleaseArtefacts(createLocalHarbourDb(sqlite), {
        carriedSnapshots: [],
        currentRelease: null,
        currentReleaseIsCorrected: false,
        dataset: {
          datasetId: 'dataset',
          releaseCode: 'source',
          resourceReleaseId: 'source',
        },
        publishedAt: '2026-10-02T00:00:00Z',
        releaseSetId: 'release',
        snapshotId: 'snapshot',
        resourceType: 'division',
      }),
    ).rejects.toThrow('Unknown API release schemaVersion: sv-missing-v1')
    expect(
      sqlite.query('SELECT count(*) AS count FROM apiReleaseSetSnapshots').get(),
    ).toEqual({ count: 0 })
    expect(sqlite.query('SELECT status FROM apiVersionReleaseSets').get()).toEqual({
      status: 'draft',
    })
  } finally {
    sqlite.close()
  }
})
