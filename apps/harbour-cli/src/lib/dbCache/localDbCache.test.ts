import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { PublishDatasetResult } from '@repo/core/pipeline/harbourClient'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  applyPublishMetadataDeltaToRemoteCache,
  resolveCachePruneOperation,
  resolveShardBindingName,
} from './localDbCache.ts'

const cacheRoot = resolve(
  import.meta.dir,
  '../../../../../.local/harbour-sql/db-cache/preview',
)
const migrationSql = loadMigrationSql(
  resolve(import.meta.dir, '../../../../../libs/db/migrations'),
  ['meta'],
)
const tempCacheDirs: string[] = []

test('uses the annual D1 shard for a dated release version', () => {
  expect(resolveShardBindingName('history', 'HK', '2026-08-14.0')).toBe(
    'DB_HISTORY_HK_2026',
  )
  expect(resolveShardBindingName('source', 'HK', '2024-12-31.0')).toBe(
    'DB_SOURCE_HK_BEFORE',
  )
})

test('mirrors only rows retained by annual shard cache pruning', () => {
  expect(resolveCachePruneOperation('DB_HISTORY_HK_2025', 'divisions')).toEqual({
    retainedRowsWhereSql: '"isCurrent" = 1',
    tableName: 'divisions',
    whereSql: '"isCurrent" <> 1',
  })
  expect(resolveCachePruneOperation('DB_HISTORY_HK_BEFORE', 'divisions')).toBeNull()
  expect(resolveCachePruneOperation('DB_HISTORY_HK_2025', 'divisionAreas')).toBeNull()
})

afterEach(() => {
  for (const cacheDir of tempCacheDirs.splice(0)) {
    rmSync(cacheDir, { force: true, recursive: true })
  }
})

test('inserts an API release set that was created during deferred publication', async () => {
  mkdirSync(cacheRoot, { recursive: true })
  const cacheDir = mkdtempSync(resolve(cacheRoot, 'metadata-delta-test-'))
  tempCacheDirs.push(cacheDir)
  const sqlite = new Database(resolve(cacheDir, 'DB_META.sqlite'))
  sqlite.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  sqlite.close()

  const releaseSet = {
    id: 'api-release-set-new-draft',
    apiVersionId: 'api-version-api-divisions-v0.1',
    apiCompositionId: null,
    code: 'data-hk-divisions-2026-08-31.0',
    regionCode: 'hk',
    domainCode: 'geographic',
    cohortKey: '2026-08-31',
    revision: 0,
    effectiveFrom: '2026-08-31T00:00:00.000Z',
    effectiveTo: null,
    supersedesApiReleaseSetId: null,
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-merge-v1',
    status: 'draft' as const,
    publishedAt: null,
    validFrom: null,
    validTo: null,
    notes: null,
    guide: null,
    versionHash: 'version-hash',
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
  }

  const publishResult: PublishDatasetResult = {
    metadataDelta: { apiReleaseSets: [releaseSet], releases: [] },
    phase: null,
    releaseCode: 'dr-hk-example-2026-08-31.0',
    releaseId: 'release-example',
    status: 'current',
  }

  await applyPublishMetadataDeltaToRemoteCache('preview', cacheDir, publishResult)

  const verify = new Database(resolve(cacheDir, 'DB_META.sqlite'), { readonly: true })
  expect(
    verify
      .query(
        'SELECT id, code, status, apiVersionId, versionHash FROM apiReleaseSets WHERE id = ?',
      )
      .get(releaseSet.id),
  ).toEqual({
    id: releaseSet.id,
    code: releaseSet.code,
    status: releaseSet.status,
    apiVersionId: releaseSet.apiVersionId,
    versionHash: releaseSet.versionHash,
  })
  verify.close()
})

