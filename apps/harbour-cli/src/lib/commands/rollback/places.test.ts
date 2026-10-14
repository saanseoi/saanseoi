import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { historyDeletionRow } from '@repo/db'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb.ts'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { snapshotFixtureFields } from '../../../../../../libs/core/src/testing/snapshotFixtures'
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
  if (table === 'placesDivision' && row.definition !== undefined) {
    insert(db, 'placeDivisionDefinitions', {
      divisionSnapshotId: row.divisionSnapshotId,
      divisionId: row.divisionId,
      definition: row.definition,
    })
    delete row.definition
  }
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
      sourceReleaseId: `release-${snapshotId}`,
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
      meta: { isLocaleInferred: false },
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
    addressSnapshotId: 'a0',
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
    current.exec(
      'DELETE FROM placesCells; DELETE FROM placesDivision; DELETE FROM placesI18n; DELETE FROM places;',
    )
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

test('Place rollback reconstructs unjournaled Division definition changes and the original continuous-run pointer across shards', async () => {
  const f = await fixture()
  try {
    for (const [snapshot, pointer, level] of [
      ['p1', 'd0', 1],
      ['p2', 'd2', 2],
      ['p3', 'd3', 1],
    ] as const) {
      const before = f.old.query('SELECT total_changes() AS n').get()
      expect(await f.restore(snapshot)).toEqual({
        places: 1,
        divisionLinks: 1,
        cells: 3,
      })
      expect(
        f.current
          .query(
            "SELECT p.divisionSnapshotId,json_extract(d.definition,'$.level') AS level FROM placesDivision p JOIN placeDivisionDefinitions d USING(divisionSnapshotId,divisionId)",
          )
          .get(),
      ).toEqual({ divisionSnapshotId: pointer, level })
      expect(f.current.query('SELECT addressSnapshotId FROM places').get()).toEqual({
        addressSnapshotId: 'a0',
      })
      expect(
        f.current.query('SELECT COUNT(DISTINCT h3Level) AS n FROM placesCells').get(),
      ).toEqual({ n: 3 })
      expect(f.old.query('SELECT total_changes() AS n').get()).toEqual(before)
    }
    expect(f.recent.query('SELECT COUNT(*) AS n FROM places').get()).toEqual({ n: 0 })
  } finally {
    f.close()
  }
})

test('Place rollback clears empty predecessor companions and resets pointers when a removed link reappears', async () => {
  const f = await fixture()
  try {
    await f.restore('p3')
    f.snapshot('p4', 'place', 'p3', 'NEW')
    f.deleteEvent(f.recent, 'p4', 'place', 'place')
    f.deleteEvent(f.recent, 'p4', 'placeI18n', 'place', 'en')
    f.current.exec('DELETE FROM placesI18n; DELETE FROM places;')
    expect(await f.restore('p4')).toEqual({ places: 0, divisionLinks: 0, cells: 0 })
    expect(f.current.query('SELECT COUNT(*) AS n FROM placesDivision').get()).toEqual({
      n: 0,
    })
    f.snapshot('p5', 'place', 'p4', 'NEW')
    f.assembly('p5', 'place', { address: 'a1', division: 'd1' })
    f.history(f.recent, 'places', 'p5', 'place', 'place-new', {
      ...f.base,
      resourceReleaseId: 'release-p5',
    })
    f.history(
      f.recent,
      'placesI18n',
      'p5',
      'place',
      'locale-new',
      {
        name: 'Place',
        searchDependencyText: {
          addressSnapshotId: 'a1',
          addressText: 'House',
          streetText: 'Road',
          divisionText: 'County',
        },
      },
      'en',
    )
    f.hydrate(f.recent, 'place-new', 'locale-new')
    await f.restore('p5')
    expect(
      f.current.query('SELECT divisionSnapshotId FROM placesDivision').get(),
    ).toEqual({ divisionSnapshotId: 'd1' })
  } finally {
    f.close()
  }
})

