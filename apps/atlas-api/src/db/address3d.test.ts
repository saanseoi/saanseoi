import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { historySchema, type CurrentDatabase, type HistoryDatabase } from '@repo/db'
import { createLocalHarbourDb } from '../../../../libs/core/src/testing/localDb'
import { loadMigrationSql } from '../../../../libs/core/src/testing/metaFixtures'
import { attachAddress3dCoverage, getAddress3dCollection } from './address3d'
import type { AddressRecord } from './addresses'

test('historical unit reads replay the selected owner coverage and ignore newer current content', async () => {
  const meta = new Database(':memory:')
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  try {
    for (const [database, family] of [
      [current, 'current'],
      [history, 'history'],
    ] as const)
      database.exec(
        loadMigrationSql(resolve(import.meta.dir, '../../../../libs/db/migrations'), [
          family,
        ]).replaceAll('--> statement-breakpoint', ''),
      )
    meta.exec(`CREATE TABLE snapshots (id TEXT, parentSnapshotId TEXT);
      INSERT INTO snapshots VALUES ('old',NULL),('new','old'),('removed','new');
      CREATE TABLE dataShards (id TEXT,bindingName TEXT);
      INSERT INTO dataShards VALUES ('history','history');
      CREATE TABLE snapshotShardAssignments (snapshotId TEXT,dataShardId TEXT);
      INSERT INTO snapshotShardAssignments VALUES ('old','history'),('new','history'),('removed','history');`)
    const currentDb = drizzle({
      client: current,
    }) as unknown as CurrentDatabase
    const historyDb = drizzle({
      client: history,
    }) as unknown as HistoryDatabase
    const context = {
      currentDb,
      metaDb: createLocalHarbourDb(meta),
      historyDbsByBinding: { history: historyDb },
    }
    const units = [
      {
        id: 'stable-unit',
        unitRef: '001',
        unitType: 'F' as const,
        floorRef: 'G',
        floorType: 'G' as const,
        unitPortion: null,
      },
    ]
    for (const snapshotId of ['old', 'new']) {
      const locales = {
        en: {
          'stable-unit': {
            unitExpression: snapshotId === 'old' ? 'FLAT 001' : 'FLAT 001 NEW',
            floorExpression: 'G/F',
          },
        },
        'zh-hant': {
          'stable-unit': { unitExpression: '001室', floorExpression: 'G樓' },
        },
      }
      const version = {
        snapshotId,
        versionHash: `hash-${snapshotId}`,
        sourceReleaseId: 'release',
        isCurrent: true,
      }
      await historyDb
        .insert(historySchema.address3d)
        .values({
          ...version,
          id: 'collection',
          address2dId: 'building',
          units,
          unitCount: 1,
          contentHash: `content-${snapshotId}`,
          unresolvedSectionIds: snapshotId === 'old' ? ['section'] : [],
        })
        .run()
      for (const [locale, units] of Object.entries(locales))
        await historyDb
          .insert(historySchema.address3dI18n)
          .values({ ...version, address3dId: 'collection', locale, units })
          .run()
      for (const [recordType, locale] of [
        ['address3d', ''],
        ['address3dI18n', 'en'],
        ['address3dI18n', 'zh-hant'],
      ] as const)
        await historyDb
          .insert(historySchema.snapshotVersionChanges)
          .values({
            snapshotId,
            versionHash: version.versionHash,
            sourceReleaseId: 'release',
            recordType,
            locale,
            recordId: 'collection',
            operation: 'upsert',
          })
          .run()
    }
    const records = ['old', 'new'].map(snapshotId => ({
      address: { id: 'section', parentAddressId: 'building', snapshotId },
      i18n: [],
    })) as unknown as AddressRecord[]
    await attachAddress3dCoverage({ ...context, records })
    expect(records[0]?.address3dCoverage).toEqual({
      kind: 'ancestor',
      ownerAddress2dId: 'building',
      address3dId: 'collection',
      membership: 'unresolved',
    })
    expect(records[1]?.address3dCoverage).toEqual({ kind: 'none' })
    const old = await getAddress3dCollection({
      ...context,
      snapshotId: 'old',
      collectionId: 'collection',
    })
    const newer = await getAddress3dCollection({
      ...context,
      snapshotId: 'new',
      collectionId: 'collection',
    })
    expect(
      old?.i18n.find(row => row.locale === 'en')?.units['stable-unit']?.unitExpression,
    ).toBe('FLAT 001')
    expect(
      newer?.i18n.find(row => row.locale === 'en')?.units['stable-unit']
        ?.unitExpression,
    ).toBe('FLAT 001 NEW')
    expect(old?.collection.units[0]?.id).toBe(newer?.collection.units[0]?.id)
    history.exec(
      `INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,operation,createdAt,updatedAt) VALUES ('removed','address3d','collection','','delete','now','now');`,
    )
    expect(
      await getAddress3dCollection({
        ...context,
        snapshotId: 'removed',
        collectionId: 'collection',
      }),
    ).toBeNull()
    expect(
      await getAddress3dCollection({
        currentDb,
        metaDb: context.metaDb,
        snapshotId: 'old',
        collectionId: 'collection',
      }),
    ).toBeNull()
    expect(
      current
        .query(
          "SELECT name FROM pragma_index_list('address3d') WHERE name='address3d_snapshot_owner_unique' AND [unique]=1",
        )
        .get(),
    ).not.toBeNull()
  } finally {
    meta.close()
    current.close()
    history.close()
  }
})