test('updates an existing API release set from the complete publication delta', async () => {
  mkdirSync(cacheRoot, { recursive: true })
  const cacheDir = mkdtempSync(resolve(cacheRoot, 'metadata-delta-update-test-'))
  tempCacheDirs.push(cacheDir)
  const sqlite = new Database(resolve(cacheDir, 'DB_META.sqlite'))
  sqlite.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  sqlite.exec(`
    INSERT INTO apiReleaseSets (
      id, apiVersionId, code, domainCode, revision, schemaVersion, rulesetVersion,
      status, versionHash, createdAt, updatedAt
    ) VALUES (
      'api-release-set-existing', 'old-version', 'old-code', 'old-domain', 0, 'old-schema',
      'old-rules', 'draft', 'old-hash', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
    );
  `)
  sqlite.close()

  const releaseSet = {
    id: 'api-release-set-existing',
    apiVersionId: 'api-version-api-divisions-v0.1',
    apiCompositionId: 'api-composition-current',
    code: 'data-hk-divisions-2026-08-31.0',
    regionCode: 'hk',
    domainCode: 'geographic',
    cohortKey: '2026-08-31',
    revision: 2,
    effectiveFrom: '2026-08-31T00:00:00.000Z',
    effectiveTo: null,
    supersedesApiReleaseSetId: 'api-release-set-prior',
    schemaVersion: 'sv-division-v1',
    rulesetVersion: 'rs-division-merge-v1',
    status: 'current' as const,
    publishedAt: '2026-08-31T12:00:00.000Z',
    validFrom: '2026-08-31T12:00:00.000Z',
    validTo: null,
    notes: 'Published release notes',
    guide: 'Published guide',
    versionHash: 'current-version-hash',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
  }

  await applyPublishMetadataDeltaToRemoteCache('preview', cacheDir, {
    metadataDelta: { apiReleaseSets: [releaseSet], releases: [] },
    phase: null,
    releaseCode: 'dr-hk-example-2026-08-31.0',
    releaseId: 'release-example',
    status: 'current',
  })

  const verify = new Database(resolve(cacheDir, 'DB_META.sqlite'), { readonly: true })
  expect(
    verify
      .query(
        `SELECT apiVersionId, apiCompositionId, code, domainCode, revision, status,
          publishedAt, validFrom, validTo, notes, guide, versionHash, createdAt, updatedAt
         FROM apiReleaseSets WHERE id = ?`,
      )
      .get(releaseSet.id),
  ).toEqual({
    apiVersionId: releaseSet.apiVersionId,
    apiCompositionId: releaseSet.apiCompositionId,
    code: releaseSet.code,
    domainCode: releaseSet.domainCode,
    revision: releaseSet.revision,
    status: releaseSet.status,
    publishedAt: releaseSet.publishedAt,
    validFrom: releaseSet.validFrom,
    validTo: releaseSet.validTo,
    notes: releaseSet.notes,
    guide: releaseSet.guide,
    versionHash: releaseSet.versionHash,
    createdAt: releaseSet.createdAt,
    updatedAt: releaseSet.updatedAt,
  })
  verify.close()
})

test('marks a deferred source snapshot published in the local metadata cache', async () => {
  mkdirSync(cacheRoot, { recursive: true })
  const cacheDir = mkdtempSync(resolve(cacheRoot, 'snapshot-metadata-delta-test-'))
  tempCacheDirs.push(cacheDir)
  const sqlite = new Database(resolve(cacheDir, 'DB_META.sqlite'))
  sqlite.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  sqlite.exec(`
    INSERT INTO snapshots (id, resourceType, code, cohortKey, status, createdAt, updatedAt)
    VALUES ('snapshot-draft', 'division', 'ss-hk-division-2026-08-31.0', '2026-08-31.0', 'draft', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z');
  `)
  sqlite.close()

  await applyPublishMetadataDeltaToRemoteCache('preview', cacheDir, {
    metadataDelta: {
      releases: [],
      snapshots: [
        {
          id: 'snapshot-draft',
          status: 'published',
          publishedAt: '2026-08-31T12:00:00.000Z',
          validFrom: '2026-08-31T12:00:00.000Z',
          validTo: null,
        },
      ],
    },
    phase: null,
    releaseCode: 'dr-hk-example-2026-08-31.0',
    releaseId: 'release-example',
    status: 'published',
  })

  const verify = new Database(resolve(cacheDir, 'DB_META.sqlite'), { readonly: true })
  expect(
    verify
      .query(
        'SELECT status, publishedAt, validFrom, validTo FROM snapshots WHERE id = ?',
      )
      .get('snapshot-draft'),
  ).toEqual({
    status: 'published',
    publishedAt: '2026-08-31T12:00:00.000Z',
    validFrom: '2026-08-31T12:00:00.000Z',
    validTo: null,
  })
  verify.close()
})
