import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import v01 from '../../../../../fixtures/meta/apiCompositions/api-divisions-comp-v1.json'
import v02 from '../../../../../fixtures/meta/apiCompositions/api-divisions-comp-v2.json'
import { resolveDivisionPublicationVersion } from './divisionPublicationVersion'
import { releaseSetVersionsForPublication } from './releaseSetVersions'

const databases: Database[] = []
afterEach(() => {
  for (const sqlite of databases.splice(0)) sqlite.close()
})

function publicationDb() {
  const sqlite = new Database(':memory:')
  databases.push(sqlite)
  sqlite.exec(`
    CREATE TABLE apiVersions(id TEXT PRIMARY KEY,code TEXT,familyType TEXT,version TEXT,status TEXT);
    INSERT INTO apiVersions VALUES
      ('v01','api-divisions-v0.1','divisions','0.1','deprecated'),
      ('v02','api-divisions-v0.2','divisions','0.2','current');
    CREATE TABLE apiReleaseSets(id TEXT PRIMARY KEY,cohortKey TEXT,code TEXT,regionCode TEXT,createdAt TEXT);
    CREATE TABLE apiVersionReleaseSets(apiReleaseSetId TEXT,apiVersionId TEXT,status TEXT);
    CREATE TABLE apiComposition(id TEXT PRIMARY KEY,apiVersionId TEXT,code TEXT,version INTEGER,primaryResourceType TEXT,defaultDomainCode TEXT,status TEXT,createdAt TEXT);
    CREATE TABLE apiCompositionMembers(apiCompositionId TEXT,resourceType TEXT,domainCode TEXT,variant TEXT,role TEXT,isRequired INTEGER,cohortMatchingMode TEXT,maxLagDays INTEGER,priority INTEGER);
  `)
  for (const [id, fixture] of [
    ['v01', v01],
    ['v02', v02],
  ] as const) {
    sqlite
      .query('INSERT INTO apiComposition VALUES(?,?,?,?,?,?,?,?)')
      .run(
        fixture.code,
        id,
        fixture.code,
        fixture.version,
        fixture.primaryResourceType,
        'geographic',
        fixture.status,
        '2026-09-01',
      )
    for (const domain of fixture.domains)
      for (const member of domain.members)
        sqlite
          .query('INSERT INTO apiCompositionMembers VALUES(?,?,?,?,?,?,?,?,?)')
          .run(
            fixture.code,
            member.resourceType,
            domain.code,
            member.variant,
            member.role,
            Number(member.isRequired),
            member.cohortMatchingMode,
            null,
            member.priority,
          )
  }
  return { sqlite, db: createLocalHarbourDb(sqlite) }
}

test('Overture and its geometry publish through deprecated v0.1 while SaanSeoi selects v0.2', async () => {
  const { db } = publicationDb()
  for (const resourceType of ['division', 'divisionArea', 'divisionBoundary'] as const)
    expect(await resolveDivisionPublicationVersion(db, resourceType, 'overture')).toBe(
      'api-divisions-v0.1',
    )
  for (const resourceType of ['division', 'divisionArea'] as const)
    expect(await resolveDivisionPublicationVersion(db, resourceType, 'saanseoi')).toBe(
      'api-divisions-v0.2',
    )
  expect(
    releaseSetVersionsForPublication('division', 'geographic', 'overture')
      .rulesetVersion,
  ).toBe('rs-division-merge-v1')
  expect(
    releaseSetVersionsForPublication('division', 'geographic', 'saanseoi')
      .rulesetVersion,
  ).toBe('rs-division-merge-v2')
})

test('archived versions cannot win inventory selection or pinned reconciliation', async () => {
  const { sqlite, db } = publicationDb()
  sqlite.exec("UPDATE apiVersions SET status='archived' WHERE id='v01'")
  expect(await resolveDivisionPublicationVersion(db, 'division', 'overture')).toBe(
    'api-divisions-v0.2',
  )
  await expect(
    resolveDivisionPublicationVersion(db, 'division', 'overture', 'api-divisions-v0.1'),
  ).rejects.toThrow('not publishable')
})

test('reconciliation retains an explicit API association for a shared government member', async () => {
  const { db } = publicationDb()
  expect(
    await resolveDivisionPublicationVersion(
      db,
      'division',
      'hkgov-landsd',
      'api-divisions-v0.1',
    ),
  ).toBe('api-divisions-v0.1')
  expect(
    await resolveDivisionPublicationVersion(
      db,
      'division',
      'hkgov-landsd',
      'api-divisions-v0.2',
    ),
  ).toBe('api-divisions-v0.2')
})

test('shared HAD geometry completes waiting deprecated Overture drafts before curated assembly', async () => {
  const { sqlite, db } = publicationDb()
  sqlite.exec(`INSERT INTO apiReleaseSets VALUES('set','2025-09-24.0','data-hk-divisions-2025-09-24.0','hk','2026-10-02');
    INSERT INTO apiVersionReleaseSets VALUES('set','v01','draft');`)
  expect(
    await resolveDivisionPublicationVersion(
      db,
      'divisionArea',
      'hkgov-had',
      undefined,
      { regionCode: 'hk', cohortKey: '2022' },
    ),
  ).toBe('api-divisions-v0.1')
})
