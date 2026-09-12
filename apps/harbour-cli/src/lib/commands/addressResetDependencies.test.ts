import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures.ts'
import { officialAddressResetDependencyBlockers } from './addressResetDependencies.ts'

function fixture() {
  let maxParameters = 0
  const open = (family: string) => {
    const sqlite = new Database(':memory:')
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
        family,
      ]),
    )
    return sqlite
  }
  const meta = open('meta')
  const current = open('current')
  const history = open('history')
  const wrap = (sqlite: Database) =>
    drizzle({
      client: sqlite,
      logger: {
        logQuery(_query, parameters) {
          maxParameters = Math.max(maxParameters, parameters.length)
        },
      },
    }) as never
  const context = {
    metaDb: wrap(meta),
    currentDb: wrap(current),
    historyTargets: [{ bindingName: 'history', db: wrap(history) }],
  }
  const owned = {
    snapshotIds: Array.from({ length: 205 }, (_, i) => `address-${i}`),
    releaseIds: ['als-release'],
    apiReleaseSetIds: ['addresses'],
  }
  return {
    meta,
    current,
    history,
    context,
    owned,
    maxParameters: () => maxParameters,
    close() {
      meta.close()
      current.close()
      history.close()
    },
  }
}

test('Address full reset protects logical Places history even after current Address cleanup', async () => {
  const f = fixture()
  try {
    expect(await officialAddressResetDependencyBlockers(f.context, f.owned)).toEqual([])
    f.history.exec(`INSERT INTO places(id,versionHash,sourceReleaseId,releaseId,isCurrent,snapshotId,addressSnapshotId,lng,lat,firstSeenMonth,lastSeenMonth)
      VALUES ('place','hash','place-release','place-release',1,'place-history','address-204',114,22,'2025-01','2025-01')`)
    expect(await officialAddressResetDependencyBlockers(f.context, f.owned)).toEqual([
      'history: Places retain exact official Address dependencies',
    ])
    expect(f.maxParameters()).toBeLessThanOrEqual(4)
  } finally {
    f.close()
  }
})

test('Address full reset protects exact lookup metadata and external API/source selections', async () => {
  const f = fixture()
  try {
    f.meta.exec(`
      INSERT INTO snapshotAssembly(id,code,resourceType,version,status,versionHash) VALUES ('assembly','assembly','place',1,'scoped','hash');
      INSERT INTO snapshotAssemblyRuns(id,snapshotId,snapshotAssemblyId,status,selectionSummaryJson)
        VALUES ('lookup','place','assembly','selected','{"lookupSnapshotIds":{"address":"address-204"}}');
    `)
    expect(await officialAddressResetDependencyBlockers(f.context, f.owned)).toEqual([
      'Other snapshots retain official Address assembly dependencies',
    ])
    f.meta.exec(`
      INSERT INTO snapshotSources(snapshotId,datasetId,resourceReleaseId,role,selectedByRule,selectionMode)
        VALUES ('place','als','als-release','lookup','rule','exact_ref');
      INSERT INTO apiReleaseSetSnapshots(apiReleaseSetId,snapshotId,role,variant,cohortMatchingMode,isRequired)
        VALUES ('places','address-204','lookup','default','exact',1);
    `)
    expect(await officialAddressResetDependencyBlockers(f.context, f.owned)).toEqual([
      'Other snapshots retain official Address source dependencies',
      'Other API families retain official Address snapshots',
      'Other snapshots retain official Address assembly dependencies',
    ])
    expect(f.maxParameters()).toBeLessThanOrEqual(4)
  } finally {
    f.close()
  }
})
