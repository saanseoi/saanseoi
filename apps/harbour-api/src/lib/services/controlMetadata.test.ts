import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import {
  resolveApiReleaseSetMetadataDelta,
  resolvePublishedSnapshotMetadataDeltas,
  resolvePublisherName,
  requireReleaseSetPublicationMetadata,
} from './controlMetadata'

describe('resolvePublishedSnapshotMetadataDeltas', () => {
  test('batches large snapshot metadata lookups within D1 limits', async () => {
    const snapshotIds = Array.from({ length: 200 }, (_, index) => `snapshot-${index}`)
    let allCalls = 0

    const db = {
      select() {
        const query = {
          all: async () => {
            const offset = allCalls * 99
            allCalls += 1
            return snapshotIds.slice(offset, offset + 99).map(id => ({
              id,
              publishedAt: '2026-09-07T00:00:00.000Z',
              status: 'published',
              validFrom: '2026-09-07T00:00:00.000Z',
              validTo: null,
            }))
          },
          from() {
            return query
          },
          where() {
            return query
          },
        }

        return query
      },
    }

    const result = await resolvePublishedSnapshotMetadataDeltas(
      db as never,
      snapshotIds,
    )

    expect(allCalls).toBe(3)
    expect(result).toHaveLength(200)
    expect(result[199]?.id).toBe('snapshot-199')
  })
})

test('publication metadata reads locale values from the selected domain member and publisher', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(`
      CREATE TABLE publishers(code TEXT, i18n TEXT);
      CREATE TABLE apiVersions(id TEXT, code TEXT, familyType TEXT);
      CREATE TABLE apiReleaseSets(id TEXT, code TEXT, regionCode TEXT, domainCode TEXT, cohortKey TEXT, revision INTEGER, effectiveFrom TEXT, schemaVersion TEXT, rulesetVersion TEXT, versionHash TEXT, createdAt TEXT, updatedAt TEXT);
      CREATE TABLE apiVersionReleaseSets(id TEXT, apiVersionId TEXT, apiReleaseSetId TEXT, apiCompositionId TEXT, supersedesApiReleaseSetId TEXT, status TEXT, publishedAt TEXT, validFrom TEXT, validTo TEXT, notes TEXT, guide TEXT, versionHash TEXT, createdAt TEXT, updatedAt TEXT);
      CREATE TABLE apiComposition(id TEXT, apiVersionId TEXT, status TEXT);
      CREATE TABLE apiCompositionMembers(apiCompositionId TEXT, domainCode TEXT, i18n TEXT);
      INSERT INTO publishers VALUES ('publisher', '{"en":{"name":"Publisher name"}}');
      INSERT INTO apiVersions VALUES ('api', 'api-divisions-v0.1', 'divisions');
      INSERT INTO apiReleaseSets VALUES ('release', 'data-hk-division-2026', 'hk', 'selected', '2026', 0, '2026-01-01', 'schema-v1', 'rules-v1', 'hash', 'now', 'now');
      INSERT INTO apiVersionReleaseSets VALUES ('version-release', 'api', 'release', 'composition', NULL, 'current', '2026-01-01', '2026-01-01', NULL, NULL, NULL, 'hash', 'now', 'now');
      INSERT INTO apiComposition VALUES ('composition', 'api', 'current');
      INSERT INTO apiCompositionMembers VALUES
        ('composition', 'other', '{"en":{"name":"Other domain"}}'),
        ('composition', 'selected', '{"zh-hant":{"name":"中文"},"en":{"name":"Selected domain","description":"Domain description"}}'),
        ('composition', 'selected', '{"zh-hant":{"name":"中文"},"en":{"name":"Selected domain","description":"Domain description"}}');
    `)
    const db = drizzle({ client: sqlite }) as never
    sqlite.exec(
      "UPDATE apiReleaseSets SET versionHash='content-hash',createdAt='content-created',updatedAt='content-updated'",
    )
    expect(
      await resolveApiReleaseSetMetadataDelta(db, 'release', 'api-divisions-v0.1'),
    ).toMatchObject({
      id: 'version-release',
      apiReleaseSetId: 'release',
      versionHash: 'hash',
      contentVersionHash: 'content-hash',
      contentCreatedAt: 'content-created',
      contentUpdatedAt: 'content-updated',
      createdAt: 'now',
      updatedAt: 'now',
    })
    expect(await resolvePublisherName(db, 'publisher')).toBe('Publisher name')
    expect(await resolvePublisherName(db, 'missing')).toBe('missing')
    const fallback = {
      apiFamily: 'divisions',
      cohortKey: '2026',
      domainCode: 'other',
      regionCode: 'hk',
    }
    expect(
      await requireReleaseSetPublicationMetadata(
        db,
        'release',
        'api-divisions-v0.1',
        fallback,
      ),
    ).toMatchObject({
      domainCode: 'selected',
      domainName: 'Selected domain',
      description: 'Domain description',
    })
    sqlite.exec('UPDATE apiVersionReleaseSets SET apiCompositionId = NULL')
    expect(
      await requireReleaseSetPublicationMetadata(
        db,
        'release',
        'api-divisions-v0.1',
        fallback,
      ),
    ).toMatchObject({
      domainName: 'Selected domain',
    })
  } finally {
    sqlite.close()
  }
})
