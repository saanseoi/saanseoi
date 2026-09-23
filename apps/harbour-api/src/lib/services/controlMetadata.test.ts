import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import {
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
      CREATE TABLE apiVersions(id TEXT, familyType TEXT);
      CREATE TABLE apiReleaseSets(id TEXT, apiVersionId TEXT, apiCompositionId TEXT, cohortKey TEXT, domainCode TEXT, regionCode TEXT, revision INTEGER);
      CREATE TABLE apiComposition(id TEXT, apiVersionId TEXT, status TEXT);
      CREATE TABLE apiCompositionMembers(apiCompositionId TEXT, domainCode TEXT, i18n TEXT);
      INSERT INTO publishers VALUES ('publisher', '[{"locale":"en","name":"Publisher name"}]');
      INSERT INTO apiVersions VALUES ('api', 'divisions');
      INSERT INTO apiReleaseSets VALUES ('release', 'api', 'composition', '2026', 'selected', 'hk', 0);
      INSERT INTO apiComposition VALUES ('composition', 'api', 'current');
      INSERT INTO apiCompositionMembers VALUES
        ('composition', 'other', '[{"locale":"en","name":"Other domain"}]'),
        ('composition', 'selected', '[{"locale":"zh-hant","name":"中文"},{"locale":"en","name":"Selected domain","description":"Domain description"}]'),
        ('composition', 'selected', '[{"locale":"zh-hant","name":"中文"},{"locale":"en","name":"Selected domain","description":"Domain description"}]');
    `)
    const db = drizzle({ client: sqlite }) as never
    expect(await resolvePublisherName(db, 'publisher')).toBe('Publisher name')
    expect(await resolvePublisherName(db, 'missing')).toBe('missing')
    const fallback = {
      apiFamily: 'divisions',
      cohortKey: '2026',
      domainCode: 'other',
      regionCode: 'hk',
    }
    expect(
      await requireReleaseSetPublicationMetadata(db, 'release', fallback),
    ).toMatchObject({
      domainCode: 'selected',
      domainName: 'Selected domain',
      description: 'Domain description',
    })
    sqlite.exec('UPDATE apiReleaseSets SET apiCompositionId = NULL')
    expect(
      await requireReleaseSetPublicationMetadata(db, 'release', fallback),
    ).toMatchObject({
      domainName: 'Selected domain',
    })
  } finally {
    sqlite.close()
  }
})
