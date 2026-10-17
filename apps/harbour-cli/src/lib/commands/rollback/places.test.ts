import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { historyDeletionRow } from '@repo/db'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb.ts'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import {
  snapshotFixtureFields,
  insertSnapshotProducerFixture,
} from '../../../../../../libs/core/src/testing/snapshotFixtures'
import { PlaceDependencyView } from '../../pipeline/places/placeDependencyView.ts'
import { createPlaceSearchDependencies } from '../../pipeline/places/placeSearchDependencies.ts'
import { restorePlaceDerivedRows } from './places.ts'

function open(family: string) {
  const db = new Database(':memory:')
  db.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../../libs/db/migrations'), [
      family,
    ]),
  )
  return db
}
function insert(db: Database, table: string, row: Record<string, unknown>) {
  if (table === 'snapshots') row = snapshotFixtureFields(db, row)

  row = { ...row }
  const fixtureColumns = new Set(
    db
      .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
      .all()
      .map(column => column.name),
  )
  if (
    fixtureColumns.has('scopeId') &&
    !fixtureColumns.has('snapshotId') &&
    'snapshotId' in row
  ) {
    row.scopeId ??= row.snapshotId
    delete row.snapshotId
  }
  if (!fixtureColumns.has('updatedAt')) delete row.updatedAt
  if (!fixtureColumns.has('lastSeenMonth')) delete row.lastSeenMonth

  const columns = Object.keys(row)
  db.query(
    `INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
  ).run(
    ...(Object.values(row).map(value =>
      value != null && typeof value === 'object' ? JSON.stringify(value) : value,
    ) as never[]),
  )
}

async function fixture() {
  const meta = open('meta')
  const old = open('history')
  const recent = open('history')
  const current = open('current')
  const metaDb = createLocalHarbourDb(meta)
  const historyTargets = [
    { bindingName: 'OLD', db: createLocalHarbourDb(old) },
    { bindingName: 'NEW', db: createLocalHarbourDb(recent) },
  ]
  for (const binding of ['OLD', 'NEW'])
    insert(meta, 'dataShards', {
      id: binding,
      bindingName: binding,
      shardType: 'history',
      regionCode: 'hk',
      year: binding === 'OLD' ? '2025' : '2026',
      environment: 'preview',
      databaseName: binding,
      databaseId: binding,
      status: 'active',
      versionHash: binding,
    })
  const snapshot = (
    id: string,
    resourceType: string,
    parent: string | null,
    shard = 'OLD',
  ) => {
    insert(meta, 'snapshots', {
      id,
      code: id,
      resourceType,
      parentSnapshotId: parent,
      cohortKey: '2026',
      status: 'published',
    })
    insertSnapshotProducerFixture(meta, id, `release-${id}`)
    insert(meta, 'snapshotShardAssignments', { snapshotId: id, dataShardId: shard })
  }
  const assembly = (id: string, kind: string, selection: Record<string, unknown>) => {
    insert(meta, 'snapshotRecipes', {
      id,
      code: id,
      resourceType: kind,
      version: 1,
      versionHash: id,
    })
    insert(meta, 'snapshotAssemblies', {
      id,
      snapshotId: id,
      snapshotRecipeId: id,
    })
    for (const [role, dependencySnapshotId] of Object.entries(selection))
      insert(meta, 'snapshotDependencies', {
        snapshotId: id,
        role,
        dependencySnapshotId,
      })
  }
  const deleteEvent = (
    db: Database,
    snapshotId: string,
    recordType: string,
    recordId: string,
    locale = '',
  ) => {
    const { table, row } = historyDeletionRow({
      snapshotId,
      recordType,
      recordId,
      locale,
    })
    insert(db, table, row)
  }
  const history = (
    db: Database,
    table: string,
    snapshotId: string,
    id: string,
    hash: string,
    values: Record<string, unknown>,
    locale = '',
  ) => {
    const idColumn =
      table === 'divisionsI18n'
        ? 'divisionId'
        : table === 'address2dI18n'
          ? 'addressId'
          : table === 'placesI18n'
            ? 'placeId'
            : 'id'
    insert(db, table, {
      [idColumn]: id,
      snapshotId,
      versionHash: hash,
      isCurrent: 1,
      ...values,
      ...(locale ? { locale } : {}),
    })
  }
  snapshot('areas', 'divisionArea', null, 'OLD')
  for (let i = 0; i < 4; i++) {
    const shard = i < 2 ? 'OLD' : 'NEW'
    snapshot(`d${i}`, 'division', i ? `d${i - 1}` : null, shard)
    snapshot(`a${i}`, 'address', i ? `a${i - 1}` : null, shard)
    snapshot(`p${i}`, 'place', i ? `p${i - 1}` : null, shard)
    assembly(`a${i}`, 'address', { division: `d${i}`, divisionArea: 'areas' })
    assembly(`p${i}`, 'place', { address: `a${i}`, division: `d${i}` })
  }
  history(old, 'divisions', 'd0', 'division', 'division-old', {
    class: 'district',
    level: 1,
    hierarchies: [],
  })
  history(
    old,
    'divisionsI18n',
    'd0',
    'division',
    'division-name',
    {
      name: 'County',
      meta: null,
    },
    'en',
  )
  history(recent, 'divisions', 'd2', 'division', 'division-changed', {
    class: 'district',
    level: 2,
    hierarchies: [],
  })
  history(recent, 'divisions', 'd3', 'division', 'division-reverted', {
    class: 'district',
    level: 1,
    hierarchies: [],
  })
  history(old, 'address2d', 'a0', 'building', 'building-old', {
    granularity: 'building',
    districtId: 'division',
  })
  history(
    old,
    'address2dI18n',
    'a0',
    'building',
    'address-name',
    { formattedAddress: 'House', streetName: 'Road' },
    'en',
  )
  const dependency = await PlaceDependencyView.create({ metaDb, historyTargets })
  let addressDependencyHash: string | null
  try {
    await dependency.prepare('a0')
    addressDependencyHash = (
      await createPlaceSearchDependencies(dependency.db)({
        addressSnapshotId: 'a0',
        addressId: 'building',
        divisionSnapshotId: 'd0',
        divisionIds: [],
        locales: [],
      })
    ).addressDependencyHash
  } finally {
    await dependency.close()
  }
  const base = {
    resourceReleaseId: 'release-p0',
    geometry: { type: 'Point', coordinates: [114.1, 22.3] },
    addressRole: 'address',
    districtId: 'division',
    addressDependencyHash,
    address2dId: 'building',
    firstSeenMonth: '2025-01',
    lastSeenMonth: '2025-01',
  }
  history(old, 'places', 'p0', 'place', 'place-old', base)
  history(
    old,
    'placesI18n',
    'p0',
    'place',
    'locale-old',
    {
      name: 'Place',
      searchDependencyText: {
        addressSnapshotId: 'a0',
        addressText: 'House',
        streetText: 'Road',
        divisionText: 'County',
      },
    },
    'en',
  )
  const hydrate = (db = old, baseHash = 'place-old', localeHash = 'locale-old') => {
    current.exec('DELETE FROM placesCells; DELETE FROM placesI18n; DELETE FROM places;')
    for (const [table, hash] of [
      ['places', baseHash],
      ['placesI18n', localeHash],
    ] as const) {
      const row = db
        .query(`SELECT * FROM ${table} WHERE versionHash=?`)
        .get(hash) as Record<string, unknown>
      const columns = new Set(
        (current.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
          row => row.name,
        ),
      )
      insert(current, table, {
        ...Object.fromEntries(
          Object.entries(row).filter(([name]) => columns.has(name)),
        ),
        snapshotId: 'place-scope',
      })
    }
  }
  hydrate()
  const restore = (snapshotId: string) =>
    restorePlaceDerivedRows({
      current,
      metaDb,
      historyTargets,
      snapshotId,
      scopeId: 'place-scope',
    })
  return {
    meta,
    old,
    recent,
    current,
    metaDb,
    historyTargets,
    base,
    snapshot,
    assembly,
    deleteEvent,
    history,
    hydrate,
    restore,
    close() {
      meta.close()
      old.close()
      recent.close()
      current.close()
    },
  }
}

test('Place rollback resolves all Divisions at its publication revision across inherited history', async () => {
  const f = await fixture()
  try {
    const { replayPlaceDivisionDefinitions } = await import(
      '@repo/core/pipeline/services/places/dependencyReplay'
    )
    const shards = new Map(f.historyTargets.map(t => [t.bindingName, t]))
    for (const [snapshot, division, level] of [
      ['p1', 'd1', 1],
      ['p2', 'd2', 2],
      ['p3', 'd3', 1],
    ] as const) {
      expect(await f.restore(snapshot)).toEqual({
        places: 1,
        divisionLinks: 1,
        cells: 3,
      })
      const definitions = await replayPlaceDivisionDefinitions(
        f.metaDb,
        shards,
        division,
        ['division'],
      )
      expect(definitions.division).toMatchObject({
        divisionSnapshotId: division,
        level,
      })
      expect(
        f.current.query('SELECT addressRole,districtId FROM places').get(),
      ).toEqual({ addressRole: 'address', districtId: 'division' })
    }
    expect(f.recent.query('SELECT count(*) n FROM places').get()).toEqual({ n: 0 })
  } finally {
    f.close()
  }
})

test.each(['assembly', 'definition', 'address-content', 'text', 'membership'])(
  'Place rollback rejects missing or inconsistent %s before writing derived rows',
  async fault => {
    const f = await fixture()
    try {
      await f.restore('p0')
      const before = f.current.query('SELECT * FROM placesCells').all()
      if (fault === 'assembly')
        f.meta.exec("DELETE FROM snapshotDependencies WHERE snapshotId='p0'")
      if (fault === 'definition') f.old.exec('DELETE FROM divisions')
      if (fault === 'address-content')
        f.old.exec("UPDATE address2dI18n SET formattedAddress='Changed'")
      if (fault === 'text')
        f.current.exec("UPDATE placesI18n SET searchDependencyText='{}'")
      if (fault === 'membership')
        f.current.exec("UPDATE places SET districtId='missing'")
      await expect(f.restore('p0')).rejects.toThrow()
      expect(f.current.query('SELECT * FROM placesCells').all()).toEqual(before)
    } finally {
      f.close()
    }
  },
)

test('empty Place publication restores an empty index with its exact dependencies', async () => {
  const f = await fixture()
  try {
    await f.restore('p3')
    f.snapshot('p4', 'place', 'p3', 'NEW')
    f.assembly('p4', 'place', { address: 'a3', division: 'd3' })
    f.deleteEvent(f.recent, 'p4', 'place', 'place')
    f.deleteEvent(f.recent, 'p4', 'placeI18n', 'place', 'en')
    f.current.exec('DELETE FROM placesI18n; DELETE FROM places;')
    expect(await f.restore('p4')).toEqual({ places: 0, divisionLinks: 0, cells: 0 })
  } finally {
    f.close()
  }
})
