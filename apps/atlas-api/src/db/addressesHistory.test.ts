import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../libs/core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '../../../../libs/core/src/testing/localDb'

import {
  listReplayedAddressRecords,
  listReplayedAddressPage,
  selectReplayedAddressLocales,
  searchReplayedAddressRecords,
} from './addressesHistory'

const MIGRATIONS_DIR = resolve(import.meta.dir, '../../../../libs/db/migrations')
const TIMESTAMP = '2025-09-24T00:00:00.000Z'

test('replays the selected address snapshot from its assigned history shard', async () => {
  const meta = new Database(':memory:')
  const history = new Database(':memory:')
  try {
    meta.exec(
      loadMigrationSql(MIGRATIONS_DIR, ['meta']).replaceAll(
        '--> statement-breakpoint',
        '',
      ),
    )
    history.exec(
      loadMigrationSql(MIGRATIONS_DIR, ['history']).replaceAll(
        '--> statement-breakpoint',
        '',
      ),
    )
    meta.exec(`
      INSERT INTO snapshots (id, resourceType, code, cohortKey, status, createdAt, updatedAt)
      VALUES ('address-snapshot-2025', 'address', 'snapshot-address-2025', '2025-09', 'published', '${TIMESTAMP}', '${TIMESTAMP}');
      INSERT INTO dataShards (
        id, shardType, regionCode, year, environment, databaseName, databaseId,
        bindingName, status, versionHash, createdAt, updatedAt
      ) VALUES (
        'history-2025', 'history', 'hk', '2025', 'preview', 'history-2025',
        'history-2025-db', 'DB_HISTORY_HK_2025', 'active', 'history-2025-hash',
        '${TIMESTAMP}', '${TIMESTAMP}'
      );
      INSERT INTO snapshotShardAssignments (snapshotId, dataShardId)
      VALUES ('address-snapshot-2025', 'history-2025');
    `)
    history.exec(`
      INSERT INTO address2d (
        id, granularity, parentAddressId, countryId, geometry, bbox, identifiers, sources, versionHash,
        sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt
      ) VALUES (
        'historic-address', 'building', 'historic-complex', 'hk', '{"type":"Point","coordinates":[114.1,22.3]}',
        '[114.1,22.3,114.1,22.3]', '{"source":"historic"}',
        '{"hkgov-dpo":[{"record_id":"historic"}]}', 'historic-address-v1',
        'historic-release', 'address-snapshot-2025', 0, '${TIMESTAMP}', '${TIMESTAMP}'
      );
      INSERT INTO address2d (id, granularity, versionHash, sourceReleaseId, snapshotId, isCurrent)
      VALUES ('historic-address', 'unit', 'historic-address-v2', 'later-release', 'later-snapshot', 1);
      INSERT INTO address2dI18n (
        addressId, locale, formattedAddress, buildingName, versionHash,
        sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt
      ) VALUES
        ('historic-address', 'en', '1 Historic Road', 'Historic House', 'historic-address-en-v1',
         'historic-release', 'address-snapshot-2025', 0, '${TIMESTAMP}', '${TIMESTAMP}'),
        ('historic-address', 'zh-Hant', '歷史道1號', '歷史大廈', 'historic-address-zh-hant-v1',
         'historic-release', 'address-snapshot-2025', 0, '${TIMESTAMP}', '${TIMESTAMP}');
      INSERT INTO snapshotVersionChanges (
        snapshotId, recordType, recordId, locale, versionHash, operation,
        sourceReleaseId, createdAt, updatedAt
      ) VALUES
        ('address-snapshot-2025', 'address2d', 'historic-address', '', 'historic-address-v1', 'upsert',
         'historic-release', '${TIMESTAMP}', '${TIMESTAMP}'),
        ('address-snapshot-2025', 'address2dI18n', 'historic-address', 'en', 'historic-address-en-v1', 'upsert',
         'historic-release', '${TIMESTAMP}', '${TIMESTAMP}'),
        ('address-snapshot-2025', 'address2dI18n', 'historic-address', 'zh-Hant', 'historic-address-zh-hant-v1', 'upsert',
         'historic-release', '${TIMESTAMP}', '${TIMESTAMP}');
    `)

    const records = await listReplayedAddressRecords({
      divisionSnapshotId: 'division-snapshot-2025',
      historyDbsByBinding: {
        DB_HISTORY_HK_2025: createLocalHarbourDb(history) as never,
      },
      localeSelection: { mode: 'requested', locales: ['en'] },
      metaDb: createLocalHarbourDb(meta),
      snapshotIds: ['address-snapshot-2025'],
    })

    expect(records).toEqual([
      expect.objectContaining({
        address: expect.objectContaining({
          divisionSnapshotId: 'division-snapshot-2025',
          id: 'historic-address',
          parentAddressId: 'historic-complex',
          granularity: 'building',
          snapshotId: 'address-snapshot-2025',
        }),
        i18n: {
          en: expect.objectContaining({ formattedAddress: '1 Historic Road' }),
        },
      }),
    ])
    const searchPage = await listReplayedAddressPage({
      divisionSnapshotId: 'division-snapshot-2025',
      historyDbsByBinding: {
        DB_HISTORY_HK_2025: createLocalHarbourDb(history) as never,
      },
      localeSelection: { mode: 'none', locales: [] },
      metaDb: createLocalHarbourDb(meta),
      snapshotIds: ['address-snapshot-2025'],
      search: { mode: 'full-text', query: 'Historic Road' },
      limit: 1,
      offset: 0,
    })
    expect(searchPage.records.map(row => row.address.id)).toEqual(['historic-address'])
    expect(searchPage.records[0]?.i18n).toEqual({})
    expect(searchPage.hasMore).toBe(false)
    expect(
      searchReplayedAddressRecords(records, {
        mode: 'full-text',
        query: 'Historic Road',
      }).map(record => record.address.id),
    ).toEqual(['historic-address'])
    for (const [from, to, connector, query, rangeMatch, exactMatch] of [
      ['1', '10', '-', '5', true, false],
      ['1', '9', '-', '5', true, false],
      ['1', '9', '-', '4', false, false],
      ['2', '10', '-', '6', true, false],
      ['2', '10', '-', '5', false, false],
      ['5A', '5C', '-', '5b', true, false],
      ['5A', '5C', '-', '5', false, false],
      ['1', '10', '-', '1', true, true],
      ['1', '10', '-', '10', true, true],
      ['1', '10', '&', '5', false, false],
      ['1', '10', '&', '10', true, true],
      ['1', '10', null, '5', false, false],
      ['10', '1', '-', '5', false, false],
      ['1', '10', '-', '11', false, false],
    ] as const) {
      const numberedRecords = records.map(record => ({
        ...record,
        i18n: Object.fromEntries(
          Object.entries(record.i18n).map(([locale, value]) => [
            locale,
            {
              ...value,
              buildingNumberFrom: from,
              buildingNumberTo: to,
              buildingNumberConnector: connector,
            },
          ]),
        ),
      }))
      for (const [mode, matches] of [
        ['range', rangeMatch],
        ['exact', exactMatch],
      ] as const) {
        expect(
          searchReplayedAddressRecords(numberedRecords, { mode, query }).map(
            record => record.address.id,
          ),
        ).toEqual(matches ? ['historic-address'] : [])
      }
    }
    expect(
      selectReplayedAddressLocales(records, { mode: 'requested', locales: ['en'] }),
    ).toEqual(records)
    expect(
      searchReplayedAddressRecords(records, {
        component: 'building',
        mode: 'component',
        query: 'Historic',
      }).map(record => record.address.id),
    ).toEqual(['historic-address'])
    // Populate multiple ID windows; localisation deliberately has no matching
    // content for these rows, so loading locales outside the page would fail.
    history.exec(`
      WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<250)
      INSERT INTO address2d (id, granularity, countryId, versionHash, sourceReleaseId, snapshotId, isCurrent)
      SELECT printf('z%03d',x), 'building', 'hk', printf('z%03d-v1',x), 'historic-release', 'address-snapshot-2025', 0 FROM n;
      INSERT INTO snapshotVersionChanges (snapshotId, recordType, recordId, locale, versionHash, operation, sourceReleaseId)
      SELECT snapshotId, 'address2d', id, '', versionHash, 'upsert', sourceReleaseId FROM address2d WHERE id LIKE 'z%';
      INSERT INTO snapshotVersionChanges (snapshotId, recordType, recordId, locale, versionHash, operation, sourceReleaseId)
      VALUES ('address-snapshot-2025', 'address2dI18n', 'z001', 'en', 'missing-unrequested-locale', 'upsert', 'historic-release');
    `)
    const lookup = {
      divisionSnapshotId: 'division-snapshot-2025',
      historyDbsByBinding: {
        DB_HISTORY_HK_2025: createLocalHarbourDb(history) as never,
      },
      localeSelection: { mode: 'requested', locales: ['en'] } as const,
      metaDb: createLocalHarbourDb(meta),
      snapshotIds: ['address-snapshot-2025'],
    }
    const page = await listReplayedAddressPage({
      ...lookup,
      localeSelection: { mode: 'requested', locales: ['en'] },
      limit: 1,
      offset: 0,
    })
    expect(page.records).toEqual(records)
    expect(page.hasMore).toBe(true)
    const last = await listReplayedAddressPage({
      ...lookup,
      localeSelection: { mode: 'none', locales: [] },
      limit: 2,
      offset: 250,
    })
    expect(last.records.map(row => row.address.id)).toEqual(['z250'])
    expect(last.hasMore).toBe(false)
    const sought = await listReplayedAddressPage({
      ...lookup,
      localeSelection: { mode: 'requested', locales: ['en'] },
      limit: 1,
      offset: 0,
      after: 'z249',
    })
    expect(sought.records.map(row => row.address.id)).toEqual(['z250'])
    expect(sought.hasMore).toBe(false)
    const filtered = await listReplayedAddressPage({
      ...lookup,
      localeSelection: { mode: 'none', locales: [] },
      countryId: 'absent',
      limit: 1,
      offset: 0,
    })
    expect(filtered.records).toEqual([])
    expect(filtered.hasMore).toBe(false)
    expect(
      await listReplayedAddressRecords({
        ...lookup,
        localeSelection: { mode: 'requested', locales: ['en'] },
        recordIds: ['historic-address'],
      }),
    ).toEqual(records)
    expect(
      await listReplayedAddressRecords({
        ...lookup,
        localeSelection: { mode: 'all', locales: ['*'] },
        recordIds: ['absent'],
      }),
    ).toEqual([])
    meta.exec(`
      INSERT INTO snapshots (id, resourceType, code, cohortKey, status, parentSnapshotId)
      VALUES ('child', 'address', 'child', '2026', 'published', 'address-snapshot-2025');
      INSERT INTO snapshotShardAssignments (snapshotId, dataShardId) VALUES ('child', 'history-2025');
    `)
    history.exec(`
      INSERT INTO address2d (id, granularity, countryId, versionHash, sourceReleaseId, snapshotId, isCurrent)
      VALUES ('z001', 'unit', 'mo', 'z001-v2', 'later-release', 'child', 1);
      INSERT INTO snapshotVersionChanges (snapshotId, recordType, recordId, locale, versionHash, operation, sourceReleaseId)
      VALUES ('child', 'address2d', 'historic-address', '', NULL, 'delete', NULL),
             ('child', 'address2d', 'z001', '', 'z001-v2', 'upsert', 'later-release');
    `)
    const child = await listReplayedAddressPage({
      ...lookup,
      snapshotIds: ['child'],
      localeSelection: { mode: 'none', locales: [] },
      limit: 2,
      offset: 0,
    })
    expect(child.records.map(row => row.address.id)).toEqual(['z001', 'z002'])
    expect(child.records[0]?.address.granularity).toBe('unit')
    const childFiltered = await listReplayedAddressPage({
      ...lookup,
      snapshotIds: ['child'],
      localeSelection: { mode: 'none', locales: [] },
      countryId: 'hk',
      limit: 1,
      offset: 0,
    })
    expect(childFiltered.records.map(row => row.address.id)).toEqual(['z002'])
    expect(child.hasMore).toBe(true)
    const unionPage = await listReplayedAddressPage({
      ...lookup,
      snapshotIds: ['address-snapshot-2025', 'child'],
      localeSelection: { mode: 'none', locales: [] },
      limit: 1,
      offset: 2,
    })
    expect(
      unionPage.records.map(row => [row.address.snapshotId, row.address.id]),
    ).toEqual([['child', 'z001']])
    expect(unionPage.hasMore).toBe(true)
    expect(
      await listReplayedAddressRecords({
        ...lookup,
        snapshotIds: ['child'],
        localeSelection: { mode: 'none', locales: [] },
        recordIds: ['historic-address'],
      }),
    ).toEqual([])
    // Missing content beyond the first ID window must not be materialised.
    history.exec(`DELETE FROM address2d WHERE id='z250'`)
    expect(
      (
        await listReplayedAddressPage({
          ...lookup,
          localeSelection: { mode: 'requested', locales: ['en'] },
          limit: 1,
          offset: 0,
        })
      ).records,
    ).toEqual(records)
  } finally {
    meta.close()
    history.close()
  }
})
