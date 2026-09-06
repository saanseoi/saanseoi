import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../libs/core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '../../../../libs/core/src/testing/localDb'

import { listReplayedAddressRecords } from './addressesHistory'

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
        id, parentAddressId, countryId, geometry, bbox, identifiers, sources, versionHash,
        sourceReleaseId, snapshotId, isCurrent, createdAt, updatedAt
      ) VALUES (
        'historic-address', 'historic-complex', 'hk', '{"type":"Point","coordinates":[114.1,22.3]}',
        '[114.1,22.3,114.1,22.3]', '{"source":"historic"}',
        '{"hkgov-dpo":[{"record_id":"historic"}]}', 'historic-address-v1',
        'historic-release', 'address-snapshot-2025', 0, '${TIMESTAMP}', '${TIMESTAMP}'
      );
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
          snapshotId: 'address-snapshot-2025',
        }),
        i18n: {
          en: expect.objectContaining({ formattedAddress: '1 Historic Road' }),
        },
      }),
    ])
  } finally {
    meta.close()
    history.close()
  }
})
