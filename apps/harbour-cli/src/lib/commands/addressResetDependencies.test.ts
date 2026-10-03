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
    f.history.exec(`INSERT INTO places(id,versionHash,sourceReleaseId,resourceReleaseId,isCurrent,snapshotId,addressSnapshotId,lng,lat,firstSeenMonth,lastSeenMonth)
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
      INSERT INTO snapshots(id,code,resourceType,cohortKey,status) VALUES ('place','place','place','2026','draft'),('address-204','address-204','address','2026','published');
      INSERT INTO publishers(id,code,versionHash) VALUES ('publisher','publisher','hash');
      INSERT INTO datasets(id,publisherId,code,regionCode,releaseType,releaseFrequency,theme,versionHash) VALUES ('als','publisher','als','hk','snapshot','daily','address','hash');
      INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,cohortKey,status) VALUES ('als-source','als','als-source','2026','2026','current');
      INSERT INTO resourceReleases(id,sourceReleaseId,datasetId,resourceType,code,sourceVersion,cohortKey,status) VALUES ('als-release','als-source','als','address','als-release','2026','2026','current');
      INSERT INTO apiVersions(id,code,familyType,version,status,versionHash) VALUES ('places-api','places-api','places','v0','current','hash');
      INSERT INTO apiReleaseSets(id,apiVersionId,code,schemaVersion,rulesetVersion,status,versionHash) VALUES ('places','places-api','places','v1','v1','current','hash');
      INSERT INTO snapshotRecipes(id,code,resourceType,version,versionHash) VALUES ('assembly','assembly','place',1,'hash');
      INSERT INTO snapshotDependencies(snapshotId,dependencySnapshotId,role) VALUES ('place','address-204','address');
    `)
    expect(await officialAddressResetDependencyBlockers(f.context, f.owned)).toEqual([
      'Other snapshots retain official Address assembly dependencies',
    ])
    f.meta.exec(`
      INSERT INTO snapshotResourceReleases(snapshotId,datasetId,resourceReleaseId,role,selectedByRule,selectionMode)
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
