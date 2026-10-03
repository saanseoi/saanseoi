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
  ensureProcessingRunStarted,
  upsertProcessingRunStatus,
  upsertSnapshotSource,
  listRegistrySourceVersions,
} from './metaRegistry'
import type { UploadPlan } from '../../types'
import { recordDatasetStage } from '../../pipeline/datasetStages'
import { insertFixtureRelease } from '../../testing/metaFixtures'

test('post-publication statistics failures retain archived resource release status', async () => {
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
    const { resourceReleaseId } = insertFixtureRelease(sqlite, {
      resourceReleaseId: 'published-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2025-09-24.0',
      resourceType: 'division',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'division.parquet',
      originalFileName: 'division.parquet',
      status: 'archived',
      ingestedAt: '2026-09-09T00:00:00Z',
      createdAt: '2026-09-09T00:00:00Z',
      updatedAt: '2026-09-09T00:00:00Z',
    })
    await recordDatasetStage(
      db,
      {
        resourceReleaseId,
        phase: 'calculateApiReleaseSetStats',
        error: 'Missing cached history',
      },
      'error',
    )
    expect(
      sqlite
        .query('SELECT status FROM resourceReleases WHERE id = ?')
        .get(resourceReleaseId),
    ).toEqual({ status: 'archived' })
    expect(
      sqlite
        .query('SELECT status FROM processingRuns WHERE resourceReleaseId = ?')
        .get(resourceReleaseId),
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
        const resourceReleaseId = buildDeterministicReleaseId(releaseCode)
        ids.set(type, resourceReleaseId)
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
        await updateDatasetStatus(db, resourceReleaseId, 'processing')
        await ensureProcessingRunStarted(
          db,
          resourceReleaseId,
          'process',
          null,
          '2026-09-09T00:00:00Z',
        )
        if (index === 1) {
          await updateDatasetStatus(db, resourceReleaseId, 'failed')
          await upsertProcessingRunStatus(
            db,
            resourceReleaseId,
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
              .query(
                "SELECT count(*) AS n FROM resourceReleases WHERE status = 'current'",
              )
              .get(),
          ).toEqual({ n: 1 })
          await updateDatasetStatus(db, resourceReleaseId, 'processing')
          await upsertProcessingRunStatus(
            db,
            resourceReleaseId,
            'process',
            'running',
            '2026-09-09T00:00:30Z',
            null,
            null,
          )
        }
        const audit = await retainAuditResult(store, {
          resourceReleaseId,
          datasetCode,
          attempt: { id: `${type}-attempt`, status: 'completed' },
          bulk: [],
          individuals: [],
          guards: [],
        })
        hashes.set(type, audit.ref.hash)
        await registerProcessingResult(db, store, resourceReleaseId, audit.ref)
        for (let retry = 0; retry < 2; retry++) {
          await replaceDatasetStats(db, resourceReleaseId, [
            {
              category: 'records',
              measure: 'count',
              unit: 'records',
              value: type === 'divisionStatistic' ? 241155 : 18,
            },
          ])
          await registerProcessingResult(db, store, resourceReleaseId, audit.ref)
        }
        sqlite.run(
          `INSERT INTO snapshots (id, resourceType, code, cohortKey, status) VALUES (?, ?, ?, '2024', 'published')`,
          [type, type, type],
        )
        await upsertSnapshotSource(db, type, 'dataset', resourceReleaseId, 'primary')
        await upsertProcessingRunStatus(
          db,
          resourceReleaseId,
          'process',
          'completed',
          '2026-09-09T00:00:00Z',
          '2026-09-09T00:01:00Z',
          null,
        )
        await updateDatasetStatus(db, resourceReleaseId, 'current')
        expect(sqlite.query('SELECT status FROM sourceReleases').get()).toEqual({
          status: index === 0 ? 'processing' : 'current',
        })
        if (index === 0) {
          // Later fixture edits cannot remove an expected sibling from this release.
          sqlite.run(`UPDATE datasets SET resourceTypes = ?`, [JSON.stringify([type])])
          await updateDatasetStatus(db, resourceReleaseId, 'current')
          expect(sqlite.query('SELECT status FROM sourceReleases').get()).toEqual({
            status: 'processing',
          })
          sqlite.run(`UPDATE datasets SET resourceTypes = ?`, [JSON.stringify(types)])
        }
      }
      expect(sqlite.query('SELECT count(*) AS n FROM sourceReleases').get()).toEqual({
        n: 1,
      })
      expect(sqlite.query('SELECT count(*) AS n FROM processingRuns').get()).toEqual({
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
          .sort((a, b) => a.resourceType.localeCompare(b.resourceType)),
      ).toEqual([
        { resourceType: 'divisionArea', count: 18 },
        { resourceType: 'divisionStatistic', count: 241155 },
      ])
      for (const type of types) {
        const id = ids.get(type)!
        expect(
          sqlite
            .query('SELECT resourceType, status FROM resourceReleases WHERE id = ?')
            .get(id),
        ).toEqual({ resourceType: type, status: 'current' })
        expect(
          sqlite
            .query(
              'SELECT manifestHash FROM releaseProvenance WHERE resourceReleaseId = ?',
            )
            .get(id),
        ).toEqual({ manifestHash: hashes.get(type) })
        expect(
          sqlite.query('SELECT value FROM stats WHERE resourceReleaseId = ?').get(id),
        ).toEqual({ value: type === 'divisionStatistic' ? 241155 : 18 })
        expect(
          sqlite
            .query(
              'SELECT resourceReleaseId FROM snapshotResourceReleases WHERE snapshotId = ?',
            )
            .get(type),
        ).toEqual({ resourceReleaseId: id })
      }
    } finally {
      sqlite.close()
    }
  })
}

