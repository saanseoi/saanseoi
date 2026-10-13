import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../testing/localDb'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { reconcilePublishedApiCatalogs } from './metaRegistry'

test('reconciliation adds deferred cohorts to a new immutable catalogue and is idempotent', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), ['meta']),
    )
    sqlite.exec(`PRAGMA foreign_keys = OFF;
      INSERT INTO apiVersions (id,code,familyType,version,status,versionHash)
        VALUES ('api','api-divisions-v0.2','divisions','0.2','current','hash');
      INSERT INTO apiComposition (id,apiVersionId,code,version,primaryResourceType,defaultDomainCode,status,versionHash)
        VALUES ('composition','api','composition',1,'division','planning','current','hash');`)
    for (const [year, status] of [
      ['2001', 'archived'],
      ['2021', 'current'],
      ['2026', 'draft'],
    ]) {
      sqlite
        .query(`INSERT INTO apiReleaseSets (id,code,regionCode,domainCode,cohortKey,schemaVersion,rulesetVersion,versionHash)
        VALUES (?,?,'hk','planning',?,'1','1','hash')`)
        .run(year!, year!, year!)
      sqlite
        .query(`INSERT INTO apiVersionReleaseSets (id,apiVersionId,apiReleaseSetId,apiCompositionId,status,versionHash)
        VALUES (?,'api',?,'composition',?,'hash')`)
        .run(year!, year!, status!)
    }
    sqlite.exec(`INSERT INTO apiCatalogRevisions (id,apiVersionId,code,regionCode,publicationDate,revision,defaultDomainCode,status,versionHash,publishedAt)
      VALUES ('old','api','old','hk','2020-01-01',0,'planning','current','hash','2020-01-01T00:00:00Z');
      INSERT INTO apiCatalogRevisionReleaseSets (apiCatalogRevisionId,apiVersionReleaseSetId,domainCode,cohortKey,isDefault)
      VALUES ('old','2001','planning','2001',1);`)
    const db = createLocalHarbourDb(sqlite)
    const before = sqlite.query('SELECT * FROM apiVersionReleaseSets ORDER BY id').all()
    await reconcilePublishedApiCatalogs(db, {
      apiFamily: 'divisions',
      regionCode: 'hk',
    })
    expect(
      sqlite
        .query(`SELECT m.cohortKey,m.isDefault FROM apiCatalogRevisionReleaseSets m
      JOIN apiCatalogRevisions c ON c.id=m.apiCatalogRevisionId WHERE c.status='current' ORDER BY m.cohortKey`)
        .all(),
    ).toEqual([
      { cohortKey: '2001', isDefault: 0 },
      { cohortKey: '2021', isDefault: 1 },
    ])
    expect(
      sqlite
        .query(
          "SELECT cohortKey,isDefault FROM apiCatalogRevisionReleaseSets WHERE apiCatalogRevisionId='old'",
        )
        .all(),
    ).toEqual([{ cohortKey: '2001', isDefault: 1 }])
    expect(
      sqlite.query('SELECT * FROM apiVersionReleaseSets ORDER BY id').all(),
    ).toEqual(before)
    await reconcilePublishedApiCatalogs(db, {
      apiFamily: 'divisions',
      regionCode: 'hk',
    })
    expect(sqlite.query('SELECT count(*) AS n FROM apiCatalogRevisions').get()).toEqual(
      { n: 2 },
    )
  } finally {
    sqlite.close()
  }
})
