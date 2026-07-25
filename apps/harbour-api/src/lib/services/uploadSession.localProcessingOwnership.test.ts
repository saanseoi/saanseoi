import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { ParquetInspection } from '@repo/core'
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

const fixtureInspection: ParquetInspection = {
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
})

function registerFixtureUpload(
  db: ReturnType<typeof createLocalHarbourDb>,
  sourceVersion: string,
  cohortKey: string,
) {
  return handleRegisterUploadRequest(db, {
    fileName: 'hkgov-dpo-hk-address.parquet',
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
