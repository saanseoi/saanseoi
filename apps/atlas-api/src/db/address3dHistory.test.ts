import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../libs/core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '../../../../libs/core/src/testing/localDb'
import { getAddress3dCollection } from './address3d'

test('Address3D replay loads each locale from its own retained hash and history shard', async () => {
  const meta = new Database(':memory:')
  const earlier = new Database(':memory:')
  const later = new Database(':memory:')
  try {
    const migrations = resolve(import.meta.dir, '../../../../libs/db/migrations')
    meta.exec(loadMigrationSql(migrations, ['meta']))
    for (const db of [earlier, later])
      db.exec(loadMigrationSql(migrations, ['history']))
    meta.exec(`INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'one','fixture-lineage-' || 'one','address','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='address' WHERE id='fixture-lineage-' || 'one' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'two','fixture-lineage-' || 'two','address','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='address' WHERE id='fixture-lineage-' || 'two' AND resourceType IS NULL;
INSERT INTO snapshots(id, snapshotLineageId, code, cohortKey, status, parentSnapshotId) VALUES
('one', 'fixture-lineage-' || 'one', 'one', '2025-09', 'published', NULL),
('two', 'fixture-lineage-' || 'two', 'two', '2026-09', 'published', 'one');
      INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash)
      VALUES ('old','history','hk','2025','preview','old','old','DB_HISTORY_HK_2025','active','old'),
        ('new','history','hk','2026','preview','new','new','DB_HISTORY_HK_2026','active','new');
      INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES ('one','old'),('two','new');`)
    earlier.exec(`INSERT INTO address3d(id,address2dId,units,unitCount,contentHash,unresolvedSectionIds,versionHash,sourceReleaseId,snapshotId,isCurrent)
      VALUES ('collection','building','[]',0,'inventory','[]','base-hash','release-one','one',1);
      INSERT INTO address3dI18n(address3dId,locale,units,versionHash,sourceReleaseId,snapshotId,isCurrent)
      VALUES ('collection','en','{"unit":{"unitExpression":"Unit 1","floorExpression":""}}','english-hash','release-one','one',1),
        ('collection','zh-hant','{"unit":{"unitExpression":"舊室","floorExpression":""}}','old-chinese','release-one','one',0);`)
    later.exec(`INSERT INTO address3dI18n(address3dId,locale,units,versionHash,sourceReleaseId,snapshotId,isCurrent)
      VALUES ('collection','zh-hant','{"unit":{"unitExpression":"新室","floorExpression":""}}','chinese-hash','release-two','two',1);`)
    const args = {
      currentDb: {} as never,
      metaDb: createLocalHarbourDb(meta),
      historyDbsByBinding: {
        DB_HISTORY_HK_2025: createLocalHarbourDb(earlier) as never,
        DB_HISTORY_HK_2026: createLocalHarbourDb(later) as never,
      },
      snapshotId: 'two',
      collectionId: 'collection',
    }
    const result = await getAddress3dCollection(args)
    expect(result?.collection).toEqual(
      expect.objectContaining({ versionHash: 'base-hash' }),
    )
    expect(result?.i18n.map(row => ({ locale: row.locale, units: row.units }))).toEqual(
      [
        {
          locale: 'en',
          units: { unit: { unitExpression: 'Unit 1', floorExpression: '' } },
        },
        {
          locale: 'zh-hant',
          units: { unit: { unitExpression: '新室', floorExpression: '' } },
        },
      ],
    )
    later.exec(
      "INSERT INTO address3dI18n(address3dId,locale,snapshotId,operation) VALUES ('collection','en','two','delete')",
    )
    expect((await getAddress3dCollection(args))?.i18n.map(row => row.locale)).toEqual([
      'zh-hant',
    ])
  } finally {
    meta.close()
    earlier.close()
    later.close()
  }
})
