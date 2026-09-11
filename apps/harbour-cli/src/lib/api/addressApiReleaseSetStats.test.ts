import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  buildAddressStatsChurn,
  previousAddressStatsRelease,
  readAddressStatsSnapshot,
  type AddressStatsRelease,
  type AddressStatsSnapshot,
} from './addressApiReleaseSetStats'

const snapshot = (
  address2d: Array<[string, string]>,
  address3d: Array<[string, string]> = [],
) =>
  ({
    address2d: new Map(
      address2d.map(([id, churnHash]) => [
        id,
        {
          churnHash,
          id,
          localisedRows: [],
          parentId: null,
          geometry: null,
          type: 'address2d',
        },
      ]),
    ),
    address3d: new Map(
      address3d.map(([id, churnHash]) => [
        id,
        {
          churnHash,
          id,
          localisedRows: [],
          parentId: null,
          geometry: null,
          type: 'address3d',
        },
      ]),
    ),
  }) satisfies AddressStatsSnapshot

test('reports address churn against the preceding immutable snapshot', () => {
  const churn = buildAddressStatsChurn(
    snapshot(
      [
        ['kept', 'v1'],
        ['changed', 'v2'],
        ['added', 'v1'],
      ],
      [
        ['collection-kept', 'v1'],
        ['collection-added', 'v1'],
      ],
    ),
    snapshot(
      [
        ['kept', 'v1'],
        ['changed', 'v1'],
        ['removed', 'v1'],
      ],
      [
        ['collection-kept', 'v1'],
        ['collection-removed', 'v1'],
      ],
    ),
  )

  expect(churn.totals).toEqual({
    count: 3,
    added_count: 1,
    changed_count: 1,
    removed_count: 1,
    unchanged_count: 1,
  })
  expect(churn.address2d).toEqual(churn.totals)
  expect(churn.address3d).toEqual({
    count: 2,
    added_count: 1,
    changed_count: 0,
    removed_count: 1,
    unchanged_count: 1,
  })
})

test('uses only the preceding release in the same API, domain and region', () => {
  const release = (id: string, extra: Partial<AddressStatsRelease> = {}) =>
    ({
      apiVersionId: 'address-v1',
      code: id,
      domainCode: 'saanseoi',
      id,
      regionCode: 'hk',
      revision: 0,
      snapshotId: `${id}-snapshot`,
      ...extra,
    }) satisfies AddressStatsRelease
  const releases = [
    release('first'),
    release('other-domain', { domainCode: 'other' }),
    release('second'),
  ]

  expect(previousAddressStatsRelease(releases, 'first')).toBeUndefined()
  expect(previousAddressStatsRelease(releases, 'second')?.id).toBe('first')
})

test('Address churn replays independent locale changes, omissions and inherited versions across shards', async () => {
  const meta = new Database(':memory:')
  const earlier = new Database(':memory:')
  const later = new Database(':memory:')
  try {
    const migrations = resolve(import.meta.dir, '../../../../../libs/db/migrations')
    meta.exec(loadMigrationSql(migrations, ['meta']))
    for (const db of [earlier, later])
      db.exec(loadMigrationSql(migrations, ['history']))
    meta.exec(`INSERT INTO snapshots(id,resourceType,code,cohortKey,status,parentSnapshotId)
      VALUES ('one','address','one','2025-09','published',NULL),
        ('two','address','two','2026-09','published','one'),
        ('three','address','three','2026-10','published','two');
      INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash)
      VALUES ('old','history','hk','2025','preview','old','old','DB_HISTORY_HK_2025','active','old'),
        ('new','history','hk','2026','preview','new','new','DB_HISTORY_HK_2026','active','new');
      INSERT INTO snapshotShardAssignments(snapshotId,dataShardId)
      VALUES ('one','old'),('two','new'),('three','new');`)
    const oldChange = earlier.prepare(`INSERT INTO snapshotVersionChanges
      (snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId)
      VALUES ('one',?,?,?,?,'upsert','release-one')`)
    const newChange = later.prepare(`INSERT INTO snapshotVersionChanges
      (snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId)
      VALUES ('two',?,?,?,?,?,'release-two')`)
    for (const type of ['address2d', 'address3d']) {
      for (const id of [
        'translated',
        'removed-locale',
        'added-locale',
        'inherited',
        'relocated',
        'removed-base',
      ]) {
        oldChange.run(type, id, '', `${type}-base`)
        oldChange.run(`${type}I18n`, id, 'en', `${type}-english`)
        if (id !== 'added-locale')
          oldChange.run(`${type}I18n`, id, 'zh-hant', `${type}-chinese`)
      }
      newChange.run(
        `${type}I18n`,
        'translated',
        'zh-hant',
        `${type}-new-chinese`,
        'upsert',
      )
      newChange.run(`${type}I18n`, 'removed-locale', 'zh-hant', null, 'delete')
      newChange.run(
        `${type}I18n`,
        'added-locale',
        'zh-hant',
        `${type}-chinese`,
        'upsert',
      )
      // Shard and source-release changes alone do not change address content.
      newChange.run(`${type}I18n`, 'relocated', 'zh-hant', `${type}-chinese`, 'upsert')
      // Locale-only journal entries never create a counted address.
      newChange.run(`${type}I18n`, 'orphan', 'en', 'orphan-english', 'upsert')
      newChange.run(type, 'removed-base', '', null, 'delete')
    }

    const metaDb = createLocalHarbourDb(meta)
    const targets = [
      { bindingName: 'DB_HISTORY_HK_2025', db: createLocalHarbourDb(earlier) },
      { bindingName: 'DB_HISTORY_HK_2026', db: createLocalHarbourDb(later) },
    ]
    const first = await readAddressStatsSnapshot(metaDb, targets, 'one')
    const second = await readAddressStatsSnapshot(metaDb, targets, 'two')
    const third = await readAddressStatsSnapshot(metaDb, targets, 'three')
    const changed = buildAddressStatsChurn(second, first)
    const inherited = buildAddressStatsChurn(third, second)
    for (const type of ['address2d', 'address3d'] as const) {
      expect(changed[type]).toEqual({
        count: 5,
        added_count: 0,
        changed_count: 3,
        removed_count: 1,
        unchanged_count: 2,
      })
      for (const id of ['translated', 'removed-locale', 'added-locale'])
        expect(second[type].get(id)?.churnHash).not.toBe(first[type].get(id)?.churnHash)
      for (const id of ['inherited', 'relocated'])
        expect(second[type].get(id)?.churnHash).toBe(first[type].get(id)?.churnHash)
      expect(second[type].has('orphan')).toBe(false)
      expect(second[type].has('removed-base')).toBe(false)
      expect(inherited[type]).toEqual({
        count: 5,
        added_count: 0,
        changed_count: 0,
        removed_count: 0,
        unchanged_count: 5,
      })
    }
    expect(changed.totals).toEqual(changed.address2d)
  } finally {
    meta.close()
    earlier.close()
    later.close()
  }
})
