import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import {
  metaDatasets,
  metaResourceReleases,
  metaSourceReleases,
  metaSnapshotResourceReleases,
} from '@repo/db'
import { loadProvenanceSources } from './provenanceSources'

test('preprocessing releases require the exact pinned snapshot, owner and source-selection rule', async () => {
  const sqlite = new Database(':memory:')
  try {
    for (const table of [
      metaDatasets,
      metaResourceReleases,
      metaSourceReleases,
      metaSnapshotResourceReleases,
    ]) {
      const config = getTableConfig(table)
      sqlite.exec(
        `CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
      )
    }
    sqlite.exec(`INSERT INTO datasets(id,code) VALUES ('d','source');
      INSERT INTO sourceReleases(id,datasetId,code) VALUES ('owner','d','reviewed'),('exact','d','frozen'),('future','d','future'),('other','d','other');
      INSERT INTO resourceReleases(id,datasetId,sourceReleaseId,code,sourceVersion,resourceType) VALUES ('owner','d','owner','reviewed::division','v1','division'),('exact','d','exact','frozen::division','v1','division'),('future','d','future','future::division','v2','division'),('other','d','other','other::division','v1','division');
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
