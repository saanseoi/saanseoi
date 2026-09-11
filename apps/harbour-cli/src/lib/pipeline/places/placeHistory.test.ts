import { Database } from 'bun:sqlite'
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
  const current = databases.get('current')!
  const historyTargets = ['old', 'new'].map(bindingName => ({
    bindingName,
    db: drizzle({ client: databases.get(bindingName)! }),
  })) as unknown as Parameters<typeof loadCurrentPlaceHistory>[0]
  const sourceTargets = ['source', 'source-next'].map(bindingName => ({
    bindingName,
    db: drizzle({ client: databases.get(bindingName)! }),
  })) as unknown as Parameters<typeof loadCurrentPlaceSources>[0]
  const shards = new Map(
    historyTargets.map(target => [
      target.bindingName,
      { bindingName: target.bindingName, db: target.db },
    ]),
  ) as Map<string, ReplayShard>
  const plan: SnapshotReplayStep[] = []
  async function run(places: EnrichedPlace[], binding = 'old', source = 'source') {
    const snapshotId = `revision-${plan.length + 1}`
    const input: BuildPlaceSqlInput = {
      activeHistoryBindingName: binding,
      activeSourceBindingName: source,
      sourceBindingNames: ['source', 'source-next'],
      sourceRows: await loadCurrentPlaceSources(sourceTargets),
      sourceResolutions: await resolveSnapshotSourceResolutions(plan, shards),
      historyRows: await loadCurrentPlaceHistory(historyTargets, {
        currentDb: drizzle({ client: current }) as never,
        scopeId: 'scope',
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
        divisionSnapshotId: 'division',
      },
      places,
    }
    const sql = await buildPlaceSql(input, { timestamp: snapshotId })
    current.exec(sql.currentSql.join('\n'))
    for (const [name, statements] of sql.historySqlByBinding)
      databases.get(name)!.exec(statements.join('\n'))
    for (const [name, statements] of sql.sourceSqlByBinding)
      databases.get(name)!.exec(statements.join('\n'))
    if (sql.changes.length) databases.get(binding)!.exec(sql.changes.join('\n'))
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
  )!
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

    row.place.i18n.find(locale => locale.locale === 'en')!.name = 'Updated English'
    const localeOnly = await f.run([row], 'new', 'source-next')
    expect(localeOnly.changes.join('')).toContain('placeI18n')
    expect(
      f.databases
        .get('new')!
        .query(
          "SELECT recordType FROM snapshotVersionChanges WHERE snapshotId='revision-3'",
        )
        .all(),
    ).toEqual([{ recordType: 'placeI18n' }])
    expect(localeOnly.historySqlByBinding.get('old')?.join('')).not.toContain(
      'UPDATE places SET',
    )
    const old = f.databases.get('old')!,
      next = f.databases.get('new')!
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
    const states = await loadCurrentPlaceHistory(f.historyTargets)
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
    row.searchDependencies.en!.addressSnapshotId = 'address-b'
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
    row.searchDependencies.en!.addressText = 'Revised building translation'
    const revised = await f.run([row], 'new')
    expect(revised.changes.join('')).toContain('placeI18n')
    expect(
      f.databases
        .get('new')!
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
