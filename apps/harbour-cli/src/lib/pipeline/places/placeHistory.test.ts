import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  hashPlaceMaterialisation,
  normaliseOverturePlace,
} from '@repo/core/pipeline/services/places/place'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
} from '@repo/core/pipeline/db/snapshotReplay'
import { resolveSnapshotSourceResolutions } from '@repo/core/pipeline/db/sourceResolutionReplay'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import {
  buildPlaceSql,
  loadCurrentPlaceHistory,
  loadCurrentPlaceSources,
} from './processLocalPlaceSqlUploadRows.ts'
import type {
  BuildPlaceSqlInput,
  EnrichedPlace,
} from './processLocalPlaceSqlUploadTypes.ts'

function getDatabase(databases: Map<string, Database>, binding: string): Database {
  const database = databases.get(binding)
  if (!database) throw new Error(`Missing test database: ${binding}`)
  return database
}

function fixture() {
  const databases = new Map<string, Database>()
  for (const [binding, family] of [
    ['current', 'current'],
    ['old', 'history'],
    ['new', 'history'],
    ['source', 'source'],
    ['source-next', 'source'],
  ] as const) {
    const db = new Database(':memory:')
    db.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        family,
      ]),
    )
    databases.set(binding, db)
  }
  const current = getDatabase(databases, 'current')
  const historyTargets = ['old', 'new'].map(bindingName => ({
    bindingName,
    db: drizzle({ client: getDatabase(databases, bindingName) }),
  })) as unknown as Parameters<typeof loadCurrentPlaceHistory>[0]
  const sourceTargets = ['source', 'source-next'].map(bindingName => ({
    bindingName,
    db: drizzle({ client: getDatabase(databases, bindingName) }),
  })) as unknown as Parameters<typeof loadCurrentPlaceSources>[0]
  const shards = new Map(
    historyTargets.map(target => [
      target.bindingName,
      { bindingName: target.bindingName, db: target.db },
    ]),
  ) as Map<string, ReplayShard>
  const plan: SnapshotReplayStep[] = []
  let revision = 0
  async function run(
    places: EnrichedPlace[],
    binding = 'old',
    source = 'source',
    divisionSnapshotId = 'division-a',
  ) {
    const snapshotId = `revision-${++revision}`
    const input: BuildPlaceSqlInput = {
      activeHistoryBindingName: binding,
      activeSourceBindingName: source,
      sourceBindingNames: ['source', 'source-next'],
      sourceRows: await loadCurrentPlaceSources(sourceTargets),
      sourceResolutions: await resolveSnapshotSourceResolutions(plan, shards),
      historyRows: await loadCurrentPlaceHistory(historyTargets, {
        currentDb: drizzle({ client: current }) as never,
        scopeId: 'scope',
        replayPlan: plan,
      }),
      datasetId: 'dataset',
      message: {
        releaseId: snapshotId,
        sourceVersion: snapshotId,
      } as BuildPlaceSqlInput['message'],
      snapshots: {
        snapshotId,
        snapshotLineageId: 'scope',
        addressSnapshotId: 'address',
        divisionSnapshotId,
      },
      places,
    }
    const sql = await buildPlaceSql(input, { timestamp: snapshotId })
    current.exec(sql.currentSql.join('\n'))
    for (const [name, statements] of sql.historySqlByBinding)
      getDatabase(databases, name).exec(statements.join('\n'))
    for (const [name, statements] of sql.sourceSqlByBinding)
      getDatabase(databases, name).exec(statements.join('\n'))
    if (sql.changes.length) getDatabase(databases, binding).exec(sql.changes.join('\n'))
    plan.push({
      snapshotId,
      parentSnapshotId: plan.at(-1)?.snapshotId ?? null,
      shards: [{ dataShardId: binding, bindingName: binding }],
    })
    return sql
  }
  return {
    databases,
    current,
    historyTargets,
    shards,
    plan,
    run,
    close: () => {
      for (const db of databases.values()) db.close()
    },
  }
}

