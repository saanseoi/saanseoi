import { releaseFixtureSchemaSql } from '../../../../../libs/core/src/testing/releaseFixtures'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { metaDatasets, metaSnapshotResourceReleases } from '@repo/db'
import { loadProvenanceSources } from './provenanceSources'

test('preprocessing releases require the exact pinned snapshot, owner and source-selection rule', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(releaseFixtureSchemaSql())
    for (const table of [metaDatasets, metaSnapshotResourceReleases]) {
      const config = getTableConfig(table)
      sqlite.exec(
        `CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
      )
    }
    sqlite.exec(`INSERT INTO datasets(id,code) VALUES ('d','source');
      INSERT INTO sourceReleases(id,datasetId,code) VALUES ('owner','d','reviewed'),('exact','d','frozen'),('future','d','future'),('other','d','other');
      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('owner', 'd', 'source-' || 'reviewed::division', 'v1', 'current');
UPDATE sourceReleases SET datasetId = 'd', sourceVersion = 'v1' WHERE id = 'owner';
INSERT INTO resourceReleases (id, sourceReleaseId, code, resourceType, status) VALUES ('owner', 'owner', 'reviewed::division', 'division', 'current');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('exact', 'd', 'source-' || 'frozen::division', 'v1', 'current');
UPDATE sourceReleases SET datasetId = 'd', sourceVersion = 'v1' WHERE id = 'exact';
INSERT INTO resourceReleases (id, sourceReleaseId, code, resourceType, status) VALUES ('exact', 'exact', 'frozen::division', 'division', 'current');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('future', 'd', 'source-' || 'future::division', 'v2', 'current');
UPDATE sourceReleases SET datasetId = 'd', sourceVersion = 'v2' WHERE id = 'future';
INSERT INTO resourceReleases (id, sourceReleaseId, code, resourceType, status) VALUES ('future', 'future', 'future::division', 'division', 'current');
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('other', 'd', 'source-' || 'other::division', 'v1', 'current');
UPDATE sourceReleases SET datasetId = 'd', sourceVersion = 'v1' WHERE id = 'other';
INSERT INTO resourceReleases (id, sourceReleaseId, code, resourceType, status) VALUES ('other', 'other', 'other::division', 'division', 'current');
      INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,anchorReleaseId,selectedByRule,selectionMode) VALUES
      ('snapshot','exact','owner','provenance:curated-division:build-inputs:v1','exact_ref'),
      ('future-snapshot','future','owner','provenance:curated-division:build-inputs:v1','exact_ref'),
      ('snapshot','other','different-owner','provenance:curated-division:build-inputs:v1','exact_ref');`)
    const result = await loadProvenanceSources(
      drizzle({ client: sqlite }) as never,
      {
        scopes: [
          { scopeId: 'source', resourceReleaseId: 'owner' },
          { scopeId: 'raw', resourceReleaseId: 'owner' },
          { scopeId: 'snapshot', snapshotId: 'snapshot' },
        ],
      } as never,
    )
    expect(result.source?.map(source => source.releaseCode)).toEqual([
      'reviewed',
      'frozen',
    ])
    expect(result.raw).toEqual(result.source)
  } finally {
    sqlite.close()
  }
})
