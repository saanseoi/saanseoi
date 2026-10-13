import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { currentSchema, historySchema, metaSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { releaseFixtureSchemaSql } from '../../../../../../libs/core/src/testing/releaseFixtures'
import { assertDivisionReferences } from './processLocalDivisionGeometrySqlUploadReferences'
import type { GeometryUploadPlan } from './processLocalDivisionGeometrySqlUploadTypes'

test('historical C&SD geometry validates against later SaanSeoi history without replacing current Divisions', async () => {
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
      INSERT INTO publishers(id,code,versionHash) VALUES('saanseoi','saanseoi','hash');
      INSERT INTO datasets(id,publisherId,code,regionCode,releaseType,releaseFrequency,theme,versionHash)
        VALUES('divisions','saanseoi','ds-hk-saanseoi-division','hk','versioned','monthly','divisions','hash');

      INSERT INTO snapshotLineages(id,code,regionCode,resourceType,variant,identityMode,versionHash)
        VALUES('lineage','saanseoi','hk','division','saanseoi','persistent','hash');
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('lineage','lineage','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='lineage' AND resourceType IS NULL;
INSERT INTO snapshots(id, snapshotLineageId, parentSnapshotId, code, cohortKey, status) VALUES
('early', 'lineage', NULL, 'saanseoi-2025', '2025-01-01.0', 'published'),
('complete', 'lineage', 'early', 'saanseoi-2026-01', '2026-01-01.0', 'published'),
('latest', 'lineage', 'complete', 'saanseoi-2026-08', '2026-08-19.0', 'published');
INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,cohortKey,status) VALUES ('source-2025','divisions','source-2025','2025','2025','current');
INSERT INTO resourceReleases(id,sourceReleaseId,code,resourceType,status) VALUES ('release-2025','source-2025','release-2025','division','current');
INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,cohortKey,status) VALUES ('source-2026-01','divisions','source-2026-01','2026-01','2026-01','current');
INSERT INTO resourceReleases(id,sourceReleaseId,code,resourceType,status) VALUES ('release-2026-01','source-2026-01','release-2026-01','division','current');
INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,cohortKey,status) VALUES ('source-2026-08','divisions','source-2026-08','2026-08','2026-08','current');
INSERT INTO resourceReleases(id,sourceReleaseId,code,resourceType,status) VALUES ('release-2026-08','source-2026-08','release-2026-08','division','current');
      INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,role) VALUES
        ('early','release-2025','primary'),
        ('complete','release-2026-01','primary'),
        ('latest','release-2026-08','primary');
      INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash) VALUES
        ('history-2025','history','hk','2025','preview','history-2025','history-2025','DB_HISTORY_HK_2025','active','hash'),
        ('history-2026','history','hk','2026','preview','history-2026','history-2026','DB_HISTORY_HK_2026','active','hash');
      INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES
        ('early','history-2025'),('complete','history-2026'),('latest','history-2026');`)
    current.exec(`INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt)
        VALUES('lineage','latest','current','latest-release','ready');
      INSERT INTO divisions(scopeId,id,class,hierarchies)
        VALUES('lineage','current-only','district','{"full":[],"administrative":[],"locality":[]}');`)
    history2025.exec(`INSERT INTO divisions(id,versionHash,snapshotId,sourceReleaseId,isCurrent,class,hierarchies)
        VALUES('hong-kong-island','v1','early','release-2025',0,'district','{"full":[],"administrative":[],"locality":[]}');
      `)
    history2026.exec(`INSERT INTO divisions(id,versionHash,snapshotId,sourceReleaseId,isCurrent,class,hierarchies) VALUES
        ('kowloon','v1','complete','release-2026-01',0,'district','{"full":[],"administrative":[],"locality":[]}'),
        ('new-territories','v1','complete','release-2026-01',0,'district','{"full":[],"administrative":[],"locality":[]}');
      `)

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
          source_record_id: `CENSTATD:${id}`,
          source_assertion_geometry: geometry,
          division_id: id,
          source_properties: { name: id },
          source_geometry: geometry,
          geometry,
        },
        'hkgov-censtatd',
        {
          datasetCode:
            'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
        },
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
        currentDb as never,
        historyTargets,
        metaDb as never,
        plan,
        rows,
      ),
    ).toEqual({
      id: 'complete',
      selectedByRule: 'lookup:censtatd-living-quarters:saanseoi-division-references:v1',
      selectionMode: 'nearest_snapshot_containing_references',
    })
    expect(current.query('SELECT total_changes() AS count').get()).toEqual(
      changesBefore,
    )
    expect(current.query('SELECT scopeId,id FROM divisions').all()).toEqual([
      { scopeId: 'lineage', id: 'current-only' },
    ])
    // An Overture inventory cannot satisfy the SaanSeoi-only area dependency.
    meta.exec("UPDATE publishers SET code='overture'")
    await expect(
      assertDivisionReferences(
        currentDb as never,
        currentDb as never,
        historyTargets,
        metaDb as never,
        plan,
        rows,
      ),
    ).rejects.toThrow('No published canonical SaanSeoi division snapshot')
  } finally {
    current.close()
    meta.close()
    before.close()
    history2025.close()
    history2026.close()
  }
})

test('curated references use edition validity, including unchanged records and excluding retired or future records', async () => {
  const meta = new Database(':memory:')
  const source = new Database(':memory:')
  try {
    meta.exec(`${releaseFixtureSchemaSql()};
      CREATE TABLE snapshotResourceReleases(snapshotId TEXT, resourceReleaseId TEXT, role TEXT);
      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES (coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-10-01.0'), 'source-' || 'new-release'), 'fixture', 'source-' || 'new-release', '2026-10-01.0', 'current');
UPDATE sourceReleases SET sourceVersion = '2026-10-01.0' WHERE id = coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-10-01.0'), 'source-' || 'new-release');
INSERT INTO resourceReleases (id, sourceReleaseId, code, resourceType, status) VALUES ('new-release', coalesce((SELECT id FROM sourceReleases WHERE datasetId = 'fixture' AND sourceVersion = '2026-10-01.0'), 'source-' || 'new-release'), 'new-release', 'division', 'current');
      INSERT INTO snapshotResourceReleases VALUES('snapshot','new-release','primary');`)
    source.exec(`CREATE TABLE ssDivision(sourceRecordId TEXT, resourceReleaseId TEXT, validFromRelease TEXT, validToRelease TEXT);
      INSERT INTO ssDivision VALUES
        ('unchanged','old-release','2026-09-01.0',NULL),
        ('added','new-release','2026-10-01.0',NULL),
        ('retired','old-release','2026-09-01.0','2026-10-01.0'),
        ('future','future-release','2026-11-01.0',NULL),
        ('later-retired','old-release','2026-09-01.0','2026-11-01.0');`)
    const { readCuratedDivisionSourceIds } = await import(
      './processLocalDivisionGeometrySqlUploadReferences'
    )
    const ids = await readCuratedDivisionSourceIds(
      drizzle({ client: source }) as never,
      drizzle({ client: meta }) as never,
      'snapshot',
    )
    expect([...ids].sort()).toEqual(['added', 'later-retired', 'unchanged'])
  } finally {
    meta.close()
    source.close()
  }
})

test('fresh Planning area publication retains cell evidence in current and history', async () => {
  const { writeGeometryRows } = await import(
    './processLocalDivisionGeometrySqlUploadRows'
  )
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  try {
    for (const [db, family] of [
      [current, 'current'],
      [history, 'history'],
    ] as const)
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          [family],
        ),
      )
    const row = normaliseDivisionAreaGeometryRow(
      {
        id: 'PLAND:area',
        division_id: 'planning-division',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [114, 22],
              [115, 22],
              [115, 23],
              [114, 22],
            ],
          ],
        },
        source_cell_ids: JSON.stringify(['PLAND:323:20', 'PLAND:323:21']),
      },
      'hkgov-pland-pu',
    )
    if (!row) throw new Error('Expected a Planning area.')
    await writeGeometryRows(
      {
        currentDb: drizzle({ client: current, schema: currentSchema }),
        historyDb: drizzle({ client: history, schema: historySchema }),
      } as never,
      'divisionArea',
      [row],
      {
        source: 'hkgov-pland-pu',
        variant: 'hkgov-pland-pu',
        resourceReleaseId: 'release',
        releaseCode: 'planning-2006',
        sourceVersion: '2006',
        snapshotId: 'snapshot',
        snapshotLineageId: 'lineage',
        parentSnapshotId: null,
        cohortKey: '2006',
      },
    )
    for (const db of [current, history]) {
      const retained = db.query('SELECT sources FROM divisionAreas').get() as {
        sources: string
      }
      expect(JSON.parse(retained.sources)).toEqual(row.canonical.sources)
    }
  } finally {
    current.close()
    history.close()
  }
})
