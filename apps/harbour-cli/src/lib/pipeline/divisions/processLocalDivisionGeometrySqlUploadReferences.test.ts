import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, metaSchema } from '@repo/db'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { assertDivisionReferences } from './processLocalDivisionGeometrySqlUploadReferences'
import type { GeometryUploadPlan } from './processLocalDivisionGeometrySqlUploadTypes'

test('historical C&SD geometry validates against later Overture history without replacing current Divisions', async () => {
  const current = new Database(':memory:')
  const meta = new Database(':memory:')
  const before = new Database(':memory:')
  const history2025 = new Database(':memory:')
  const history2026 = new Database(':memory:')
  try {
    for (const [db, family] of [
      [current, 'current'],
      [meta, 'meta'],
      [before, 'history'],
      [history2025, 'history'],
      [history2026, 'history'],
    ] as const)
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          [family],
        ),
      )
    meta.exec(`PRAGMA foreign_keys = OFF;
      INSERT INTO publishers(id,code,versionHash) VALUES('overture','overture','hash');
      INSERT INTO datasets(id,publisherId,code,regionCode,releaseType,releaseFrequency,theme,versionHash)
        VALUES('divisions','overture','ds-hk-overture-division','hk','versioned','monthly','divisions','hash');
      INSERT INTO snapshotLineages(id,code,regionCode,resourceType,variant,identityMode,versionHash)
        VALUES('lineage','overture','hk','division','overture','persistent','hash');
      INSERT INTO snapshots(id,snapshotLineageId,parentSnapshotId,resourceType,code,cohortKey,status) VALUES
        ('early','lineage',NULL,'division','overture-2025','2025-01-01.0','published'),
        ('complete','lineage','early','division','overture-2026-01','2026-01-01.0','published'),
        ('latest','lineage','complete','division','overture-2026-08','2026-08-19.0','published');
      INSERT INTO snapshotSources(snapshotId,datasetId,resourceReleaseId,role) VALUES
        ('early','divisions','release-2025','primary'),
        ('complete','divisions','release-2026-01','primary'),
        ('latest','divisions','release-2026-08','primary');
      INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash) VALUES
        ('history-2025','history','hk','2025','preview','history-2025','history-2025','DB_HISTORY_HK_2025','active','hash'),
        ('history-2026','history','hk','2026','preview','history-2026','history-2026','DB_HISTORY_HK_2026','active','hash');
      INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES
        ('early','history-2025'),('complete','history-2026'),('latest','history-2026');`)
    current.exec(`INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt)
        VALUES('lineage','latest','current','latest-release','ready');
      INSERT INTO divisions(snapshotId,id,class,hierarchies)
        VALUES('lineage','current-only','district','{"full":[],"administrative":[],"locality":[]}');`)
    history2025.exec(`INSERT INTO divisions(id,versionHash,snapshotId,sourceReleaseId,isCurrent,class,hierarchies)
        VALUES('hong-kong-island','v1','early','release-2025',0,'district','{"full":[],"administrative":[],"locality":[]}');
      INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId)
        VALUES('early','division','hong-kong-island','','v1','upsert','release-2025');`)
    history2026.exec(`INSERT INTO divisions(id,versionHash,snapshotId,sourceReleaseId,isCurrent,class,hierarchies) VALUES
        ('kowloon','v1','complete','release-2026-01',0,'district','{"full":[],"administrative":[],"locality":[]}'),
        ('new-territories','v1','complete','release-2026-01',0,'district','{"full":[],"administrative":[],"locality":[]}');
      INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId) VALUES
        ('complete','division','kowloon','','v1','upsert','release-2026-01'),
        ('complete','division','new-territories','','v1','upsert','release-2026-01');`)

    const plan: GeometryUploadPlan = {
      cohortKey: '2023-H2',
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
      regionCode: 'hk',
      releaseCode: 'censtatd-2023-H2::divisionArea',
      rowCount: 3,
      source: 'hkgov-censtatd',
      sourceVersion: '2023-H2',
      theme: 'divisions',
      resourceType: 'divisionArea',
    }
    const rows = ['hong-kong-island', 'kowloon', 'new-territories'].map(id => {
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [114, 22],
            [115, 22],
            [115, 23],
            [114, 22],
          ],
        ],
      }
      const row = normaliseDivisionAreaGeometryRow(
        {
          id: `CENSTATD:${id}`,
          division_id: id,
          source_properties: { name: id },
          source_geometry: geometry,
          geometry,
        },
        'hkgov-censtatd',
      )
      if (!row) throw new Error(`Invalid geometry fixture: ${id}`)
      return row
    })
    const currentDb = drizzle({ client: current, schema: currentSchema })
    const metaDb = drizzle({ client: meta, schema: metaSchema })
    const historyTargets = [
      { bindingName: 'DB_HISTORY_HK_BEFORE', db: before },
      { bindingName: 'DB_HISTORY_HK_2025', db: history2025 },
      { bindingName: 'DB_HISTORY_HK_2026', db: history2026 },
    ].map(target => ({
      bindingName: target.bindingName,
      db: drizzle({ client: target.db, schema: historySchema }) as never,
    }))
    const changesBefore = current.query('SELECT total_changes() AS count').get()
    await expect(
      assertDivisionReferences(
        currentDb as never,
        historyTargets.slice(0, 1),
        metaDb as never,
        plan,
        rows,
      ),
    ).rejects.toThrow(
      'Snapshot early requires unavailable history binding DB_HISTORY_HK_2025.',
    )
    expect(
      await assertDivisionReferences(
        currentDb as never,
        historyTargets,
        metaDb as never,
        plan,
        rows,
      ),
    ).toEqual({
      id: 'complete',
      selectedByRule: 'api-composition:divisions:censtatd-area-type->overture-division',
      selectionMode: 'nearest_snapshot_containing_references',
    })
    expect(current.query('SELECT total_changes() AS count').get()).toEqual(
      changesBefore,
    )
    expect(current.query('SELECT snapshotId,id FROM divisions').all()).toEqual([
      { snapshotId: 'lineage', id: 'current-only' },
    ])
  } finally {
    current.close()
    meta.close()
    before.close()
    history2025.close()
    history2026.close()
  }
})
