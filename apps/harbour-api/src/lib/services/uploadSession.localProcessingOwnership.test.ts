import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { UploadInspection } from '@repo/core'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../libs/core/src/testing/metaFixtures'
import { handleRegisterUploadRequest } from './uploadSession'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = loadMigrationSql(migrationsDir, ['meta'])
const tempDirs: string[] = []
const sqliteHandles: Database[] = []

const fixtureInspection: UploadInspection = {
  rowCount: 2050,
  schema: [
    { name: 'id', type: 'string', nullable: false },
    { name: 'theme', type: 'string', nullable: true },
    { name: 'type', type: 'string', nullable: true },
    { name: 'country', type: 'string', nullable: true },
    { name: 'region', type: 'string', nullable: true },
  ],
  distinctThemeValues: ['addresses'],
  distinctTypeValues: ['address'],
  distinctCountryValues: ['hk'],
  distinctRegionValues: ['hk'],
}

afterEach(() => {
  while (sqliteHandles.length > 0) sqliteHandles.pop()?.close()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { force: true, recursive: true })
  }
})

describe('local upload registration', () => {
  test('stages the release without an R2 Parquet object', async () => {
    const db = initHarness('harbour-local-registration.sqlite')

    const result = await registerFixtureUpload(db, '2026-05-20.0', '2026-05')

    expect(result).toMatchObject({
      rawObjectKey: 'hk/hkgov-dpo/2026-05-20.0/address.parquet',
      releaseCode: 'dr-hk-hkgov-dpo-address-2026-05-20.0',
      status: 'staged',
    })
  })

  test('reads the prior schema fingerprint from release metadata', async () => {
    const db = initHarness('harbour-local-registration-schema.sqlite')
    await registerFixtureUpload(db, '2026-05-20.0', '2026-05')

    await expect(
      registerFixtureUpload(db, '2026-06-17.0', '2026-06'),
    ).resolves.toMatchObject({
      releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-17.0',
      status: 'staged',
    })
  })

  test('allows an authenticated force repair of a published dataset', async () => {
    const db = initHarness('harbour-local-registration-force.sqlite')
    await registerFixtureUpload(db, '2026-05-20.0', '2026-05')
    sqliteHandles.at(-1)?.exec("UPDATE releases SET status = 'published';")

    await expect(
      registerFixtureUpload(db, '2026-05-20.0', '2026-05', true),
    ).resolves.toMatchObject({ status: 'staged' })
  })

  test('allows --continue to retry a staged dataset but not a published one', async () => {
    const db = initHarness('harbour-local-registration-continue.sqlite')
    await registerFixtureUpload(db, '2026-05-20.0', '2026-05')

    await expect(
      registerFixtureUpload(db, '2026-05-20.0', '2026-05', false, true),
    ).resolves.toMatchObject({ status: 'staged' })

    sqliteHandles.at(-1)?.exec("UPDATE releases SET status = 'published';")

    await expect(
      registerFixtureUpload(db, '2026-05-20.0', '2026-05', false, true),
    ).rejects.toThrow('Dataset already exists with status published')
  })

  test('only reuses a processing release for an explicit companion resource', async () => {
    const db = initHarness('harbour-local-registration-reuse.sqlite')
    await registerFixtureUpload(db, '2026-05-20.0', '2026-05')
    sqliteHandles.at(-1)?.exec(`
      UPDATE releases SET status = 'processing';
      UPDATE sourceReleases SET status = 'processing';
    `)

    await expect(
      registerFixtureUpload(db, '2026-05-20.0', '2026-05', true),
    ).rejects.toThrow('Dataset already exists with status processing')

    await expect(
      registerFixtureUpload(db, '2026-05-20.0', '2026-05', true, false, true),
    ).resolves.toMatchObject({ status: 'staged' })
  })
})

function registerFixtureUpload(
  db: ReturnType<typeof createLocalHarbourDb>,
  sourceVersion: string,
  cohortKey: string,
  force = false,
  resumeStagedRelease = false,
  reuseExistingRelease = false,
) {
  return handleRegisterUploadRequest(db, {
    fileName: 'hkgov-dpo-hk-address.parquet',
    force,
    resumeStagedRelease,
    reuseExistingRelease,
    inspection: fixtureInspection,
    plan: {
      cohortKey,
      shardYear: '2026',
      sourceVersion,
    },
  })
}

function initHarness(fileName: string) {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-upload-session-local-sql-'))
  const dbPath = join(dir, fileName)
  const sqlite = new Database(dbPath)

  tempDirs.push(dir)
  sqliteHandles.push(sqlite)
  sqlite.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  seedFixtureCatalog(sqlite)

  return createLocalHarbourDb(sqlite)
}
