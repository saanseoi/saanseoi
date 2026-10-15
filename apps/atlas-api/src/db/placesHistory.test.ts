import { seedSnapshotProducerFixtures } from '../../../../libs/core/src/testing/snapshotFixtures'
import { insertFixtureSnapshot } from '../../../../libs/core/src/testing/snapshotFixtures'
import { expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'

import { createLocalHarbourDb } from '../../../../libs/core/src/testing/localDb'
import { loadMigrationSql } from '../../../../libs/core/src/testing/metaFixtures'

import { listReplayedPlaceRecords, listReplayedPlacePage } from './placesHistory'

const MIGRATIONS_DIR = resolve(import.meta.dir, '../../../../libs/db/migrations')
const TIMESTAMP = '2026-09-05T00:00:00.000Z'

function init(family: 'meta' | 'history') {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(MIGRATIONS_DIR, [family]).replaceAll(
      '--> statement-breakpoint',
      '',
    ),
  )
  return sqlite
}

function run(sqlite: Database, query: string, values: SQLQueryBindings[] = []) {
  sqlite.query(query).run(...values)
}

test('replays Place text and spatial divisions from the selected version without an Address', async () => {
  const meta = init('meta')
  const history = init('history')
  try {
    insertFixtureSnapshot(meta, {
      id: 'place-snapshot-old',
      resourceType: 'place',
      code: 'places-old',
      cohortKey: '2025-09',
      status: 'published',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    })
    for (const [id, resourceType] of [
      ['address-snapshot-old', 'address'],
      ['division-snapshot-old', 'division'],
    ] as const) {
      insertFixtureSnapshot(meta, {
        id: id,
        resourceType: resourceType,
        code: id,
        cohortKey: '2025-09',
        status: 'published',
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      })
    }
    run(
      meta,
      `INSERT INTO dataShards (
        id, shardType, regionCode, year, environment, databaseName, databaseId,
        bindingName, status, versionHash, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'history-old',
        'history',
        'hk',
        '2025',
        'preview',
        'history-old',
        'history-old-db',
        'DB_HISTORY_HK_2025',
        'active',
        'history-old-hash',
        TIMESTAMP,
        TIMESTAMP,
      ],
    )
    for (const snapshotId of [
      'place-snapshot-old',
      'address-snapshot-old',
      'division-snapshot-old',
    ]) {
      run(
        meta,
        `INSERT INTO snapshotShardAssignments (snapshotId, dataShardId) VALUES (?, ?)`,
        [snapshotId, 'history-old'],
      )
    }

    run(
      history,
      `INSERT INTO address2d (id,granularity,countryId,districtId,geometry,identifiers,sources,versionHash,snapshotId,isCurrent,createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'address-old',
        'building',
        'division-country-old',
        'division-district-old',
        '{"type":"Point","coordinates":[114.1,22.3]}',
        '{}',
        '{}',
        'address-old-hash',
        'address-snapshot-old',
        1,
        TIMESTAMP,
      ],
    )

    for (const [id, kind] of [
      ['division-country-old', 'country'],
      ['division-district-old', 'district'],
      ['excluded-sar', 'region'],
      ['excluded-city', 'city'],
      ['excluded-group', 'island_group'],
    ]) {
      run(
        history,
        "INSERT INTO divisions(id,class,hierarchies,versionHash,snapshotId,isCurrent,createdAt) VALUES(?,?,'{}',?,?,1,?)",
        [id!, kind!, id!, 'division-snapshot-old', TIMESTAMP],
      )
    }
    for (const versionHash of ['place-old-hash', 'place-new-hash']) {
      run(
        history,
        'INSERT INTO places (id,resourceReleaseId,addressSnapshotId,address2dId,geometry,bbox,basicCategory,sources,firstSeenMonth,lastSeenMonth,versionHash,snapshotId,isCurrent,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          'place-1',
          versionHash === 'place-old-hash' ? 'release-old' : 'release-new',
          null,
          null,
          JSON.stringify({ type: 'Point', coordinates: [114.1, 22.3] }),
          '[114.1,22.3,114.1,22.3]',
          'restaurant',
          JSON.stringify({
            divisionAssociation: {
              divisionSnapshotId: 'division-snapshot-old',
              divisionAreaSnapshotId: 'area-old',
              evidence: [
                { divisionId: 'division-country-old', method: 'ancestry' },
                { divisionId: 'excluded-sar', method: 'ancestry' },
                { divisionId: 'excluded-city', method: 'ancestry' },
                { divisionId: 'excluded-group', method: 'ancestry' },
                { divisionId: 'division-district-old', method: 'geometry' },
              ],
            },
          }),
          '2025-09',
          '2026-09',
          versionHash,
          versionHash === 'place-old-hash'
            ? 'place-snapshot-old'
            : 'place-snapshot-new',
          versionHash === 'place-new-hash' ? 1 : 0,
          TIMESTAMP,
        ],
      )
    }
    run(
      history,
      `INSERT INTO placesI18n (placeId,locale,name,freeformAddress,meta,versionHash,snapshotId,isCurrent,createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'place-1',
        'en',
        'Old Place Name',
        'Old Address Text',
        '{"isLocaleInferred":false}',
        'place-old-en-hash',
        'place-snapshot-old',
        1,
        TIMESTAMP,
      ],
    )
    run(
      history,
      `INSERT INTO placesI18n (placeId,locale,name,freeformAddress,meta,versionHash,snapshotId,isCurrent,createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'place-1',
        'en',
        'Current Place Name',
        'Current Address Text',
        '{"isLocaleInferred":false}',
        'place-new-en-hash',
        'place-snapshot-new',
        0,
        TIMESTAMP,
      ],
    )
    for (let index = 0; index < 100; index += 1) {
      const id = `place-extra-${index}`
      const versionHash = `${id}-v1`
      run(
        history,
        'INSERT INTO places (id,resourceReleaseId,geometry,firstSeenMonth,lastSeenMonth,versionHash,snapshotId,isCurrent,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          id,
          'release-old',
          JSON.stringify({ type: 'Point', coordinates: [114.1, 22.3] }),
          '2025-09',
          '2025-09',
          versionHash,
          'place-snapshot-old',
          1,
          TIMESTAMP,
        ],
      )
    }

    seedSnapshotProducerFixtures(meta)
    const records = await listReplayedPlaceRecords({
      divisionSnapshotId: 'division-snapshot-old',
      historyDbsByBinding: {
        DB_HISTORY_HK_2025: createLocalHarbourDb(history) as never,
      },
      localeSelection: { mode: 'requested', locales: ['en'] },
      metaDb: createLocalHarbourDb(meta),
      snapshotId: 'place-snapshot-old',
    })

    expect(records).toHaveLength(101)
    const lookup = {
      divisionSnapshotId: 'division-snapshot-old',
      historyDbsByBinding: {
        DB_HISTORY_HK_2025: createLocalHarbourDb(history) as never,
      },
      localeSelection: { mode: 'requested' as const, locales: ['en'] },
      metaDb: createLocalHarbourDb(meta),
      snapshotId: 'place-snapshot-old',
      limit: 2,
      offset: 99,
    }
    const page = await listReplayedPlacePage(lookup)
    expect(page.hasMore).toBe(false)
    const firstPage = await listReplayedPlacePage({ ...lookup, offset: 0 })
    expect(firstPage.records).toHaveLength(2)
    expect(firstPage.hasMore).toBe(true)
    expect(page.records.map(record => record.place.id)).toEqual(
      records
        .map(record => record.place.id)
        .sort()
        .slice(99),
    )
    const filtered = await listReplayedPlacePage({
      ...lookup,
      offset: 0,
      divisionId: 'division-district-old',
    })
    expect(filtered.hasMore).toBe(false)
    expect(filtered.records[0]?.i18n.en?.name).toBe('Old Place Name')
    run(
      history,
      `UPDATE places SET operation = 'delete', versionHash = NULL WHERE id = 'place-1'`,
    )
    const deletedPage = await listReplayedPlacePage({ ...lookup, offset: 99 })
    expect(deletedPage.hasMore).toBe(false)
    expect(deletedPage.records).toHaveLength(1)
    expect((await listReplayedPlacePage({ ...lookup, offset: 100 })).records).toEqual(
      [],
    )
    expect(records.find(record => record.place.id === 'place-1')).toMatchObject({
      place: {
        id: 'place-1',
        snapshotId: 'place-snapshot-old',
        resourceReleaseId: 'release-old',
      },
      i18n: {
        en: {
          meta: { isLocaleInferred: false },
          name: 'Old Place Name',
          freeformAddress: 'Old Address Text',
        },
      },
      divisionIds: ['division-country-old', 'division-district-old'],
    })
  } finally {
    meta.close()
    history.close()
  }
})