async function place(): Promise<EnrichedPlace> {
  const place = normaliseOverturePlace(
    {
      id: 'place',
      geometry: { type: 'Point', coordinates: [114, 22] },
      names: { en: 'Original', 'zh-Hant': '原文' },
    },
    '2025-01',
  )
  if (!place) throw new Error('Place fixture normalisation failed')
  return {
    place,
    address2dId: null,
    address3dId: null,
    divisionIds: [],
    sourcePayloadHash: 'source',
    versionHash: await hashPlaceMaterialisation(place, {
      addressId: null,
      addressSnapshotId: 'address',
      divisionSnapshotId: 'division',
      divisionIds: [],
    }),
  }
}

test('Places inherit independent base, locales and source resolutions across years and close each owning shard', async () => {
  const f = fixture()
  try {
    const row = await place()
    await f.run([row])
    row.place.lastSeenMonth = '2025-02'
    row.place.sources = { overture: ['new release assertion'] }
    const repeated = await f.run([row])
    expect(repeated.historySqlByBinding.size).toBe(0)
    expect(repeated.sourceSqlByBinding.size).toBe(0)
    expect(repeated.changes).toEqual([])
    const before = f.current.query('SELECT sources FROM places').get()
    expect(before).not.toEqual({ sources: JSON.stringify(row.place.sources) })

    const english = row.place.i18n.find(locale => locale.locale === 'en')
    if (!english) throw new Error('English place locale missing')
    english.name = 'Updated English'
    const localeOnly = await f.run([row], 'new', 'source-next')
    expect(localeOnly.changes.join('')).toContain('placeI18n')
    expect(
      getDatabase(f.databases, 'new')
        .query(
          "SELECT recordType FROM snapshotVersionChanges WHERE snapshotId='revision-3'",
        )
        .all(),
    ).toEqual([{ recordType: 'placeI18n' }])
    expect(localeOnly.historySqlByBinding.get('old')?.join('')).not.toContain(
      'UPDATE places SET',
    )
    const old = getDatabase(f.databases, 'old'),
      next = getDatabase(f.databases, 'new')
    expect(old.query('SELECT isCurrent FROM places').get()).toEqual({ isCurrent: 1 })
    expect(next.query('SELECT count(*) AS n FROM places').get()).toEqual({ n: 0 })
    expect(next.query('SELECT locale FROM placesI18n').all()).toEqual([
      { locale: 'en' },
    ])
    expect(next.query('SELECT count(*) AS n FROM sourceResolutions').get()).toEqual({
      n: 0,
    })
    const inherited = await resolveSnapshotVersionState(f.plan, f.shards, [
      'place',
      'placeI18n',
    ])
    expect(
      [...inherited.values()]
        .map(version => [version.recordType, version.locale, version.shard.bindingName])
        .sort(),
    ).toEqual([
      ['place', '', 'old'],
      ['placeI18n', 'en', 'new'],
      ['placeI18n', 'zh-hant', 'old'],
    ])
    expect(
      (await resolveSnapshotSourceResolutions(f.plan, f.shards)).get('place')?.shard
        .bindingName,
    ).toBe('old')

    row.place.i18n = row.place.i18n.filter(locale => locale.locale === 'en')
    await f.run([row], 'new', 'source-next')
    expect(
      old.query("SELECT isCurrent FROM placesI18n WHERE locale='zh-hant'").get(),
    ).toEqual({ isCurrent: 0 })
    const states = await loadCurrentPlaceHistory(f.historyTargets, {
      currentDb: drizzle({ client: f.current }) as never,
      scopeId: 'scope',
      replayPlan: f.plan,
    })
    expect(states[0]?.locales?.map(locale => locale.bindingName)).toEqual(['new'])

    await f.run([], 'new', 'source-next')
    expect(
      await resolveSnapshotVersionState(f.plan, f.shards, ['place', 'placeI18n']),
    ).toEqual(new Map())
    expect(old.query('SELECT isCurrent FROM places').get()).toEqual({ isCurrent: 0 })
    expect(next.query('SELECT isCurrent FROM placesI18n').get()).toEqual({
      isCurrent: 0,
    })
    expect(
      (await resolveSnapshotSourceResolutions(f.plan, f.shards)).get('place')
        ?.resolutions,
    ).toEqual({ entities: {}, decisions: [{ type: 'source_omission' }] })
    expect((await f.run([], 'new', 'source-next')).historySqlByBinding.size).toBe(0)
  } finally {
    f.close()
  }
})