test('current resources finalise their source and archived releases resist late progress updates', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), ['meta']),
  )
  try {
    sqlite.exec(`INSERT INTO publishers(id,code,versionHash) VALUES ('publisher','test','hash');
      INSERT INTO datasets(id,publisherId,code,regionCode,releaseType,releaseFrequency,theme,resourceTypes,versionHash)
      VALUES ('dataset','publisher','dataset','hk','static','monthly','divisions','["division","divisionArea"]','hash');
      INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,expectedResourceTypes,status)
      VALUES ('source','dataset','source','2026','["division","divisionArea"]','processing');
      INSERT INTO resourceReleases(id,sourceReleaseId,datasetId,code,resourceType,sourceVersion,status)
      VALUES ('division','source','dataset','division','division','2026','processing'),
             ('area','source','dataset','area','divisionArea','2026','processing');`)
    const db = createLocalHarbourDb(sqlite)
    const sourceStatus = () =>
      sqlite.query("SELECT status FROM sourceReleases WHERE id='source'").get()
    await updateDatasetStatus(db, 'division', 'current')
    expect(sourceStatus()).toEqual({ status: 'processing' })
    await updateDatasetStatus(db, 'area', 'current')
    expect(sourceStatus()).toEqual({ status: 'current' })
    await updateDatasetStatus(db, 'division', 'failed')
    expect(
      sqlite.query("SELECT status FROM resourceReleases WHERE id='division'").get(),
    ).toEqual({ status: 'current' })
    expect(sourceStatus()).toEqual({ status: 'current' })
    sqlite.exec(
      "UPDATE resourceReleases SET status='archived'; UPDATE sourceReleases SET status='archived';",
    )
    await updateDatasetStatus(db, 'division', 'processing')
    expect(
      sqlite.query("SELECT status FROM resourceReleases WHERE id='division'").get(),
    ).toEqual({ status: 'archived' })
    expect(sourceStatus()).toEqual({ status: 'archived' })
  } finally {
    sqlite.close()
  }
})
