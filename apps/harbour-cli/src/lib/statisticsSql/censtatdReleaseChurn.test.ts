import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve, join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { prepareSqlDelivery } from '../localPipeline/sqlDeliveryFiles.ts'
import { registerPendingSqlDelivery } from '../localPipeline/sqlDeliveryPending.ts'

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

  sqlite.exec(`
    UPDATE releases SET status = 'processing' WHERE id = '${releaseId}';
    UPDATE sourceReleases SET status = 'processing';
  `)
  const recoveryRoot = await mkdtemp(join(tmpdir(), 'staged-sync-recovery-'))
  try {
    const releaseCode =
      'dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-2023-H2'
    const directory = join(recoveryRoot, 'delivery')
    await prepareSqlDelivery(
      directory,
      {
        releaseId,
        environment: 'production',
        phase: 'data',
        cacheDir: recoveryRoot,
        cachePreparedAt: 'fixture',
        inputs: { version: { releaseCode } },
      },
      async append => {
        await append(
          { databaseId: 'meta', bindingName: 'DB_META' },
          new TextEncoder().encode('SELECT 1;'),
        )
      },
    )
    await registerPendingSqlDelivery(recoveryRoot, releaseId, directory)
    const before = sqlite.query('SELECT * FROM releases WHERE id = ?').get(releaseId)
    await syncStagedReleaseIntoLocalMetaCache(
      metaDb as never,
      {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
        rawObjectKey: 'hk/hkgov-censtatd/2023-H2/division-statistic.parquet',
        releaseCode,
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
      { retainedDeliveryCacheDir: recoveryRoot },
    )
    expect(sqlite.query('SELECT * FROM releases WHERE id = ?').get(releaseId)).toEqual(
      before,
    )
  } finally {
    await rm(recoveryRoot, { recursive: true, force: true })
  }
  await expect(
    syncStagedReleaseIntoLocalMetaCache(
      metaDb as unknown as Parameters<typeof syncStagedReleaseIntoLocalMetaCache>[0],
      {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
        rawObjectKey: 'hk/hkgov-censtatd/2023-H2/division-area.parquet',
        releaseCode:
          'dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-2023-H2',
        releaseId,
      },
      {
        cohortKey: '2023-H2',
        regionCode: 'hk',
        source: 'hkgov-censtatd',
        sourceVersion: '2023-H2',
        theme: 'divisions',
        type: 'divisionArea',
      },
      { reuseExistingRelease: true },
    ),
  ).rejects.toThrow('belongs to divisionStatistic')
  expect(
    sqlite
      .query('SELECT resourceType, status FROM releases WHERE id = ?')
      .get(releaseId),
  ).toEqual({ resourceType: 'divisionStatistic', status: 'processing' })
  expect(sqlite.query('SELECT status FROM sourceReleases').get()).toEqual({
    status: 'processing',
  })

  sqlite.close()
})
