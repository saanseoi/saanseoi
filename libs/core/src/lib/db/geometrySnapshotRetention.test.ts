import { Database as SQLiteDatabase } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'

import { createLocalHarbourDb } from '../../testing/localDb'
import { listRetainedGeometrySnapshotIds } from './geometrySnapshotRetention'
import { listCurrentSnapshotCleanupCandidates } from './metaRegistry'

const databases: SQLiteDatabase[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

function fixture() {
  const sqlite = new SQLiteDatabase(':memory:')
  databases.push(sqlite)
  sqlite.exec(`
    CREATE TABLE publishers (id TEXT PRIMARY KEY, code TEXT);
    CREATE TABLE datasets (
      id TEXT PRIMARY KEY, publisherId TEXT, code TEXT, regionCode TEXT, sourceVariant TEXT
    );
    CREATE TABLE releases (
      id TEXT PRIMARY KEY, datasetId TEXT, resourceType TEXT, status TEXT
    );
    CREATE TABLE snapshotLineages (id TEXT PRIMARY KEY, variant TEXT);
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY, snapshotLineageId TEXT, resourceType TEXT,
      cohortKey TEXT, geometryStatus TEXT, revision INTEGER,
      status TEXT, publishedAt TEXT, createdAt TEXT
    );
    CREATE TABLE snapshotSources (
      snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, role TEXT
    );
    CREATE TABLE apiReleaseSets (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE apiReleaseSetSnapshots (apiReleaseSetId TEXT, snapshotId TEXT);
    INSERT INTO publishers VALUES ('publisher', 'overture');
  `)
  const db = createLocalHarbourDb(sqlite)
  const addDataset = (id: string, region = 'hk', variant = id) => {
    sqlite
      .query('INSERT INTO datasets VALUES (?, ?, ?, ?, ?)')
      .run(id, 'publisher', `ds-${region}-${id}`, region, variant)
  }
  const addRelease = (
    id: string,
    dataset: string,
    status = 'published',
    resourceType = 'divisionArea',
  ) => {
    sqlite
      .query('INSERT INTO releases VALUES (?, ?, ?, ?)')
      .run(id, dataset, resourceType, status)
  }
  const addSource = (snapshot: string, release: string, role = 'primary') => {
    sqlite
      .query(`INSERT INTO snapshotSources
        SELECT ?, datasetId, id, ? FROM releases WHERE id = ?`)
      .run(snapshot, role, release)
  }
  const addSnapshot = (
    id: string,
    release: string,
    cohort: string,
    variant: string | null,
    options: {
      geometryStatus?: string
      revision?: number
      status?: string
      publishedAt?: string
      createdAt?: string
      role?: string
    } = {},
  ) => {
    if (variant)
      sqlite
        .query('INSERT OR IGNORE INTO snapshotLineages VALUES (?, ?)')
        .run(variant, variant)
    sqlite
      .query(`INSERT INTO snapshots
        SELECT ?, ?, resourceType, ?, ?, ?, ?, ?, ? FROM releases WHERE id = ?`)
      .run(
        id,
        variant,
        cohort,
        options.geometryStatus ?? 'authoritative',
        options.revision ?? 0,
        options.status ?? 'published',
        options.publishedAt ?? '2026-09-01',
        options.createdAt ?? '2026-09-01',
        release,
      )
    addSource(id, release, options.role)
  }
  return { db, sqlite, addDataset, addRelease, addSnapshot, addSource }
}

describe('geometry snapshot retention', () => {
  test('cleans superseded rolling releases and retains independently published census cohorts and transforms', async () => {
    const { db, addDataset, addRelease, addSnapshot } = fixture()
    addDataset('rolling')
    addRelease('rolling-old', 'rolling', 'superseded')
    addRelease('rolling-current', 'rolling')
    addSnapshot('rolling-old', 'rolling-old', '2026-07', 'rolling')
    addSnapshot('rolling-current', 'rolling-current', '2026-08', 'rolling')
    addDataset('census')
    for (const cohort of ['2016', '2021']) {
      addRelease(`census-${cohort}`, 'census')
      for (const variant of ['landclipped', 'landclipped:simplified'])
        addSnapshot(`${variant}-${cohort}`, `census-${cohort}`, cohort, variant)
    }
    addRelease('boundary-old', 'rolling', 'superseded', 'divisionBoundary')
    addRelease('boundary-current', 'rolling', 'published', 'divisionBoundary')
    addSnapshot('boundary-old', 'boundary-old', '2026-07', 'rolling')
    addSnapshot('boundary-current', 'boundary-current', '2026-08', 'rolling')

    expect([...(await listRetainedGeometrySnapshotIds(db))].sort()).toEqual([
      'boundary-current',
      'landclipped-2016',
      'landclipped-2021',
      'landclipped:simplified-2016',
      'landclipped:simplified-2021',
      'rolling-current',
    ])
    expect(
      (await listCurrentSnapshotCleanupCandidates(db)).map(row => row.snapshotId),
    ).toEqual(['rolling-old', 'boundary-old'])
  })

  test('scoped cleanup sees newer same-cohort revisions and prefers authoritative geometry', async () => {
    const { db, addDataset, addRelease, addSnapshot } = fixture()
    addDataset('census')
    // A corrected census release can coexist with its still-published original.
    addRelease('original', 'census')
    addRelease('correction', 'census')
    addSnapshot('original', 'original', '2021', 'landclipped')
    addSnapshot('correction', 'correction', '2021', 'landclipped', {
      publishedAt: '2026-09-02',
    })
    addSnapshot('newer-fallback', 'correction', '2021', 'landclipped', {
      geometryStatus: 'fallback',
      publishedAt: '2026-09-03',
      revision: 2,
    })
    addSnapshot('unpublished-draft', 'correction', '2021', 'landclipped', {
      status: 'draft',
      publishedAt: '2026-09-04',
      revision: 3,
    })
    expect([...(await listRetainedGeometrySnapshotIds(db))]).toEqual(['correction'])
    expect(
      await listCurrentSnapshotCleanupCandidates(db, {
        snapshotIds: ['original', 'newer-fallback', 'unpublished-draft'],
      }),
    ).toEqual([
      { snapshotId: 'newer-fallback', resourceType: 'divisionArea' },
      { snapshotId: 'original', resourceType: 'divisionArea' },
    ])
  })

  test('merged contributions retain their selected geometry while lookup sources and revoked releases do not protect snapshots', async () => {
    const { db, addDataset, addRelease, addSnapshot, addSource } = fixture()
    for (const dataset of ['annual', 'housing', 'other-region']) addDataset(dataset)
    addRelease('annual', 'annual')
    addRelease('housing', 'housing')
    addRelease('revoked', 'annual', 'revoked')
    addRelease('other-region', 'other-region')
    addSnapshot('annual-old', 'annual', '2024', 'companion')
    addSnapshot('merged', 'housing', '2024', 'companion', {
      publishedAt: '2026-09-02',
    })
    addSource('merged', 'annual', 'enrichment')
    addSnapshot('lookup-only', 'annual', '2024', 'companion', {
      publishedAt: '2026-09-03',
      role: 'lookup',
    })
    addSnapshot('revoked', 'revoked', '2024', 'companion', {
      publishedAt: '2026-09-04',
    })
    addSnapshot('separate-dataset', 'other-region', '2024', 'companion')
    expect([...(await listRetainedGeometrySnapshotIds(db))].sort()).toEqual([
      'merged',
      'separate-dataset',
    ])
  })

  test('non-archived release sets independently protect old snapshots and missing lineages do not exempt obsolete geometry', async () => {
    const { db, sqlite, addDataset, addRelease, addSnapshot } = fixture()
    addDataset('overture', 'hk', 'overture')
    addRelease('old', 'overture', 'superseded')
    addRelease('current', 'overture')
    addSnapshot('unlinked-old', 'old', '2026-07', null)
    addSnapshot('unlinked-revision', 'current', '2026-08', null)
    addSnapshot('current', 'current', '2026-08', 'overture', {
      publishedAt: '2026-09-02',
    })
    for (const status of ['current', 'draft', 'archived']) {
      addSnapshot(`member-${status}`, 'old', '2026-07', 'overture')
      sqlite.query('INSERT INTO apiReleaseSets VALUES (?, ?)').run(status, status)
      sqlite
        .query('INSERT INTO apiReleaseSetSnapshots VALUES (?, ?)')
        .run(status, `member-${status}`)
    }
    expect(
      (await listCurrentSnapshotCleanupCandidates(db))
        .map(row => row.snapshotId)
        .sort(),
    ).toEqual(['member-archived', 'unlinked-old', 'unlinked-revision'])
  })
})
