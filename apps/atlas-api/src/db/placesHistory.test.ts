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

test('replays Place text and Address-derived divisions from the selected snapshot', async () => {
  const meta = init('meta')
  const history = init('history')
  try {
    run(
      meta,
      `INSERT INTO snapshots (id, resourceType, code, cohortKey, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'place-snapshot-old',
        'place',
        'places-old',
        '2025-09',
        'published',
        TIMESTAMP,
        TIMESTAMP,
      ],
    )
    for (const [id, resourceType] of [
      ['address-snapshot-old', 'address'],
      ['division-snapshot-old', 'division'],
    ] as const) {
      run(
        meta,
        `INSERT INTO snapshots (id, resourceType, code, cohortKey, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, resourceType, id, '2025-09', 'published', TIMESTAMP, TIMESTAMP],
      )
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
      `INSERT INTO address2d (
        id, granularity, countryId, districtId, geometry, bbox, identifiers, sources,
        versionHash, sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'address-old',
        'building',
        'division-country-old',
        'division-district-old',
        '{"type":"Point","coordinates":[114.1,22.3]}',
        '[114.1,22.3,114.1,22.3]',
        '{}',
        '{}',
        'address-old-hash',
        'release-old',
        'address-snapshot-old',
        1,
        TIMESTAMP,
        TIMESTAMP,
      ],
    )
    run(
      history,
      `INSERT INTO snapshotVersionChanges (
        snapshotId, recordType, recordId, locale, versionHash, operation,
        sourceReleaseId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'address-snapshot-old',
        'address2d',
        'address-old',
        '',
        'address-old-hash',
        'upsert',
        'release-old',
        TIMESTAMP,
        TIMESTAMP,
      ],
    )

    for (const versionHash of ['place-old-hash', 'place-new-hash']) {
      run(
        history,
        `INSERT INTO places (
          id, releaseId, addressSnapshotId, address2dId, lng, lat, bbox,
          basicCategory, sources, firstSeenMonth, lastSeenMonth, versionHash,
          sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'place-1',
          versionHash === 'place-old-hash' ? 'release-old' : 'release-new',
          'address-snapshot-old',
          'address-old',
          114.1,
          22.3,
          '[114.1,22.3,114.1,22.3]',
          'restaurant',
          '{}',
          '2025-09',
          '2026-09',
          versionHash,
          versionHash === 'place-old-hash' ? 'release-old' : 'release-new',
          versionHash === 'place-old-hash'
            ? 'place-snapshot-old'
            : 'place-snapshot-new',
          versionHash === 'place-new-hash' ? 1 : 0,
          TIMESTAMP,
          TIMESTAMP,
        ],
      )
    }
    run(
      history,
      `INSERT INTO placesI18n (
        placeId, locale, name, freeformAddress, provenance, versionHash,
        sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'place-1',
        'en',
        'Old Place Name',
        'Old Address Text',
        '{}',
        'place-old-en-hash',
        'release-old',
        'place-snapshot-old',
        1,
        TIMESTAMP,
        TIMESTAMP,
      ],
    )
    run(
      history,
      `INSERT INTO placesI18n (
        placeId, locale, name, freeformAddress, provenance, versionHash,
        sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'place-1',
        'en',
        'Current Place Name',
        'Current Address Text',
        '{}',
        'place-new-en-hash',
        'release-new',
        'place-snapshot-new',
        0,
        TIMESTAMP,
        TIMESTAMP,
      ],
    )
    for (const [recordType, recordId, locale, versionHash] of [
      ['place', 'place-1', '', 'place-old-hash'],
      ['placeI18n', 'place-1', 'en', 'place-old-en-hash'],
    ] as const) {
      run(
        history,
        `INSERT INTO snapshotVersionChanges (
          snapshotId, recordType, recordId, locale, versionHash, operation,
          sourceReleaseId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'place-snapshot-old',
          recordType,
          recordId,
          locale,
          versionHash,
          'upsert',
          'release-old',
          TIMESTAMP,
          TIMESTAMP,
        ],
      )
    }
    for (let index = 0; index < 100; index += 1) {
      const id = `place-extra-${index}`
      const versionHash = `${id}-v1`
      run(
        history,
        `INSERT INTO places (
          id, releaseId, lng, lat, firstSeenMonth, lastSeenMonth, versionHash,
          sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          'release-old',
          114.1,
          22.3,
          '2025-09',
          '2025-09',
          versionHash,
          'release-old',
          'place-snapshot-old',
          1,
          TIMESTAMP,
          TIMESTAMP,
        ],
      )
      run(
        history,
        `INSERT INTO snapshotVersionChanges (
          snapshotId, recordType, recordId, locale, versionHash, operation,
          sourceReleaseId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'place-snapshot-old',
          'place',
          id,
          '',
          versionHash,
          'upsert',
          'release-old',
          TIMESTAMP,
          TIMESTAMP,
        ],
      )
    }

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
      `UPDATE snapshotVersionChanges SET operation = 'delete', versionHash = NULL WHERE recordType = 'place' AND recordId = 'place-1'`,
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
        releaseId: 'release-old',
      },
      i18n: {
        en: {
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
      run(
        meta,
        'INSERT INTO snapshots(id,resourceType,code,cohortKey,status,parentSnapshotId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)',
        [snapshot, 'place', snapshot, year, 'published', parent, TIMESTAMP, TIMESTAMP],
      )
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
        'INSERT INTO places(id,releaseId,lng,lat,firstSeenMonth,lastSeenMonth,versionHash,sourceReleaseId,snapshotId,isCurrent,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          id,
          'source-base',
          114,
          22,
          '2025-01',
          '2025-01',
          'base-content',
          'source-base',
          'base',
          1,
          TIMESTAMP,
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
          'INSERT INTO placesI18n(placeId,locale,name,versionHash,sourceReleaseId,snapshotId,isCurrent,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)',
          [
            id,
            locale,
            id === 'place' ? name : 'Wrong neighbour',
            hash,
            'source-base',
            'base',
            1,
            TIMESTAMP,
            TIMESTAMP,
          ],
        )
    for (const [db, snapshot, recordType, locale, hash, operation] of [
      [old, 'base', 'place', '', 'base-content', 'upsert'],
      [old, 'base', 'placeI18n', 'en', 'english-old', 'upsert'],
      [old, 'base', 'placeI18n', 'zh-hant', 'chinese', 'upsert'],
      [next, 'edited', 'placeI18n', 'en', 'english-new', 'upsert'],
      [next, 'removed', 'placeI18n', 'zh-hant', null, 'delete'],
    ] as const)
      run(
        db,
        'INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)',
        [
          snapshot,
          recordType,
          'place',
          locale,
          hash,
          operation,
          snapshot,
          TIMESTAMP,
          TIMESTAMP,
        ],
      )
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