test('Place rollback validates retained locale Address text against its original Place identity', async () => {
  const f = await fixture()
  try {
    f.deleteEvent(f.old, 'a1', 'address2d', 'building')
    f.deleteEvent(f.old, 'a1', 'address2dI18n', 'building', 'en')
    f.history(f.old, 'address2d', 'a1', 'replacement', 'replacement', {
      granularity: 'building',
      districtId: 'division',
    })
    f.history(
      f.old,
      'address2dI18n',
      'a1',
      'replacement',
      'replacement-name',
      { formattedAddress: 'House', streetName: 'Road' },
      'en',
    )
    const view = await PlaceDependencyView.create({
      metaDb: f.metaDb,
      historyTargets: f.historyTargets,
    })
    let hash: string | null
    try {
      await view.prepare('a1')
      hash = (
        await createPlaceSearchDependencies(view.db)({
          addressSnapshotId: 'a1',
          addressId: 'replacement',
          divisionSnapshotId: 'd1',
          divisionIds: [],
          locales: [],
        })
      ).addressDependencyHash
    } finally {
      await view.close()
    }
    f.history(f.old, 'places', 'p1', 'place', 'place-reidentified', {
      ...f.base,
      address2dId: 'replacement',
      addressSnapshotId: 'a1',
      addressDependencyHash: hash,
    })
    f.hydrate(f.old, 'place-reidentified', 'locale-old')
    expect(await f.restore('p1')).toEqual({ places: 1, divisionLinks: 1, cells: 3 })
    expect(
      f.current
        .query(
          "SELECT json_extract(searchDependencyText,'$.addressSnapshotId') AS pointer FROM placesI18n",
        )
        .get(),
    ).toEqual({ pointer: 'a0' })
  } finally {
    f.close()
  }
})

test.each([
  'hash',
  'definition',
  'assignment',
  'address-content',
  'assembly',
  'text',
] as const)(
  'Place rollback rejects missing %s dependency evidence before mutating derived rows',
  async failure => {
    const f = await fixture()
    try {
      await f.restore('p0')
      const before = f.current.query('SELECT total_changes() AS n').get() as {
        n: number
      }
      let currentChanges = 0
      if (failure === 'hash') {
        f.current.exec('UPDATE places SET addressDependencyHash=NULL')
        currentChanges++
      }
      if (failure === 'definition') f.old.exec('DELETE FROM divisions')
      if (failure === 'assignment')
        f.meta.exec("DELETE FROM snapshotShardAssignments WHERE snapshotId='d0'")
      if (failure === 'address-content') f.old.exec('DELETE FROM address2d')
      if (failure === 'assembly')
        f.meta.exec("DELETE FROM snapshotDependencies WHERE snapshotId='p0'")
      if (failure === 'text') {
        f.current.exec('UPDATE placesI18n SET searchDependencyText=NULL')
        currentChanges++
      }
      await expect(f.restore('p0')).rejects.toThrow()
      expect(f.current.query('SELECT total_changes() AS n').get()).toEqual({
        n: before.n + currentChanges,
      })
      expect(f.current.query('SELECT COUNT(*) AS n FROM placesCells').get()).toEqual({
        n: 3,
      })
    } finally {
      f.close()
    }
  },
)

test('Place rollback rebuilds address-free membership from the pinned geometry, not newer geometry', async () => {
  const f = await fixture()
  try {
    f.old.exec(
      'UPDATE places SET addressSnapshotId=NULL,addressDependencyHash=NULL,address2dId=NULL',
    )
    f.old.query('UPDATE placesI18n SET searchDependencyText=?').run(
      JSON.stringify({
        addressSnapshotId: null,
        addressText: '',
        streetText: '',
        divisionText: 'County',
      }),
    )
    const polygon = (offset: number) => ({
      type: 'Polygon',
      coordinates: [
        [
          [114 + offset, 22],
          [115 + offset, 22],
          [115 + offset, 23],
          [114 + offset, 23],
          [114 + offset, 22],
        ],
      ],
    })
    f.history(f.old, 'divisionAreas', 'areas', 'area', 'area-old', {
      divisionId: 'division',
      variant: 'saanseoi',
      type: 'land',
      geometry: polygon(0),
    })
    f.snapshot('areas-new', 'divisionArea', 'areas', 'NEW')
    f.history(f.recent, 'divisionAreas', 'areas-new', 'area', 'area-new', {
      divisionId: 'division',
      variant: 'saanseoi',
      type: 'land',
      geometry: polygon(5),
    })
    f.hydrate()
    expect(await f.restore('p0')).toEqual({ places: 1, divisionLinks: 1, cells: 3 })
    expect(f.current.query('SELECT divisionId FROM placesDivision').all()).toEqual([
      { divisionId: 'division' },
    ])
    expect(
      f.old
        .query("SELECT name FROM sqlite_schema WHERE name='sourceResolutions'")
        .all(),
    ).toEqual([])
    const before = f.current
      .query(
        'SELECT p.*,d.definition FROM placesDivision p JOIN placeDivisionDefinitions d USING(divisionSnapshotId,divisionId)',
      )
      .all()
    f.meta.exec(
      "DELETE FROM snapshotDependencies WHERE snapshotId='a0' AND role='divisionArea'",
    )
    await expect(f.restore('p0')).rejects.toThrow('DivisionArea dependency')
    expect(
      f.current
        .query(
          'SELECT p.*,d.definition FROM placesDivision p JOIN placeDivisionDefinitions d USING(divisionSnapshotId,divisionId)',
        )
        .all(),
    ).toEqual(before)
  } finally {
    f.close()
  }
})
