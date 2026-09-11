import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../testing/localDb'
import { loadMigrationSql } from '../../testing/metaFixtures'
import {
  retainAuditResult,
  registerProcessingResult,
  type ProvenanceStore,
} from '../../provenance'
import { replaceDatasetStats } from '../../pipeline/db/stats'
import {
  insertDataset,
  buildDeterministicReleaseId,
  updateDatasetStatus,
  ensureIngestRunStarted,
  upsertIngestRunStatus,
  upsertSnapshotSource,
  listRegistrySourceVersions,
} from './metaRegistry'
import type { UploadPlan } from '../../types'
import { recordDatasetStage } from '../../pipeline/datasetStages'
import { insertFixtureRelease } from '../../testing/metaFixtures'

test('post-publication statistics failures retain superseded source release status', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
      'meta',
    ]).replaceAll('--> statement-breakpoint', ''),
  )
  try {
    const db = createLocalHarbourDb(sqlite)
    sqlite.run(
      "INSERT INTO publishers (id, code, versionHash) VALUES ('publisher', 'overture', 'hash')",
    )
    sqlite.run(
      "INSERT INTO datasets (id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, resourceTypes, versionHash) VALUES ('dataset', 'publisher', 'ds-hk-overture-division', 'hk', 'static', 'monthly', 'divisions', '[\"division\"]', 'hash')",
    )
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'published-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2025-09-24.0',
      resourceType: 'division',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'division.parquet',
      originalFileName: 'division.parquet',
      status: 'superseded',
      ingestedAt: '2026-09-09T00:00:00Z',
      createdAt: '2026-09-09T00:00:00Z',
      updatedAt: '2026-09-09T00:00:00Z',
    })
    await recordDatasetStage(
      db,
      {
        releaseId,
        phase: 'calculateApiReleaseSetStats',
        error: 'Missing cached history',
      },
      'error',
    )
    expect(
      sqlite.query('SELECT status FROM releases WHERE id = ?').get(releaseId),
    ).toEqual({ status: 'superseded' })
    expect(
      sqlite.query('SELECT status FROM ingestRuns WHERE releaseId = ?').get(releaseId),
    ).toEqual({ status: 'error' })
  } finally {
    sqlite.close()
  }
})

const datasetCode =
  'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
const sourceCode = `dr-${datasetCode.slice(3)}-2024`
const types = ['divisionStatistic', 'divisionArea'] as const

