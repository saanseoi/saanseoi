import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import type { MetaDatabase } from '@repo/db'
import { createLocalHarbourDb } from '../../testing/localDb'
import { loadMigrationSql } from '../../testing/metaFixtures'
import {
  getRegistrySource,
  getRegistrySourceReleaseShell,
  listRegistrySourcesPage,
} from './metaRegistry'

test('source navigation and comparisons follow source versions despite missing or later publication dates', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), ['meta']),
    )
    sqlite.exec(`
      INSERT INTO publishers(id, code, versionHash) VALUES ('publisher', 'publisher', 'test');
      INSERT INTO datasets(id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, versionHash)
        VALUES ('dataset', 'publisher', 'dataset', 'hk', 'file', 'annual', 'population', 'test');
      INSERT INTO sourceReleases(id, datasetId, code, sourceVersion, publicationDate, status) VALUES
        ('2022', 'dataset', 'release-2022', '2022', '2023-12-27', 'current'),
        ('2024', 'dataset', 'release-2024', '2024', NULL, 'current'),
        ('2021', 'dataset', 'release-2021', '2021', '2025-01-01', 'current');
    `)
    // These registry reads use the shared SQLite query API, without D1 batching.
    const db = createLocalHarbourDb(sqlite) as unknown as MetaDatabase
    const shell = await getRegistrySourceReleaseShell(db, 'dataset', 'release-2022')
    const source = await getRegistrySource(db, 'dataset')
    const directory = await listRegistrySourcesPage(db)
    expect(directory[0]?.sourceVersions.map(release => release.sourceVersion)).toEqual([
      '2024',
    ])
    for (const result of [shell, source]) {
      expect(result?.sourceVersions.map(release => release.sourceVersion)).toEqual([
        '2024',
        '2022',
        '2021',
      ])
      const versions = result!.sourceVersions
      const currentIndex = versions.findIndex(
        release => release.code === 'release-2022',
      )
      expect(versions[currentIndex + 1]?.sourceVersion).toBe('2021')
      expect(versions.at(-1)?.code).toBe('release-2021')
    }
  } finally {
    sqlite.close()
  }
})
