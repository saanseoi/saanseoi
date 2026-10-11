import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '../../testing/localDb'
import { resolveApiReleaseSetForRequest } from './metaRegistry'

test('effective periods follow distinct starts in the selected catalogue', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(`
      CREATE TABLE apiVersions(id TEXT PRIMARY KEY, code TEXT, familyType TEXT);
      CREATE TABLE apiCatalogRevisions(
        id TEXT PRIMARY KEY, apiVersionId TEXT, code TEXT, regionCode TEXT,
        status TEXT, publishedAt TEXT, revision INTEGER
      );
      CREATE TABLE apiReleaseSets(
        id TEXT PRIMARY KEY, code TEXT, regionCode TEXT, domainCode TEXT,
        cohortKey TEXT, effectiveFrom TEXT, revision INTEGER,
        schemaVersion TEXT, rulesetVersion TEXT
      );
      CREATE TABLE apiVersionReleaseSets(
        id TEXT PRIMARY KEY, apiVersionId TEXT, apiReleaseSetId TEXT,
        status TEXT, publishedAt TEXT
      );
      CREATE TABLE apiCatalogRevisionReleaseSets(
        apiCatalogRevisionId TEXT, apiVersionReleaseSetId TEXT, domainCode TEXT,
        cohortKey TEXT, isDefault INTEGER
      );
      INSERT INTO apiVersions VALUES ('api', 'api-divisions-v0.1', 'division');
      INSERT INTO apiCatalogRevisions VALUES
        ('old', 'api', 'old', 'hk', 'current', '2026-01-02T00:00:00.000Z', 0),
        ('new', 'api', 'new', 'hk', 'current', '2026-04-02T00:00:00.000Z', 1);
      INSERT INTO apiReleaseSets VALUES
        ('jan', 'jan', 'hk', 'geographic', '2026-01', '2026-01-01T00:00:00.000Z', 0, 'schema', 'rules'),
        ('feb', 'feb', 'hk', 'geographic', '2026-02', '2026-02-01T00:00:00.000Z', 0, 'schema', 'rules'),
        ('mar', 'mar', 'hk', 'geographic', '2026-03', '2026-03-01T00:00:00.000Z', 0, 'schema', 'rules'),
        ('mar-r1', 'mar-r1', 'hk', 'geographic', '2026-03', '2026-03-01T00:00:00.000Z', 1, 'schema', 'rules'),
        ('other', 'other', 'hk', 'other', '2026-03-15', '2026-03-15T00:00:00.000Z', 0, 'schema', 'rules');
      INSERT INTO apiVersionReleaseSets VALUES
        ('jan','api','jan','current','2026-01-02T00:00:00.000Z'),
        ('feb','api','feb','current','2026-01-02T00:00:00.000Z'),
        ('mar','api','mar','current','2026-01-02T00:00:00.000Z'),
        ('mar-r1','api','mar-r1','current','2026-01-02T00:00:00.000Z'),
        ('other','api','other','current','2026-01-02T00:00:00.000Z');
      INSERT INTO apiCatalogRevisionReleaseSets VALUES
        ('old', 'jan', 'geographic', '2026-01', 1),
        ('new', 'jan', 'geographic', '2026-01', 0),
        ('new', 'feb', 'geographic', '2026-02', 0),
        ('new', 'mar', 'geographic', '2026-03', 0),
        ('new', 'mar-r1', 'geographic', '2026-03', 1),
        ('new', 'other', 'other', '2026-03-15', 1);
    `)
    const db = createLocalHarbourDb(sqlite)
    const select = (
      effectiveAt: string,
      selectors: { knownAt?: string; catalogRevision?: string } = {},
    ) =>
      resolveApiReleaseSetForRequest(db, 'division', {
        regionCode: 'hk',
        domainCode: 'geographic',
        effectiveAt,
        ...selectors,
      })

    expect(await select('2025-12-31T23:59:59.999Z')).toBeNull()
    expect(await select('2026-01-31T23:59:59.999Z')).toMatchObject({ code: 'jan' })
    expect(await select('2026-02-01T00:00:00.000Z')).toMatchObject({ code: 'feb' })
    expect(await select('2026-02-28T23:59:59.999Z')).toMatchObject({ code: 'feb' })
    expect(await select('2026-03-01T00:00:00.000Z')).toMatchObject({ code: 'mar-r1' })
    expect(await select('2030-01-01T00:00:00.000Z')).toMatchObject({ code: 'mar-r1' })
    expect(
      await select('2026-03-01T00:00:00.000Z', { catalogRevision: 'old' }),
    ).toMatchObject({ code: 'jan' })
    expect(
      await select('2026-03-01T00:00:00.000Z', { knownAt: '2026-04-01T00:00:00.000Z' }),
    ).toMatchObject({ code: 'jan' })
  } finally {
    sqlite.close()
  }
})