test('historical Places resolve independently inherited locales across years and exclude shared-hash neighbours', async () => {
  const meta = init('meta'),
    old = init('history'),
    next = init('history')
  try {
    for (const [snapshot, parent, binding, year] of [
      ['base', null, 'old', '2025'],
      ['edited', 'base', 'next', '2026'],
      ['removed', 'edited', 'next', '2026'],
    ] as const) {
      insertFixtureSnapshot(meta, {
        id: snapshot,
        resourceType: 'place',
        code: snapshot,
        cohortKey: year,
        status: 'published',
        parentSnapshotId: parent,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      })
      run(
        meta,
        'INSERT OR IGNORE INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          binding,
          'history',
          'hk',
          year,
          'preview',
          binding,
          binding,
          binding,
          'active',
          binding,
          TIMESTAMP,
          TIMESTAMP,
        ],
      )
      run(
        meta,
        'INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES(?,?)',
        [snapshot, binding],
      )
    }
    for (const id of ['place', 'same-hash-neighbour'])
      run(
        old,
        'INSERT INTO places (id,resourceReleaseId,geometry,firstSeenMonth,lastSeenMonth,versionHash,snapshotId,isCurrent,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          id,
          'source-base',
          JSON.stringify({ type: 'Point', coordinates: [114, 22] }),
          '2025-01',
          '2025-01',
          'base-content',
          id === 'place' ? 'base' : 'unselected',
          1,
          TIMESTAMP,
        ],
      )
    for (const [db, locale, hash, name] of [
      [old, 'en', 'english-old', 'Original'],
      [old, 'zh-hant', 'chinese', '原文'],
      [next, 'en', 'english-new', 'Revised'],
    ] as const)
      for (const id of ['place', 'same-hash-neighbour'])
        run(
          db,
          'INSERT INTO placesI18n (placeId,locale,name,versionHash,snapshotId,isCurrent,createdAt) VALUES (?,?,?,?,?,?,?)',
          [
            id,
            locale,
            id === 'place' ? name : 'Wrong neighbour',
            hash,
            id === 'place' ? (db === next ? 'edited' : 'base') : 'unselected',
            1,
            TIMESTAMP,
          ],
        )
    run(
      next,
      "UPDATE placesI18n SET snapshotId='edited' WHERE versionHash='english-new'",
    )
    run(
      next,
      "INSERT INTO placesI18n(placeId,locale,snapshotId,operation) VALUES('place','zh-hant','removed','delete')",
    )
    seedSnapshotProducerFixtures(meta)
    const read = (snapshotId: string) =>
      listReplayedPlaceRecords({
        divisionSnapshotId: 'unused',
        snapshotId,
        resolveDivisions: false,
        localeSelection: { mode: 'all', locales: ['*'] },
        recordIds: ['place'],
        metaDb: createLocalHarbourDb(meta),
        historyDbsByBinding: {
          old: createLocalHarbourDb(old) as never,
          next: createLocalHarbourDb(next) as never,
        },
      })
    expect((await read('base'))[0]?.i18n.en?.name).toBe('Original')
    const edited = await read('edited')
    expect(edited).toHaveLength(1)
    expect(edited[0]?.i18n.en?.name).toBe('Revised')
    expect(edited[0]?.i18n['zh-hant']?.name).toBe('原文')
    expect(Object.keys((await read('removed'))[0]?.i18n ?? {})).toEqual(['en'])
  } finally {
    meta.close()
    old.close()
    next.close()
  }
})