test('Places preserve exact dependency pointers on unchanged content and isolate locale dependency changes', async () => {
  const f = fixture()
  try {
    const row = await place()
    row.address2dId = 'building'
    row.addressSnapshotId = 'address-a'
    row.addressDependencyHash = 'same-building'
    row.searchDependencies = {
      en: {
        addressSnapshotId: 'address-a',
        addressText: 'Original building',
        divisionText: '',
        streetText: '',
      },
    }
    await f.run([row])
    row.addressSnapshotId = 'address-b'
    if (!row.searchDependencies.en) throw new Error('English dependencies missing')
    row.searchDependencies.en.addressSnapshotId = 'address-b'
    const same = await f.run([row])
    expect(same.historySqlByBinding.size).toBe(0)
    expect(f.current.query('SELECT addressSnapshotId FROM places').get()).toEqual({
      addressSnapshotId: 'address-a',
    })
    expect(
      f.current
        .query(
          "SELECT json_extract(searchDependencyText,'$.addressSnapshotId') AS revision FROM placesI18n WHERE locale='en'",
        )
        .get(),
    ).toEqual({ revision: 'address-a' })
    row.searchDependencies.en.divisionText = 'Revised Division translation'
    const revised = await f.run([row], 'new')
    expect(revised.changes.join('')).toContain('placeI18n')
    expect(
      getDatabase(f.databases, 'new')
        .query(
          "SELECT recordType FROM snapshotVersionChanges WHERE snapshotId='revision-3'",
        )
        .all(),
    ).toEqual([{ recordType: 'placeI18n' }])
    expect(
      f.current
        .query(
          "SELECT json_extract(searchDependencyText,'$.addressSnapshotId') AS revision FROM placesI18n WHERE locale='en'",
        )
        .get(),
    ).toEqual({ revision: 'address-b' })
    expect(f.current.query('SELECT addressSnapshotId FROM places').get()).toEqual({
      addressSnapshotId: 'address-a',
    })
  } finally {
    f.close()
  }
})

test('base edits retain locale versions and retirement excludes another current scope', async () => {
  const f = fixture()
  try {
    const row = await place()
    await f.run([row])
    const old = getDatabase(f.databases, 'old')
    f.current.exec(
      "INSERT INTO places(snapshotId,id,releaseId,lng,lat,firstSeenMonth,lastSeenMonth,createdAt,updatedAt) VALUES('another-scope','foreign','foreign',114,22,'2025','2025','original','original')",
    )
    old.exec(
      "INSERT INTO places(id,releaseId,lng,lat,firstSeenMonth,lastSeenMonth,versionHash,sourceReleaseId,snapshotId,isCurrent,createdAt,updatedAt) VALUES('foreign','foreign',114,22,'2025','2025','foreign','foreign','foreign',1,'original','original')",
    )
    row.place.operatingStatus = 'temporarily_closed'
    row.versionHash = await hashPlaceMaterialisation(row.place, {
      addressSnapshotId: 'address',
      divisionSnapshotId: 'division',
      addressId: null,
      divisionIds: [],
    })
    const changed = await f.run([row], 'new')
    expect(changed.changes.join('')).not.toContain('placeI18n')
    expect(
      old.query('SELECT count(*) AS n FROM placesI18n WHERE isCurrent=1').get(),
    ).toEqual({ n: 2 })
    expect(
      getDatabase(f.databases, 'new')
        .query('SELECT count(*) AS n FROM placesI18n')
        .get(),
    ).toEqual({ n: 0 })
    await f.run([], 'new')
    expect(old.query("SELECT isCurrent FROM places WHERE id='foreign'").get()).toEqual({
      isCurrent: 1,
    })
    expect(f.current.query('SELECT id,snapshotId FROM places').all()).toEqual([
      { id: 'foreign', snapshotId: 'another-scope' },
    ])
  } finally {
    f.close()
  }
})