for (const order of [types, [...types].reverse()]) {
  test(`resources retain independent results and publish together: ${order.join(' then ')}`, async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'meta',
      ]).replaceAll('--> statement-breakpoint', ''),
    )
    const db = createLocalHarbourDb(sqlite)
    const objects = new Map<string, ArrayBuffer>()
    const store: ProvenanceStore = {
      async get(key) {
        const bytes = objects.get(key)
        return bytes ? { arrayBuffer: async () => bytes } : null
      },
      async put(key, bytes) {
        objects.set(key, bytes)
      },
    }
    sqlite.run(
      `INSERT INTO publishers (id, code, versionHash) VALUES ('publisher', 'hkgov-censtatd', 'hash')`,
    )
    sqlite.run(
      `INSERT INTO datasets (id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, resourceTypes, versionHash) VALUES ('dataset', 'publisher', ?, 'hk', 'static', 'annual', 'stats', ?, 'hash')`,
      [datasetCode, JSON.stringify(types)],
    )
    const ids = new Map<string, string>()
    const hashes = new Map<string, string>()
    try {
      for (const [index, type] of order.entries()) {
        const releaseCode = `${sourceCode}::${type}`
        const releaseId = buildDeterministicReleaseId(releaseCode)
        ids.set(type, releaseId)
        await insertDataset(
          db,
          {
            datasetCode,
            releaseCode,
            resourceType: type,
            source: 'hkgov-censtatd',
            sourceVersion: '2024',
            cohortKey: '2024',
            originalFileName: 'source.zip',
          } as UploadPlan,
          'source.zip',
          '2026-09-09T00:00:00Z',
        )
        await updateDatasetStatus(db, releaseId, 'processing')
        await ensureIngestRunStarted(
          db,
          releaseId,
          'process',
          null,
          '2026-09-09T00:00:00Z',
        )
        if (index === 1) {
          await updateDatasetStatus(db, releaseId, 'failed')
          await upsertIngestRunStatus(
            db,
            releaseId,
            'process',
            'error',
            '2026-09-09T00:00:00Z',
            '2026-09-09T00:00:30Z',
            null,
            'retryable failure',
          )
          expect(sqlite.query('SELECT status FROM sourceReleases').get()).toEqual({
            status: 'failed',
          })
          expect(
            sqlite
              .query("SELECT count(*) AS n FROM releases WHERE status = 'published'")
              .get(),
          ).toEqual({ n: 1 })
          await updateDatasetStatus(db, releaseId, 'processing')
          await upsertIngestRunStatus(
            db,
            releaseId,
            'process',
            'running',
            '2026-09-09T00:00:30Z',
            null,
            null,
          )
        }
        const audit = await retainAuditResult(store, {
          releaseId,
          datasetCode,
          attempt: { id: `${type}-attempt`, status: 'completed' },
          bulk: [],
          individuals: [],
          guards: [],
        })
        hashes.set(type, audit.ref.hash)
        await registerProcessingResult(db, store, releaseId, audit.ref)
        for (let retry = 0; retry < 2; retry++) {
          await replaceDatasetStats(db, releaseId, [
            {
              dimension: 'records',
              metric: 'count',
              metricUnit: 'records',
              value: type === 'divisionStatistic' ? 241155 : 18,
            },
          ])
          await registerProcessingResult(db, store, releaseId, audit.ref)
        }
        sqlite.run(
          `INSERT INTO snapshots (id, resourceType, code, cohortKey, status) VALUES (?, ?, ?, '2024', 'published')`,
          [type, type, type],
        )
        await upsertSnapshotSource(db, type, 'dataset', releaseId, 'primary')
        await upsertIngestRunStatus(
          db,
          releaseId,
          'process',
          'completed',
          '2026-09-09T00:00:00Z',
          '2026-09-09T00:01:00Z',
          null,
        )
        await updateDatasetStatus(db, releaseId, 'published')
        expect(sqlite.query('SELECT status FROM sourceReleases').get()).toEqual({
          status: index === 0 ? 'processing' : 'published',
        })
        if (index === 0) {
          // Later fixture edits cannot remove an expected sibling from this release.
          sqlite.run(`UPDATE datasets SET resourceTypes = ?`, [JSON.stringify([type])])
          await updateDatasetStatus(db, releaseId, 'published')
          expect(sqlite.query('SELECT status FROM sourceReleases').get()).toEqual({
            status: 'processing',
          })
          sqlite.run(`UPDATE datasets SET resourceTypes = ?`, [JSON.stringify(types)])
        }
      }
      expect(sqlite.query('SELECT count(*) AS n FROM sourceReleases').get()).toEqual({
        n: 1,
      })
      expect(sqlite.query('SELECT count(*) AS n FROM ingestRuns').get()).toEqual({
        n: 2,
      })
      const versions = await listRegistrySourceVersions(db as never)
      expect(versions[0]?.stats).toEqual([])
      expect(
        versions[0]?.resources
          .map(resource => ({
            resourceType: resource.resourceType,
            count: resource.stats[0]?.value,
          }))
          .sort((a, b) => a.type.localeCompare(b.type)),
      ).toEqual([
        { type: 'divisionArea', count: 18 },
        { type: 'divisionStatistic', count: 241155 },
      ])
      for (const type of types) {
        const id = ids.get(type)!
        expect(
          sqlite
            .query('SELECT resourceType, status FROM releases WHERE id = ?')
            .get(id),
        ).toEqual({ resourceType: type, status: 'published' })
        expect(
          sqlite
            .query('SELECT manifestHash FROM releaseProvenance WHERE releaseId = ?')
            .get(id),
        ).toEqual({ manifestHash: hashes.get(type) })
        expect(
          sqlite.query('SELECT value FROM stats WHERE releaseId = ?').get(id),
        ).toEqual({ value: type === 'divisionStatistic' ? 241155 : 18 })
        expect(
          sqlite
            .query('SELECT resourceReleaseId FROM snapshotSources WHERE snapshotId = ?')
            .get(type),
        ).toEqual({ resourceReleaseId: id })
      }
    } finally {
      sqlite.close()
    }
  })
}
