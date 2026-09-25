import {
  readSnapshotDependencies,
  recordSnapshotDependencies,
} from './snapshotDependencies'
import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../testing/localDb'
import { loadMigrationSql } from '../../testing/metaFixtures'
import {
  recordSnapshotAssembly,
  recordSnapshotLookupDependency,
  upsertSnapshotSource,
} from '../../lib/db/metaRegistry'
import { recordPlaceAddressAssembly } from '../services/places/placeAddressAssembly'
import { readSnapshotAssemblySql } from './snapshotAssembly'

const now = '2026-09-07T00:00:00.000Z'
function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), ['meta']),
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
      INSERT INTO resourceReleases (id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey, status, ingestedAt, createdAt, updatedAt)
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
  return sqlite.query('SELECT * FROM snapshotAssemblies').get() as {
    id: string
    snapshotRecipeId: string
    anchorReleaseId: string
    detailsJson: string
    status: string
    reviewRequired: number | null
  }
}

test('fresh ingestion records all inputs, refreshes one draft assembly and replays its complete foreign-key closure', async () => {
  const local = fixture()
  const target = fixture()
  try {
    await source(local.db, 'primary')
    await recordSnapshotAssembly(local.db, {
      ...args,
      detailsJson: { materialisationHash: 'retained' },
    })
    const first = run(local.sqlite)
    await source(local.db, 'enrichment')
    await source(local.db, 'lookup')
    await recordSnapshotAssembly(local.db, {
      ...args,
      anchorReleaseId: 'release-enrichment',
    })
    const final = run(local.sqlite)
    expect(final.id).toBe(first.id)
    expect(final.snapshotRecipeId).not.toBe(first.snapshotRecipeId)
    expect(final.anchorReleaseId).toBe('release-primary')
    expect(JSON.parse(final.detailsJson).materialisationHash).toBe('retained')
    expect(JSON.parse(final.detailsJson).sources).toBeUndefined()
    expect(
      local.sqlite.query('SELECT * FROM snapshotSourceReleases').all(),
    ).toHaveLength(3)
    expect(local.sqlite.query('SELECT * FROM snapshotAssemblies').all()).toHaveLength(1)
    expect(
      local.sqlite
        .query('SELECT * FROM snapshotRecipeInputs WHERE snapshotRecipeId = ?')
        .all(final.snapshotRecipeId),
    ).toHaveLength(3)
    await recordSnapshotAssembly(local.db, args)
    expect(run(local.sqlite).snapshotRecipeId).toBe(final.snapshotRecipeId)
    const sql = (await readSnapshotAssemblySql(local.db, 'snapshot', true)).join('\n')
    target.sqlite.exec(sql)
    const changes = target.sqlite.query('SELECT total_changes() AS count').get()
    target.sqlite.exec(sql)
    expect(target.sqlite.query('SELECT total_changes() AS count').get()).toEqual(
      changes,
    )
    expect(run(target.sqlite).detailsJson).toBe(final.detailsJson)
    expect(target.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(
      target.sqlite.query('SELECT * FROM snapshotRecipeInputs').all(),
    ).toHaveLength(3)
    local.sqlite.exec(
      "UPDATE snapshotAssemblies SET anchorReleaseId=NULL,status='planning'",
    )
    const changedSql = (await readSnapshotAssemblySql(local.db, 'snapshot', true)).join(
      '\n',
    )
    target.sqlite.exec(changedSql)
    expect(run(target.sqlite).anchorReleaseId).toBeNull()
    expect(run(target.sqlite).status).toBe('planning')
    const changedCount = target.sqlite.query('SELECT total_changes() AS count').get()
    target.sqlite.exec(changedSql)
    expect(target.sqlite.query('SELECT total_changes() AS count').get()).toEqual(
      changedCount,
    )
  } finally {
    local.sqlite.close()
    target.sqlite.close()
  }
})

test('published assembly evidence remains fixed when a later release verifies the same geometry', async () => {
  const { db, sqlite } = fixture()
  try {
    await source(db, 'primary')
    await recordSnapshotAssembly(db, args)
    const before = run(sqlite)
    sqlite.exec("UPDATE snapshots SET status = 'published'")
    await source(db, 'enrichment')
    await recordSnapshotAssembly(db, args)
    expect(run(sqlite)).toEqual(before)
  } finally {
    sqlite.close()
  }
})

test('Places planning and finalisation retain review evidence in the same assembly', async () => {
  const { db, sqlite } = fixture()
  try {
    sqlite.exec(
      "INSERT INTO snapshots(id,code,resourceType,cohortKey,status) VALUES ('als','als','address','2026','published')",
    )
    await recordPlaceAddressAssembly(db, {
      ...args,
      dependencies: { address: 'als' },
      reviewRequired: 2,
    })
    expect(run(sqlite).status).toBe('planning')
    await source(db, 'primary')
    await recordPlaceAddressAssembly(db, {
      ...args,
      reviewRequired: 0,
      detailsJson: { materialisationHash: 'hash' },
    })
    expect(run(sqlite).status).toBe('selected')
    expect(run(sqlite).reviewRequired).toBe(0)
    expect(await readSnapshotDependencies(db, 'snapshot')).toEqual({ address: 'als' })
    expect(JSON.parse(run(sqlite).detailsJson)).toMatchObject({
      materialisationHash: 'hash',
    })
    expect(sqlite.query('SELECT * FROM snapshotAssemblies').all()).toHaveLength(1)
  } finally {
    sqlite.close()
  }
})

test('lookup assembly retains exact revisions and merges independently selected dependency families', async () => {
  const { db, sqlite } = fixture()
  try {
    await source(db, 'primary')
    sqlite.exec(
      "INSERT INTO snapshots(id,code,resourceType,cohortKey,status) VALUES ('street-revision','street-revision','street','2026','published')",
    )
    await recordSnapshotAssembly(db, {
      ...args,
      dependencies: { street: 'street-revision' },
    })
    sqlite.exec(`INSERT INTO snapshots (id,code,resourceType,cohortKey,status,createdAt,updatedAt)
      VALUES ('division-revision','division-revision','division','2026','published','${now}','${now}');`)
    await upsertSnapshotSource(
      db,
      'division-revision',
      'lookup',
      'release-lookup',
      'primary',
      {
        selectedByRule: 'division',
        selectionMode: 'exact_ref',
        sourceCohortKey: '2026',
      },
    )
    await recordSnapshotLookupDependency(db, {
      snapshotId: 'snapshot',
      lookupSnapshotId: 'division-revision',
      anchorReleaseId: 'release-primary',
      selectedByRule: 'address-division',
      selectionMode: 'exact_ref',
    })
    expect(await readSnapshotDependencies(db, 'snapshot')).toEqual({
      street: 'street-revision',
      division: 'division-revision',
    })
    await recordSnapshotAssembly(db, args)
    expect((await readSnapshotDependencies(db, 'snapshot')).division).toBe(
      'division-revision',
    )
  } finally {
    sqlite.close()
  }
})

test('missing selection rules fail explicitly instead of recording invented provenance', async () => {
  const { db, sqlite } = fixture()
  try {
    await upsertSnapshotSource(db, 'snapshot', 'primary', 'release-primary', 'primary')
    await expect(recordSnapshotAssembly(db, args)).rejects.toThrow(
      'selection rule is missing',
    )
    expect(sqlite.query('SELECT * FROM snapshotAssemblies').all()).toHaveLength(0)
    await expect(readSnapshotAssemblySql(db, 'snapshot', true)).rejects.toThrow(
      'assembly run is missing',
    )
  } finally {
    sqlite.close()
  }
})

test('dependency roles are unique, replay exactly, and protect published inputs', async () => {
  const local = fixture()
  const target = fixture()
  try {
    for (const { sqlite } of [local, target])
      sqlite.exec(`INSERT INTO snapshots(id,code,resourceType,cohortKey,status)
        VALUES ('old','old','division','2025','published'),('new','new','division','2026','published');`)
    await source(local.db, 'primary')
    await recordSnapshotAssembly(local.db, {
      ...args,
      dependencies: { division: 'old' },
    })
    const recipe = run(local.sqlite).snapshotRecipeId
    await recordSnapshotAssembly(local.db, {
      ...args,
      dependencies: { division: 'new' },
    })
    expect(run(local.sqlite).snapshotRecipeId).toBe(recipe)
    expect(await readSnapshotDependencies(local.db, 'snapshot')).toEqual({
      division: 'new',
    })
    const sql = (await readSnapshotAssemblySql(local.db, 'snapshot', true)).join('\n')
    target.sqlite.exec(sql)
    const before = target.sqlite.query('SELECT total_changes() AS count').get()
    target.sqlite.exec(sql)
    expect(target.sqlite.query('SELECT total_changes() AS count').get()).toEqual(before)
    expect(await readSnapshotDependencies(target.db, 'snapshot')).toEqual({
      division: 'new',
    })
    expect(() =>
      target.sqlite.query("DELETE FROM snapshots WHERE id='new'").run(),
    ).toThrow()
    local.sqlite.exec("UPDATE snapshots SET status='published' WHERE id='snapshot'")
    await expect(
      recordSnapshotDependencies(local.db, 'snapshot', { division: 'old' }),
    ).rejects.toThrow('published snapshot')
    expect(await readSnapshotDependencies(local.db, 'snapshot')).toEqual({
      division: 'new',
    })
    target.sqlite.query("DELETE FROM snapshots WHERE id='snapshot'").run()
    expect(await readSnapshotDependencies(target.db, 'snapshot')).toEqual({})
    expect(target.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    local.sqlite.close()
    target.sqlite.close()
  }
})
