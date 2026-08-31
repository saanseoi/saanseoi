import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'

import { createLocalHarbourDb } from '@repo/core/testing/localDb'

import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { findPreviousComparableCenstatdReleaseStats } from './censtatdReleaseChurn.ts'

const MIGRATIONS_DIR = resolve(import.meta.dir, '../../../../../libs/db/migrations')

test('resolves churn metadata after a staged C&SD release is synced into a reused cache', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(MIGRATIONS_DIR, ['meta']).replaceAll(
      '--> statement-breakpoint',
      '',
    ),
  )
  sqlite.exec(`
    INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt)
    VALUES (
      'publisher',
      'hkgov-censtatd',
      'publisher-hash',
      '2026-08-31T00:00:00.000Z',
      '2026-08-31T00:00:00.000Z'
    );
    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency,
      theme, sourceVariant, versionHash, createdAt, updatedAt
    ) VALUES (
      'dataset',
      'publisher',
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
      'hk',
      'static',
      'half-yearly',
      'stats',
      'official-statistics',
      'dataset-hash',
      '2026-08-31T00:00:00.000Z',
      '2026-08-31T00:00:00.000Z'
    );
  `)
  const metaDb = createLocalHarbourDb(sqlite)
  const releaseId = '746adfc8-d598-576e-9359-da45869bbc2d'

  await syncStagedReleaseIntoLocalMetaCache(
    metaDb as unknown as Parameters<typeof syncStagedReleaseIntoLocalMetaCache>[0],
    {
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
      rawObjectKey: 'hk/hkgov-censtatd/2023-H2/division-statistic.parquet',
      releaseCode:
        'dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-2023-H2',
      releaseId,
    },
    {
      cohortKey: '2023-H2',
      regionCode: 'hk',
      source: 'hkgov-censtatd',
      sourceVersion: '2023-H2',
      theme: 'stats',
      type: 'divisionStatistic',
    },
  )

  await expect(
    findPreviousComparableCenstatdReleaseStats(metaDb, releaseId),
  ).resolves.toBeNull()
  expect(
    sqlite.query('SELECT status FROM releases WHERE id = ?').get(releaseId),
  ).toEqual({ status: 'staged' })

  sqlite.close()
})
