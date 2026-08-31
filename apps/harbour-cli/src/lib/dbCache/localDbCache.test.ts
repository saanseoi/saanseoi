import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { PublishDatasetResult } from '@repo/core/pipeline/harbourClient'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  applyPublishMetadataDeltaToRemoteCache,
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
