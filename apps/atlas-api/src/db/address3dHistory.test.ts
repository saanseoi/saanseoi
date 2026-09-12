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
    meta.exec(`INSERT INTO snapshots(id,resourceType,code,cohortKey,status,parentSnapshotId)
      VALUES ('one','address','one','2025-09','published',NULL),
        ('two','address','two','2026-09','published','one');
      INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash)
      VALUES ('old','history','hk','2025','preview','old','old','DB_HISTORY_HK_2025','active','old'),
        ('new','history','hk','2026','preview','new','new','DB_HISTORY_HK_2026','active','new');
      INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES ('one','old'),('two','new');`)
    earlier.exec(`INSERT INTO address3d(id,address2dId,units,unitCount,contentHash,unresolvedSectionIds,versionHash,sourceReleaseId,snapshotId,isCurrent)
      VALUES ('collection','building','[]',0,'inventory','[]','base-hash','release-one','one',1);
      INSERT INTO address3dI18n(address3dId,locale,units,versionHash,sourceReleaseId,snapshotId,isCurrent)
      VALUES ('collection','en','{"unit":{"unitExpression":"Unit 1","floorExpression":""}}','english-hash','release-one','one',1),
        ('collection','zh-hant','{"unit":{"unitExpression":"舊室","floorExpression":""}}','old-chinese','release-one','one',0);
      INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId)
      VALUES ('one','address3d','collection','','base-hash','upsert','release-one'),
        ('one','address3dI18n','collection','en','english-hash','upsert','release-one'),
        ('one','address3dI18n','collection','zh-hant','old-chinese','upsert','release-one');`)
    later.exec(`INSERT INTO address3dI18n(address3dId,locale,units,versionHash,sourceReleaseId,snapshotId,isCurrent)
      VALUES ('collection','zh-hant','{"unit":{"unitExpression":"新室","floorExpression":""}}','chinese-hash','release-two','two',1);
      INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId)
      VALUES ('two','address3dI18n','collection','zh-hant','chinese-hash','upsert','release-two');`)
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
    later.exec("DELETE FROM address3dI18n WHERE versionHash = 'chinese-hash'")
    await expect(getAddress3dCollection(args)).rejects.toThrow('absent zh-hant content')
  } finally {
    meta.close()
    earlier.close()
    later.close()
  }
})
