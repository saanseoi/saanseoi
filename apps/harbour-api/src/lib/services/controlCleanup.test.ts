import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { listCurrentSnapshotCleanupCandidates } from '@repo/core/db/metaRegistry'
import { cleanupSnapshotByResourceType } from '../../../../harbour-workers/src/lib/services/snapshotCleanup'
import {
  scheduleCurrentSnapshotCleanup,
  scheduleReconciledSnapshotCleanup,
} from './controlCleanup'
import type { HarbourJobQueue } from './controlTypes'

function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE publishers(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE datasets(id TEXT PRIMARY KEY,publisherId TEXT,code TEXT,regionCode TEXT,sourceVariant TEXT);
    CREATE TABLE releases(id TEXT PRIMARY KEY,datasetId TEXT,resourceType TEXT,status TEXT);
    CREATE TABLE snapshotLineages(id TEXT PRIMARY KEY,variant TEXT);
    CREATE TABLE snapshots(id TEXT PRIMARY KEY,snapshotLineageId TEXT,resourceType TEXT,
      cohortKey TEXT,geometryStatus TEXT,revision INTEGER,status TEXT,publishedAt TEXT,createdAt TEXT);
    CREATE TABLE snapshotSources(snapshotId TEXT,datasetId TEXT,resourceReleaseId TEXT,role TEXT);
    CREATE TABLE apiVersions(id TEXT PRIMARY KEY,familyType TEXT);
    CREATE TABLE apiReleaseSets(id TEXT PRIMARY KEY,apiVersionId TEXT,regionCode TEXT,status TEXT);
    CREATE TABLE apiReleaseSetSnapshots(apiReleaseSetId TEXT,snapshotId TEXT);
    CREATE TABLE divisionAreaPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE NOT NULL,
      status TEXT,publicationToken TEXT,preparedAt TEXT);
    CREATE TABLE divisionAreas(snapshotId TEXT,id TEXT,PRIMARY KEY(snapshotId,id));
    INSERT INTO publishers VALUES ('publisher','hkgov-pland');
    INSERT INTO datasets VALUES ('geometry','publisher','ds-hk-hkgov-pland-division-new-town','hk','new-town');
    INSERT INTO snapshotLineages VALUES ('new-town','hkgov-pland-new-town');
    INSERT INTO apiVersions VALUES ('divisions','divisions'),('stats','stats');
  `)
  const db = createLocalHarbourDb(sqlite)
  const messages: Parameters<HarbourJobQueue['send']>[0][] = []
  const queue: HarbourJobQueue = {
    async send(message) {
      messages.push(message)
    },
  }
  function add(
    id: string,
    options: {
      status?: string
      family?: string
      region?: string
      sourceStatus?: string
      prepared?: boolean
    } = {},
  ) {
    sqlite
      .query('INSERT INTO apiReleaseSets VALUES (?,?,?,?)')
      .run(
        id,
        options.family ?? 'divisions',
        options.region ?? 'hk',
        options.status ?? 'archived',
      )
    sqlite.query('INSERT INTO apiReleaseSetSnapshots VALUES (?,?)').run(id, id)
    sqlite
      .query("INSERT INTO releases VALUES (?,'geometry','divisionArea',?)")
      .run(id, options.sourceStatus ?? 'superseded')
    sqlite
      .query(`INSERT INTO snapshots VALUES (?, 'new-town', 'divisionArea', ?,
      'authoritative', 0, 'published', '2026-09-11', '2026-09-11')`)
      .run(id, id)
    sqlite
      .query("INSERT INTO snapshotSources VALUES (?,'geometry',?,'primary')")
      .run(id, id)
    const scopeId = JSON.stringify(['new-town', id])
    sqlite
      .query(`INSERT INTO divisionAreaPublicationState VALUES (?,?,'publishing',?,?)`)
      .run(scopeId, id, `token-${id}`, options.prepared === false ? null : 'complete')
    sqlite.query('INSERT INTO divisionAreas VALUES (?,?)').run(scopeId, id)
  }
  async function consume() {
    for (const message of messages.splice(0)) {
      if (message.jobType !== 'cleanupCurrentSnapshots')
        throw new Error('Unexpected job')
      for (const candidate of await listCurrentSnapshotCleanupCandidates(db, {
        snapshotIds: message.snapshotIds,
      })) {
        await cleanupSnapshotByResourceType(db, candidate)
      }
    }
  }
  const reconcile = () =>
    scheduleReconciledSnapshotCleanup(db, queue, {
      apiFamily: 'divisions',
      regionCode: 'hk',
    })
  return { sqlite, db, queue, messages, add, consume, reconcile }
}

test('reconciliation cleans completed deferred cohorts after their release sets become archived', async () => {
  const f = fixture()
  try {
    for (const cohort of ['2006', '2011', '2016']) f.add(cohort, { status: 'draft' })
    f.add('2021', { status: 'current', sourceStatus: 'published' })
    f.sqlite.exec(
      "UPDATE divisionAreaPublicationState SET status='current' WHERE snapshotId='2021'",
    )
    expect(
      (await scheduleCurrentSnapshotCleanup(f.db, f.queue, {})).candidateCount,
    ).toBe(0)
    expect((await f.reconcile()).candidateCount).toBe(0)

    f.sqlite.exec("UPDATE apiReleaseSets SET status='archived' WHERE status='draft'")
    const metadata = f.sqlite.query('SELECT * FROM snapshots').all()
    expect((await f.reconcile()).snapshotIds.sort()).toEqual(['2006', '2011', '2016'])
    await f.consume()
    expect(
      f.sqlite
        .query('SELECT snapshotId,status FROM divisionAreaPublicationState')
        .all(),
    ).toEqual([{ snapshotId: '2021', status: 'current' }])
    expect(f.sqlite.query('SELECT id FROM divisionAreas').all()).toEqual([
      { id: '2021' },
    ])
    expect(f.sqlite.query('SELECT * FROM snapshots').all()).toEqual(metadata)

    // A retry with no drafts still schedules the same guarded, harmless cleanup.
    await f.reconcile()
    const changes = f.sqlite.query('SELECT total_changes() AS n').get()
    await f.consume()
    expect(f.sqlite.query('SELECT total_changes() AS n').get()).toEqual(changes)
  } finally {
    f.sqlite.close()
  }
})

test('reconciliation scopes cleanup and protects retained members and active deliveries', async () => {
  const f = fixture()
  try {
    f.add('obsolete')
    f.add('active', { prepared: false })
    f.add('retained-geometry', { sourceStatus: 'published' })
    f.add('other-region', { region: 'mo' })
    f.add('other-family', { family: 'stats' })
    for (const status of ['draft', 'current']) {
      f.add(`pinned-${status}`)
      f.sqlite
        .query('INSERT INTO apiReleaseSets VALUES (?,?,?,?)')
        .run(status, 'stats', 'hk', status)
      f.sqlite
        .query('INSERT INTO apiReleaseSetSnapshots VALUES (?,?)')
        .run(status, `pinned-${status}`)
    }
    expect((await f.reconcile()).snapshotIds.sort()).toEqual(['active', 'obsolete'])
    await f.consume()
    expect(
      f.sqlite
        .query(
          'SELECT snapshotId FROM divisionAreaPublicationState ORDER BY snapshotId',
        )
        .all(),
    ).toEqual(
      [
        'active',
        'other-family',
        'other-region',
        'pinned-current',
        'pinned-draft',
        'retained-geometry',
      ].map(snapshotId => ({ snapshotId })),
    )

    // A queued candidate can become protected before the consumer runs.
    f.add('repinned')
    await f.reconcile()
    f.sqlite.exec("UPDATE apiReleaseSets SET status='current' WHERE id='repinned'")
    await f.consume()
    expect(
      f.sqlite.query("SELECT id FROM divisionAreas WHERE id='repinned'").get(),
    ).toEqual({ id: 'repinned' })
  } finally {
    f.sqlite.close()
  }
})

test('reconciliation propagates queue failures so cleanup can be retried', async () => {
  const f = fixture()
  try {
    f.add('obsolete')
    await expect(
      scheduleReconciledSnapshotCleanup(
        f.db,
        {
          async send() {
            throw new Error('queue unavailable')
          },
        },
        { apiFamily: 'divisions', regionCode: 'hk' },
      ),
    ).rejects.toThrow('queue unavailable')
    expect(f.sqlite.query('SELECT id FROM divisionAreas').all()).toEqual([
      { id: 'obsolete' },
    ])
  } finally {
    f.sqlite.close()
  }
})
