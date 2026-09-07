import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../testing/localDb'
import { loadMigrationSql } from '../../testing/metaFixtures'
import {
  recordSnapshotAssemblyRun,
  upsertSnapshotSource,
} from '../../lib/db/metaRegistry'
import { recordPlaceAddressAssembly } from '../services/placeAddressAssembly'
import { readSnapshotAssemblySql } from './snapshotAssembly'

const now = '2026-09-07T00:00:00.000Z'
function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../db/migrations'), [
      'meta',
    ]),
  )
  sqlite.exec(`PRAGMA foreign_keys = ON;
    INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt) VALUES ('publisher', 'publisher', 'hash', '${now}', '${now}');
    INSERT INTO snapshots (id, code, resourceType, cohortKey, status, createdAt, updatedAt)
    VALUES ('snapshot', 'snapshot', 'address', '2026', 'draft', '${now}', '${now}');`)
  for (const id of ['primary', 'enrichment', 'lookup']) {
    sqlite.exec(`
      INSERT INTO datasets (id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, sourceVariant, versionHash, createdAt, updatedAt)
      VALUES ('${id}', 'publisher', '${id}', 'hk', 'static', 'yearly', 'address', '${id}', 'hash', '${now}', '${now}');
      INSERT INTO sourceReleases (id, datasetId, code, sourceVersion, cohortKey, status, ingestedAt, createdAt, updatedAt)
      VALUES ('source-${id}', '${id}', 'source-${id}', '2026', '2026', 'processing', '${now}', '${now}', '${now}');
      INSERT INTO releases (id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey, status, ingestedAt, createdAt, updatedAt)
      VALUES ('release-${id}', 'source-${id}', '${id}', 'address', 'release-${id}', '2026', '2026', 'processing', '${now}', '${now}', '${now}');`)
  }
  const db = createLocalHarbourDb(sqlite)
  return { sqlite, db }
}
const args = {
  snapshotId: 'snapshot',
  resourceType: 'address' as const,
  anchorCohortKey: '2026',
  anchorReleaseId: 'release-primary',
}
async function source(
  db: ReturnType<typeof fixture>['db'],
  role: 'primary' | 'enrichment' | 'lookup',
) {
  await upsertSnapshotSource(db, 'snapshot', role, `release-${role}`, role, {
    selectedByRule: `${role}-v1`,
    selectionMode: role === 'lookup' ? 'latest_at_or_before_cohort' : 'exact_ref',
    sourceCohortKey: '2026',
  })
}
function run(sqlite: Database) {
  return sqlite.query('SELECT * FROM snapshotAssemblyRuns').get() as {
    id: string
    snapshotAssemblyId: string
    anchorReleaseId: string
    selectionSummaryJson: string
    status: string
  }
}

test('fresh ingestion records all inputs, refreshes one draft run and replays its complete foreign-key closure', async () => {
  const local = fixture()
  const target = fixture()
  try {
    await source(local.db, 'primary')
    await recordSnapshotAssemblyRun(local.db, {
      ...args,
      selectionSummaryJson: { materialisationHash: 'retained' },
    })
    const first = run(local.sqlite)
    await source(local.db, 'enrichment')
    await source(local.db, 'lookup')
    await recordSnapshotAssemblyRun(local.db, {
      ...args,
      anchorReleaseId: 'release-enrichment',
    })
    const final = run(local.sqlite)
    expect(final.id).toBe(first.id)
    expect(final.snapshotAssemblyId).not.toBe(first.snapshotAssemblyId)
    expect(final.anchorReleaseId).toBe('release-primary')
    expect(JSON.parse(final.selectionSummaryJson).materialisationHash).toBe('retained')
    expect(JSON.parse(final.selectionSummaryJson).sources).toHaveLength(3)
    expect(local.sqlite.query('SELECT * FROM snapshotAssemblyRuns').all()).toHaveLength(
      1,
    )
    expect(
      local.sqlite
        .query('SELECT * FROM snapshotAssemblySources WHERE snapshotAssemblyId = ?')
        .all(final.snapshotAssemblyId),
    ).toHaveLength(3)
    await recordSnapshotAssemblyRun(local.db, args)
    expect(run(local.sqlite).snapshotAssemblyId).toBe(final.snapshotAssemblyId)
    const sql = (await readSnapshotAssemblySql(local.db, 'snapshot', true)).join('\n')
    target.sqlite.exec(sql)
    target.sqlite.exec(sql)
    expect(run(target.sqlite).selectionSummaryJson).toBe(final.selectionSummaryJson)
    expect(target.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(
      target.sqlite.query('SELECT * FROM snapshotAssemblySources').all(),
    ).toHaveLength(3)
  } finally {
    local.sqlite.close()
    target.sqlite.close()
  }
})

test('published assembly evidence remains fixed when a later release verifies the same geometry', async () => {
  const { db, sqlite } = fixture()
  try {
    await source(db, 'primary')
    await recordSnapshotAssemblyRun(db, args)
    const before = run(sqlite)
    sqlite.exec("UPDATE snapshots SET status = 'published'")
    await source(db, 'enrichment')
    await recordSnapshotAssemblyRun(db, args)
    expect(run(sqlite)).toEqual(before)
  } finally {
    sqlite.close()
  }
})

test('Places planning and finalisation retain review evidence in the same run', async () => {
  const { db, sqlite } = fixture()
  try {
    await recordPlaceAddressAssembly(db, {
      ...args,
      selectionSummaryJson: { addressSnapshotId: 'als', reviewRequired: 2 },
    })
    expect(run(sqlite).status).toBe('planning')
    await source(db, 'primary')
    await recordPlaceAddressAssembly(db, {
      ...args,
      selectionSummaryJson: { reviewRequired: 0, materialisationHash: 'hash' },
    })
    expect(run(sqlite).status).toBe('selected')
    expect(JSON.parse(run(sqlite).selectionSummaryJson)).toMatchObject({
      addressSnapshotId: 'als',
      reviewRequired: 0,
      materialisationHash: 'hash',
    })
    expect(sqlite.query('SELECT * FROM snapshotAssemblyRuns').all()).toHaveLength(1)
  } finally {
    sqlite.close()
  }
})

test('missing selection rules fail explicitly instead of recording invented provenance', async () => {
  const { db, sqlite } = fixture()
  try {
    await upsertSnapshotSource(db, 'snapshot', 'primary', 'release-primary', 'primary')
    await expect(recordSnapshotAssemblyRun(db, args)).rejects.toThrow(
      'selection rule is missing',
    )
    expect(sqlite.query('SELECT * FROM snapshotAssemblyRuns').all()).toHaveLength(0)
  } finally {
    sqlite.close()
  }
})