test('Places retain historical Division definitions and only update links when their contents change', async () => {
  const f = fixture()
  try {
    const row = await place()
    row.divisionIds = ['district']
    row.divisionDefinitions = {
      district: {
        level: 3,
        locales: [
          { locale: 'en', name: 'Original district' },
          { locale: 'zh-hant', name: '原文' },
        ],
      },
    }
    f.current.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE divisionLinkWrites(operation TEXT); CREATE TRIGGER divisionLinkUpdated AFTER UPDATE ON placesDivision BEGIN INSERT INTO divisionLinkWrites VALUES('update'); END; CREATE TRIGGER divisionLinkDeleted AFTER DELETE ON placesDivision BEGIN INSERT INTO divisionLinkWrites VALUES('delete'); END",
    )
    // No current Division row or publication receipt exists for this exact old revision.
    await f.run([row])
    const district = row.divisionDefinitions.district
    if (!district) throw new Error('District definition missing')
    district.locales.reverse()
    const same = await f.run([row], 'old', 'source', 'division-b')
    expect(same.historySqlByBinding.size).toBe(0)
    expect(
      f.current.query('SELECT divisionSnapshotId FROM placesDivision').get(),
    ).toEqual({ divisionSnapshotId: 'division-a' })
    expect(f.current.query('SELECT * FROM divisionLinkWrites').all()).toEqual([])
    const revisedDistrict = district.locales.find(locale => locale.locale === 'en')
    if (!revisedDistrict) throw new Error('English district locale missing')
    revisedDistrict.name = 'Revised district'
    await f.run([row], 'old', 'source', 'division-b')
    expect(
      f.current.query('SELECT divisionSnapshotId FROM placesDivision').get(),
    ).toEqual({ divisionSnapshotId: 'division-b' })
    expect(f.current.query('SELECT * FROM divisionLinkWrites').all()).toEqual([
      { operation: 'update' },
    ])
    row.divisionIds = []
    await f.run([row])
    expect(f.current.query('SELECT * FROM divisionLinkWrites').all()).toEqual([
      { operation: 'update' },
      { operation: 'delete' },
    ])
  } finally {
    f.close()
  }
})

test('forward Places ingest after rollback compares the restored predecessor and retains exact new journals', async () => {
  const f = fixture()
  try {
    const row = await place()
    await f.run([row])
    const tables = ['places', 'placesI18n', 'placesCells', 'placesDivision']
    const restoredRows = new Map(
      tables.map(table => [
        table,
        f.current
          .query<Record<string, SQLQueryBindings>, []>(`SELECT * FROM ${table}`)
          .all(),
      ]),
    )
    const originalHash = row.versionHash
    row.place.operatingStatus = 'temporarily_closed'
    const english = row.place.i18n.find(locale => locale.locale === 'en')
    if (!english) throw new Error('Missing English fixture')
    english.name = 'Revised name'
    row.versionHash = await hashPlaceMaterialisation(row.place, {
      addressSnapshotId: 'address',
      divisionSnapshotId: 'division',
      addressId: null,
      divisionIds: [],
    })
    await f.run([row], 'new')
    const retained = getDatabase(f.databases, 'new')
      .query('SELECT count(*) AS n FROM places')
      .get()
    // Restore the serving projection and ancestry, retaining the revoked revision's history flags.
    for (const table of tables.toReversed())
      f.current.query(`DELETE FROM ${table}`).run()
    for (const table of tables)
      for (const original of restoredRows.get(table) ?? []) {
        const columns = Object.keys(original)
        f.current
          .query(
            `INSERT INTO ${table}(${columns.map(column => `"${column}"`).join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
          )
          .run(...columns.map(column => original[column] ?? null))
      }
    f.plan.splice(1)
    const baseline = await loadCurrentPlaceHistory(f.historyTargets, {
      currentDb: drizzle({ client: f.current }) as never,
      scopeId: 'scope',
      replayPlan: f.plan,
    })
    expect(baseline[0]?.row.versionHash).toBe(originalHash)
    expect(
      baseline[0]?.locales?.find(locale => locale.row.locale === 'en')?.row.name,
    ).toBe('Original')
    const changed = await f.run([row], 'new')
    expect(changed.changes.join('')).toContain('placeI18n')
    const replayed = await resolveSnapshotVersionState(f.plan, f.shards, [
      'place',
      'placeI18n',
    ])
    expect(
      [...replayed.values()].find(value => value.recordType === 'place')?.versionHash,
    ).toBe(row.versionHash)
    expect(
      [...replayed.values()].find(
        value => value.recordType === 'placeI18n' && value.locale === 'en',
      )?.shard.bindingName,
    ).toBe('new')
    expect(
      getDatabase(f.databases, 'new').query('SELECT count(*) AS n FROM places').get(),
    ).toEqual(retained)
    expect((await f.run([row], 'new')).changes).toEqual([])
  } finally {
    f.close()
  }
})
