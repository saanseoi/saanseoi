import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb.ts'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
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
    insert(meta, 'snapshotAssembly', {
      id,
      code: id,
      resourceType: kind,
      version: 1,
      status: 'scoped',
      versionHash: id,
    })
    insert(meta, 'snapshotAssemblyRuns', {
      id,
      snapshotId: id,
      snapshotAssemblyId: id,
      status: 'selected',
      selectionSummaryJson: { lookupSnapshotIds: selection },
    })
  }
  const journal = (
    db: Database,
    snapshotId: string,
    recordType: string,
    recordId: string,
    hash: string | null,
    locale = '',
  ) =>
    insert(db, 'snapshotVersionChanges', {
      snapshotId,
      recordType,
      recordId,
      locale,
      versionHash: hash,
      operation: hash ? 'upsert' : 'delete',
      sourceReleaseId: `release-${snapshotId}`,
    })
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
    const type =
      (
        {
          divisions: 'division',
          divisionsI18n: 'divisionI18n',
          places: 'place',
          placesI18n: 'placeI18n',
        } as Record<string, string>
      )[table] ?? table
    journal(db, snapshotId, type, id, hash, locale)
  }
  const interpretation = (
    db: Database,
    snapshotId: string,
    entities: Record<string, string[]>,
  ) =>
    insert(db, 'sourceResolutions', {
      scopeId: `snapshot:${snapshotId}`,
      snapshotId,
      sourceReleaseId: `release-${snapshotId}`,
      sourceRecordId: 'place',
      sourceVersionHash: `source-${snapshotId}`,
      resolutions: {
        entities,
        ...(!Object.keys(entities).length
          ? { decisions: [{ type: 'source_omission' }] }
          : {}),
      },
    })
  for (let i = 0; i < 4; i++) {
    const shard = i < 2 ? 'OLD' : 'NEW'
    snapshot(`d${i}`, 'division', i ? `d${i - 1}` : null, shard)
    snapshot(`a${i}`, 'address', i ? `a${i - 1}` : null, shard)
    snapshot(`p${i}`, 'place', i ? `p${i - 1}` : null, shard)
    assembly(`a${i}`, 'address', { division: `d${i}` })
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
    { name: 'County', isLocaleInferred: 0 },
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
    releaseId: 'release-p0',
    lng: 114.1,
    lat: 22.3,
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
  interpretation(old, 'p0', {
    place: ['place'],
    address2d: ['building'],
    division: ['division'],
  })
  const hydrate = (db = old, baseHash = 'place-old', localeHash = 'locale-old') => {
    current.exec(
      'DELETE FROM placesCells; DELETE FROM placesDivision; DELETE FROM placesI18n; DELETE FROM places;',
    )
    for (const [table, hash] of [
      ['places', baseHash],
      ['placesI18n', localeHash],
    ]) {
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
    journal,
    history,
    interpretation,
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
            "SELECT divisionSnapshotId,json_extract(definition,'$.level') AS level FROM placesDivision",
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
    expect(f.recent.query('SELECT COUNT(*) AS n FROM sourceResolutions').get()).toEqual(
      { n: 0 },
    )
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
    f.journal(f.recent, 'p4', 'place', 'place', null)
    f.journal(f.recent, 'p4', 'placeI18n', 'place', null, 'en')
    f.interpretation(f.recent, 'p4', {})
    f.current.exec('DELETE FROM placesI18n; DELETE FROM places;')
    expect(await f.restore('p4')).toEqual({ places: 0, divisionLinks: 0, cells: 0 })
    expect(f.current.query('SELECT COUNT(*) AS n FROM placesDivision').get()).toEqual({
      n: 0,
    })
    f.snapshot('p5', 'place', 'p4', 'NEW')
    f.assembly('p5', 'place', { address: 'a1', division: 'd1' })
    f.history(f.recent, 'places', 'p5', 'place', 'place-new', {
      ...f.base,
      releaseId: 'release-p5',
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
    f.interpretation(f.recent, 'p5', {
      place: ['place'],
      address2d: ['building'],
      division: ['division'],
    })
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
    f.journal(f.old, 'a1', 'address2d', 'building', null)
    f.journal(f.old, 'a1', 'address2dI18n', 'building', null, 'en')
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
    f.interpretation(f.old, 'p1', {
      place: ['place'],
      address2d: ['replacement'],
      division: ['division'],
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

test.each(['hash', 'definition', 'assembly', 'source', 'text'] as const)(
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
      if (failure === 'assembly')
        f.meta.exec("DELETE FROM snapshotAssemblyRuns WHERE snapshotId='p0'")
      if (failure === 'source') f.old.exec('DELETE FROM sourceResolutions')
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
