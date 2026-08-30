import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../testing/metaFixtures'
import {
  createSchemaFingerprint,
  inferRegionFromPath,
  inferCohortKeyFromPath,
  inferSourceVersionFromFilename,
  inferSourceFromFilename,
  inferSourceFromPath,
  inferThemeFromFilename,
  inferThemeFromPath,
  inferTypeFromFilename,
  inferTypeFromPath,
} from './upload'
import { planUpload, prepareUpload, registerUpload } from './uploadLocal'
import { createLocalHarbourDb } from '../../testing/localDb'
import { buildDeterministicReleaseId } from '../db/metaRegistry'

import type { UploadInspection } from '../../types'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = loadMigrationSql(migrationsDir, ['meta'])
const tempDirs: string[] = []
const fixtureInspection: UploadInspection = {
  rowCount: 3,
  schema: [
    { name: 'id', type: 'string', nullable: false },
    { name: 'theme', type: 'string', nullable: true },
    { name: 'type', type: 'string', nullable: true },
    { name: 'country', type: 'string', nullable: true },
    { name: 'region', type: 'string', nullable: true },
  ],
  distinctThemeValues: ['divisions'],
  distinctTypeValues: ['division'],
  distinctCountryValues: ['hk'],
  distinctRegionValues: ['hk'],
}

const addressFixtureInspection: UploadInspection = {
  ...fixtureInspection,
  distinctThemeValues: ['addresses'],
  distinctTypeValues: ['address'],
}

const fixtureInspectionWithAdminLevel: UploadInspection = {
  ...fixtureInspection,
  schema: [
    ...fixtureInspection.schema,
    { name: 'admin_level', type: 'int_32', nullable: true },
  ],
}

const reorderedFixtureInspection: UploadInspection = {
  ...fixtureInspectionWithAdminLevel,
  schema: reorderSchemaFields(fixtureInspectionWithAdminLevel, [
    'type',
    'id',
    'admin_level',
    'theme',
    'region',
    'country',
  ]),
}

const censtatdDensityLegacyInspection: UploadInspection = {
  rowCount: 18,
  schema: [
    { name: 'district_code', type: 'int64', nullable: false },
    { name: 'id', type: 'utf8', nullable: false },
    { name: 'land_area_sq_km', type: 'double', nullable: false },
    {
      name: 'mid_year_population_density_per_sq_km',
      type: 'int64',
      nullable: false,
    },
    { name: 'mid_year_population', type: 'int64', nullable: false },
    { name: 'name_en', type: 'utf8', nullable: false },
    { name: 'name_zh_hant', type: 'utf8', nullable: false },
    { name: 'raw_properties', type: 'utf8', nullable: false },
    { name: 'reference_year', type: 'utf8', nullable: false },
    { name: 'source_geometry', type: 'utf8', nullable: false },
    { name: 'sources', type: 'utf8', nullable: false },
  ],
  distinctThemeValues: ['stats'],
  distinctTypeValues: ['divisionStatistic'],
  distinctCountryValues: ['hk'],
  distinctRegionValues: ['hk'],
}

const censtatdDensityReferencePeriodInspection: UploadInspection = {
  ...censtatdDensityLegacyInspection,
  schema: [
    ...censtatdDensityLegacyInspection.schema.filter(
      field => field.name !== 'reference_year',
    ),
    { name: 'reference_period_code', type: 'utf8', nullable: false },
    { name: 'reference_period_start', type: 'utf8', nullable: true },
    { name: 'reference_period_end', type: 'utf8', nullable: true },
    { name: 'reference_period_granularity', type: 'utf8', nullable: false },
    { name: 'reference_period_end_year', type: 'utf8', nullable: false },
  ],
}

function reorderSchemaFields(
  inspection: UploadInspection,
  fieldNames: string[],
): UploadInspection['schema'] {
  return fieldNames.map(fieldName => {
    const field = inspection.schema.find(candidate => candidate.name === fieldName)

    if (!field) {
      throw new Error(`Missing fixture schema field: ${fieldName}`)
    }

    return field
  })
}

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-test-'))
  tempDirs.push(dir)
  return dir
}

function createOvertureStyleFixture(tempDir: string) {
  const targetDir = join(tempDir, 'data/2025-09-24.0/divisions/China/Hong Kong')
  const targetFile = join(targetDir, 'division.parquet')

  mkdirSync(targetDir, { recursive: true })
  writeFileSync(targetFile, 'fixture')

  return targetFile
}

function createFixturePath(tempDir: string) {
  const fixtureFile = join(tempDir, 'hk-division-2026-05.parquet')

  writeFileSync(fixtureFile, 'fixture')

  return fixtureFile
}

function createResourceFixturePath(tempDir: string, resourceName: string) {
  const fixtureFile = join(tempDir, `hk-${resourceName}-2026-05.parquet`)

  writeFileSync(fixtureFile, 'fixture')

  return fixtureFile
}

function createAddressFixturePath(tempDir: string) {
  const fixtureFile = join(tempDir, 'hkgov-dpo-address.parquet')

  writeFileSync(fixtureFile, 'fixture')

  return fixtureFile
}

function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  seedFixtureCatalog(db)

  return db
}

function seedCenstatdDensityDataset(db: Database) {
  db.exec(`
    INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt) VALUES
      (
        'publisher-hkgov-censtatd',
        'hkgov-censtatd',
        'vh-publisher-hkgov-censtatd-v1',
        0,
        0
      );

    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, sourceUrl, versionHash, createdAt, updatedAt
    ) VALUES (
      'hkgov-censtatd-hk-density',
      'publisher-hkgov-censtatd',
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
      'hk',
      'static',
      'yearly',
      'stats',
      'https://portal.csdi.gov.hk/',
      'vh-dataset-hkgov-censtatd-hk-density-v1',
      0,
      0
    );

    INSERT INTO datasetResourceTypes (datasetId, resourceType) VALUES
      ('hkgov-censtatd-hk-density', 'divisionStatistic');
  `)
}

async function assertAdminLevelTransitionAllowed(
  resourceType: 'divisionArea' | 'divisionBoundary',
  resourceName: 'division-area' | 'division-boundary',
) {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour.sqlite')
  const fixtureFile = createResourceFixturePath(tempDir, resourceName)
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)

  insertFixtureRelease(sqlite, {
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-01',
    theme: 'divisions',
    type: resourceType,
    sourceVersion: '2026-01-21.0',
    rawObjectKey: `hk/overture/2026-01-21.0/${resourceName}.parquet`,
    originalFileName: `${resourceName}.parquet`,
    status: 'published',
    ingestedAt: '2026-06-02T00:00:00.000Z',
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  })

  const inspection: UploadInspection = {
    ...fixtureInspectionWithAdminLevel,
    distinctTypeValues: [resourceType],
  }

  const planned = await planUpload(db, {
    filePath: fixtureFile,
    cohortKey: '2026-02',
    source: 'overture',
    sourceVersion: '2026-02-18.0',
    inspection,
    resolveSchemaFingerprint: async () => createSchemaFingerprint(fixtureInspection),
  })

  expect(planned).toMatchObject({
    plan: {
      datasetId: `dr-hk-overture-${resourceName}-2026-02-18.0`,
      supersedesDatasetId: `dr-hk-overture-${resourceName}-2026-01-21.0`,
    },
  })

  sqlite.close()
}

function insertFixtureIngestRun(
  db: Database,
  run: {
    runId: string
    releaseId: string
    phase: string
    status: string
    stats?: string | null
    error?: string | null
    startedAt: string
    finishedAt?: string | null
  },
) {
  db.query(
    `
      INSERT INTO ingestRuns (
        runId,
        releaseId,
        phase,
        status,
        stats,
        error,
        startedAt,
        finishedAt,
        createdAt,
        updatedAt
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    `,
  ).run(
    run.runId,
    run.releaseId,
    run.phase,
    run.status,
    run.stats ?? null,
    run.error ?? null,
    run.startedAt,
    run.finishedAt ?? null,
    new Date(run.startedAt).getTime(),
    new Date(run.finishedAt ?? run.startedAt).getTime(),
  )
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('upload', () => {
  test('infers addresses theme from a singular filename', () => {
    expect(inferThemeFromFilename('address.parquet')).toBe('addresses')
    expect(inferTypeFromFilename('address.parquet')).toBe('address')
  })

  test('infers divisions theme from a singular filename', () => {
    expect(inferThemeFromFilename('division.parquet')).toBe('divisions')
    expect(inferTypeFromFilename('division.parquet')).toBe('division')
  })

  test('infers source from recognisable filename and path tokens', () => {
    expect(inferSourceFromFilename('hkgov-dpo-address.parquet')).toBe('hkgov-dpo')
    expect(inferSourceFromFilename('overture-division.parquet')).toBe('overture')
    expect(inferSourceFromPath('/tmp/hkgov/2026-05/address.parquet')).toBe('hkgov')
    expect(inferSourceFromPath('/tmp/overture/2026-05/division.parquet')).toBe(
      'overture',
    )
  })

  test('prefers the address filename signal over a broader parent theme folder', () => {
    const filePath = '/tmp/data/2025-09-24.0/divisions/China/Hong Kong/address.parquet'

    expect(inferTypeFromPath(filePath)).toBe('address')
    expect(inferThemeFromPath(filePath)).toBe('addresses')
    expect(inferRegionFromPath(filePath)).toBe('hk')
    expect(inferCohortKeyFromPath(filePath)).toBe('2025-09-24.0')
  })

  test('infers theme, region, and cohortKey from the full overture-style path', () => {
    const tempDir = createTempDir()
    const overtureFixturePath = createOvertureStyleFixture(tempDir)

    expect(inferTypeFromPath(overtureFixturePath)).toBe('division')
    expect(inferThemeFromPath(overtureFixturePath)).toBe('divisions')
    expect(inferRegionFromPath(overtureFixturePath)).toBe('hk')
    expect(inferCohortKeyFromPath(overtureFixturePath)).toBe('2025-09-24.0')
  })

  test('prefers the filename over the parent directory for upload type inference', async () => {
    const tempDir = createTempDir()
    const filePath = join(
      tempDir,
      'data/2025-09-24.0/divisions/China/Hong Kong/address.parquet',
    )

    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, 'fixture')

    const planned = await prepareUpload({
      filePath,
      inspection: addressFixtureInspection,
      source: 'overture',
      sourceVersion: '2025-09-24.0',
    })

    expect(planned.plan.type).toBe('address')
    expect(planned.plan.theme).toBe('addresses')
    expect(planned.plan.inferredFrom.type).toBe('filename')
    expect(planned.plan.inferredFrom.theme).toBe('filename')
  })

  test('infers source version and cohortKey from the filename when needed', async () => {
    const tempDir = createTempDir()
    const fixtureFile = join(tempDir, 'dr-hk-hkgov-dpo-address-2026-06-04.0.parquet')

    writeFileSync(fixtureFile, 'fixture')

    expect(inferSourceVersionFromFilename(fixtureFile)).toBe('2026-06-04.0')

    const planned = await prepareUpload({
      filePath: fixtureFile,
      inspection: {
        rowCount: 1,
        schema: fixtureInspection.schema,
        distinctThemeValues: ['addresses'],
        distinctTypeValues: ['address'],
        distinctCountryValues: ['hk'],
        distinctRegionValues: ['hk'],
      },
      source: 'hkgov-dpo',
    })

    expect(planned.plan.cohortKey).toBe('2026-06-04.0')
    expect(planned.plan.sourceVersion).toBe('2026-06-04.0')
    expect(planned.plan.datasetId).toBe('dr-hk-hkgov-dpo-address-2026-06-04.0')
    expect(planned.plan.datasetCode).toBe('ds-hk-hkgov-dpo-address')
  })

  test('uses the source version as the cohort for a prepared HAD district upload', async () => {
    const tempDir = createTempDir()
    const fixtureFile = join(tempDir, 'hkgov-had-hk-2022-divisionArea.parquet')

    writeFileSync(fixtureFile, 'fixture')

    const planned = await prepareUpload({
      filePath: fixtureFile,
      inspection: {
        rowCount: 18,
        schema: fixtureInspection.schema,
        distinctThemeValues: ['divisions'],
        distinctTypeValues: ['divisionArea'],
        distinctCountryValues: ['hk'],
        distinctRegionValues: ['hk'],
      },
      source: 'hkgov-had',
      sourceVersion: '2022',
      type: 'divisionArea',
    })

    expect(planned.plan.datasetCode).toBe('ds-hk-hkgov-had-division-area-district')
    expect(planned.plan.releaseCode).toBe('dr-hk-hkgov-had-division-area-district-2022')
    expect(planned.plan.cohortKey).toBe('2022')
    expect(planned.plan.inferredFrom.cohortKey).toBe('sourceVersion')
  })

  test('uses an explicit product dataset code when one publisher has several statistic datasets', async () => {
    const tempDir = createTempDir()
    const fixtureFile = join(tempDir, 'hkgov-censtatd-density-2022.parquet')
    writeFileSync(fixtureFile, 'fixture')

    const planned = await prepareUpload({
      cohortKey: '2022',
      datasetCode:
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
      filePath: fixtureFile,
      inspection: {
        rowCount: 18,
        schema: fixtureInspection.schema,
        distinctThemeValues: ['stats'],
        distinctTypeValues: ['divisionStatistic'],
        distinctCountryValues: ['hk'],
        distinctRegionValues: ['hk'],
      },
      source: 'hkgov-censtatd',
      sourceVersion: '2022',
      type: 'divisionStatistic',
    })

    expect(planned.plan.datasetCode).toBe(
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
    )
    expect(planned.plan.releaseCode).toBe(
      'dr-hk-hkgov-censtatd-division-statistic-land-area-population-density-district-2022',
    )
  })

  test('keeps the resource type in a Planning Department companion release code', async () => {
    const tempDir = createTempDir()
    const fixtureFile = join(tempDir, 'hkgov-pland-pu-hk-2001-division-area.parquet')
    writeFileSync(fixtureFile, 'fixture')

    const planned = await prepareUpload({
      cohortKey: '2001',
      datasetCode: 'ds-hk-hkgov-pland-division-pu',
      filePath: fixtureFile,
      inspection: {
        rowCount: 18,
        schema: fixtureInspection.schema,
        distinctThemeValues: ['divisions'],
        distinctTypeValues: ['divisionArea'],
        distinctCountryValues: ['hk'],
        distinctRegionValues: ['hk'],
      },
      source: 'hkgov-pland-pu',
      sourceVersion: '2001',
      type: 'divisionArea',
    })

    expect(planned.plan.datasetCode).toBe('ds-hk-hkgov-pland-division-pu')
    expect(planned.plan.releaseCode).toBe('dr-hk-hkgov-pland-division-area-pu-2001')
  })

  test('rejects overture uploads for source versions that are not yet marked safe', async () => {
    const tempDir = createTempDir()
    const fixtureFile = join(tempDir, 'hk-address-2026-06.parquet')

    writeFileSync(fixtureFile, 'fixture')

    await expect(
      prepareUpload({
        filePath: fixtureFile,
        inspection: addressFixtureInspection,
        source: 'overture',
        sourceVersion: '2026-06-24.0',
        cohortKey: '2026-06',
      }),
    ).rejects.toThrow(
      'Overture sourceVersion 2026-06-24.0 is not marked as a known safe release.',
    )
  }, 10_000)

  test('registers the first dataset upload against a provided raw object key', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)

    initDb(dbPath).close()
    const sqlite = new Database(dbPath)
    const db = createLocalHarbourDb(sqlite)

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      cohortKey: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-20.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
    })
    sqlite.close()

    expect(result.plan.datasetId).toBe('dr-hk-overture-division-2026-05-20.0')
    expect(result.plan.type).toBe('division')
    expect(result.plan.originalFileName).toBe('hk-division-2026-05.parquet')
    expect(result.rawObjectKey).toBe('hk/overture/2026-05-20.0/division.parquet')

    const sqliteCheck = new Database(dbPath)
    const dataset = sqliteCheck
      .query(
        'SELECT code AS datasetId, status, rawObjectKey, originalFileName FROM releases WHERE code = ?',
      )
      .get('dr-hk-overture-division-2026-05-20.0') as {
      datasetId: string
      status: string
      rawObjectKey: string
      originalFileName: string
    } | null
    const ingestRunCount = sqliteCheck
      .query(
        'SELECT COUNT(*) AS count FROM ingestRuns ir INNER JOIN releases r ON r.id = ir.releaseId WHERE r.code = ?',
      )
      .get('dr-hk-overture-division-2026-05-20.0') as { count: number }

    sqliteCheck.close()

    expect(dataset).not.toBeNull()
    expect(dataset?.status).toBe('staged')
    expect(dataset?.rawObjectKey).toBe(result.rawObjectKey ?? undefined)
    expect(dataset?.originalFileName).toBe('hk-division-2026-05.parquet')
    expect(ingestRunCount.count).toBe(2)
  })

  test('uses a deterministic release id for the same release code', async () => {
    const tempDir = createTempDir()
    const fixtureFile = createFixturePath(tempDir)

    async function registerFreshUpload() {
      const dbPath = join(createTempDir(), 'harbour.sqlite')

      initDb(dbPath).close()
      const sqlite = new Database(dbPath)
      const db = createLocalHarbourDb(sqlite)
      const result = await registerUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-20.0',
        inspection: fixtureInspection,
        rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
      })

      sqlite.close()
      return result
    }

    const first = await registerFreshUpload()
    const second = await registerFreshUpload()
    const expectedReleaseId = await buildDeterministicReleaseId(first.plan.releaseCode)

    expect(first.releaseId).toBe(expectedReleaseId)
    expect(second.releaseId).toBe(expectedReleaseId)
  })

  test('rejects non-chronological uploads for the same region/type', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-05',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-05-20.0',
      originalFileName: 'division.parquet',
      rawObjectKey: fixtureFile,
      status: 'published',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })

    await expect(
      registerUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-04',
        source: 'overture',
        sourceVersion: '2026-04-15.0',
        inspection: fixtureInspection,
        rawObjectKey: 'hk/overture/2026-04-15.0/division.parquet',
      }),
    ).rejects.toThrow('strictly newer source versions')

    const historicalCohort = await registerUpload(db, {
      filePath: fixtureFile,
      cohortKey: '2026-04',
      source: 'overture',
      sourceVersion: '2026-04-15.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-04-15.0/division.parquet',
      allowHistoricalCohort: true,
      resolveSchemaFingerprint: async () => createSchemaFingerprint(fixtureInspection),
    })

    expect(historicalCohort.plan.supersedesDatasetId).toBeNull()
    sqlite.close()
  })

  test('allows retrying an existing staged release when explicitly permitted', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    await registerUpload(db, {
      filePath: fixtureFile,
      cohortKey: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-20.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-05.0/division.parquet',
    })

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      cohortKey: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-20.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
      allowExistingDatasetStatuses: ['staged'],
      resolveSchemaFingerprint: async () => createSchemaFingerprint(fixtureInspection),
    })

    expect(result.plan.releaseCode).toBe('dr-hk-overture-division-2026-05-20.0')
    sqlite.close()
  })

  test('can dry-run without staging files', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const db = initDb(dbPath)
    const harbourDb = createLocalHarbourDb(db)

    const planned = await planUpload(harbourDb, {
      filePath: fixtureFile,
      cohortKey: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-20.0',
      inspection: fixtureInspection,
    })

    db.close()

    expect(planned.plan.datasetId).toBe('dr-hk-overture-division-2026-05-20.0')
    expect(planned.plan.type).toBe('division')
    expect(planned.plan.fileName).toBe('division.parquet')
  })

  test('requires an explicit source when it cannot be inferred confidently', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = join(tempDir, 'address.parquet')

    writeFileSync(fixtureFile, 'fixture')
    const db = initDb(dbPath)
    const harbourDb = createLocalHarbourDb(db)

    await expect(
      planUpload(harbourDb, {
        filePath: fixtureFile,
        cohortKey: '2026-06',
        inspection: {
          rowCount: 1,
          schema: fixtureInspection.schema,
          distinctThemeValues: ['addresses'],
          distinctTypeValues: ['address'],
          distinctCountryValues: ['hk'],
          distinctRegionValues: ['hk'],
        },
      }),
    ).rejects.toThrow('Could not determine source.')

    db.close()
  })

  test('allows hkgov address cohorts without another address release', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = join(tempDir, 'hkgov-dpo-address.parquet')

    writeFileSync(fixtureFile, 'fixture')
    const db = initDb(dbPath)
    const harbourDb = createLocalHarbourDb(db)

    const result = await planUpload(harbourDb, {
      filePath: fixtureFile,
      source: 'hkgov-dpo',
      cohortKey: '2026-06',
      sourceVersion: '2026-06-04.0',
      inspection: {
        rowCount: 1,
        schema: fixtureInspection.schema,
        distinctThemeValues: ['addresses'],
        distinctTypeValues: ['address'],
        distinctCountryValues: ['hk'],
        distinctRegionValues: ['hk'],
      },
    })

    expect(result.plan.source).toBe('hkgov-dpo')
    expect(result.plan.cohortKey).toBe('2026-06')

    db.close()
  })

  test('registers an already-uploaded remote object', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      cohortKey: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-20.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
    })

    const dataset = sqlite
      .query('SELECT code AS datasetId, rawObjectKey FROM releases WHERE code = ?')
      .get('dr-hk-overture-division-2026-05-20.0') as {
      datasetId: string
      rawObjectKey: string
    } | null

    sqlite.close()

    expect(result.rawObjectKey).toBe('hk/overture/2026-05-20.0/division.parquet')
    expect(dataset?.rawObjectKey).toBe(result.rawObjectKey ?? undefined)
  })

  test('registers hkgov ALS address uploads', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-hkgov-address.sqlite')
    const fixtureFile = createAddressFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      cohortKey: '2026-06',
      source: 'hkgov-dpo',
      sourceVersion: '2026-06-04.0',
      inspection: addressFixtureInspection,
      rawObjectKey: 'hk/hkgov-dpo/2026-06-04.0/address.parquet',
    })

    const release = sqlite
      .query(
        `
          SELECT d.code AS datasetCode, r.code AS releaseCode, r.status AS status
          FROM releases r
          JOIN datasets d ON d.id = r.datasetId
          WHERE r.code = ?
        `,
      )
      .get('dr-hk-hkgov-dpo-address-2026-06-04.0') as {
      datasetCode: string
      releaseCode: string
      status: string
    } | null

    sqlite.close()

    expect(result.plan.datasetCode).toBe('ds-hk-hkgov-dpo-address')
    expect(result.plan.datasetId).toBe('dr-hk-hkgov-dpo-address-2026-06-04.0')
    expect(release).toEqual({
      datasetCode: 'ds-hk-hkgov-dpo-address',
      releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-04.0',
      status: 'staged',
    })
  })

  test('allows re-registering a failed dataset id', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-05',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-05-20.0',
      rawObjectKey: 'hk/overture/2026-05-20.0/division-old.parquet',
      originalFileName: 'division-old.parquet',
      status: 'failed',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      cohortKey: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-20.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
    })

    const dataset = sqlite
      .query(
        'SELECT code AS datasetId, status, rawObjectKey, originalFileName, processingRules FROM releases WHERE code = ?',
      )
      .get('dr-hk-overture-division-2026-05-20.0') as {
      datasetId: string
      status: string
      rawObjectKey: string
      originalFileName: string
      processingRules: string | null
    } | null
    const processingRules = sqlite
      .query(
        `
          SELECT d.processingRules
          FROM datasets d
          INNER JOIN publishers p ON p.id = d.publisherId
          WHERE d.code = ? AND p.code = ?
        `,
      )
      .get('ds-hk-overture-division', 'overture') as {
      processingRules: string | null
    } | null
    const ingestRunCount = sqlite
      .query(
        'SELECT COUNT(*) AS count FROM ingestRuns ir INNER JOIN releases r ON r.id = ir.releaseId WHERE r.code = ?',
      )
      .get('dr-hk-overture-division-2026-05-20.0') as { count: number }

    sqlite.close()

    expect(result.plan.datasetId).toBe('dr-hk-overture-division-2026-05-20.0')
    expect(dataset).not.toBeNull()
    expect(dataset?.status).toBe('staged')
    expect(dataset?.rawObjectKey).toBe('hk/overture/2026-05-20.0/division.parquet')
    expect(dataset?.originalFileName).toBe('hk-division-2026-05.parquet')
    expect(dataset?.processingRules).toBe(processingRules?.processingRules)
    expect(ingestRunCount.count).toBe(2)
  })

  test('reuses existing phase rows when retrying a failed registered dataset', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-re-register-existing-phase.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    const { releaseId } = insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-05',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-05-20.0',
      rawObjectKey: 'hk/overture/2026-05-20.0/division-old.parquet',
      originalFileName: 'division-old.parquet',
      status: 'failed',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })
    insertFixtureIngestRun(sqlite, {
      runId: 'run-register-dataset-old',
      releaseId,
      phase: 'registerDataset',
      status: 'completed',
      startedAt: '2026-06-02T00:00:00.000Z',
      finishedAt: '2026-06-02T00:00:00.000Z',
    })
    insertFixtureIngestRun(sqlite, {
      runId: 'run-stage-dataset-old',
      releaseId,
      phase: 'stageDataset',
      status: 'error',
      stats:
        '"{\\"rawObjectKey\\":\\"hk/overture/2026-05-20.0/division-old.parquet\\"}"',
      error: '"{\\"message\\":\\"old failure\\"}"',
      startedAt: '2026-06-02T00:00:01.000Z',
      finishedAt: '2026-06-02T00:00:01.000Z',
    })

    const result = await registerUpload(db, {
      filePath: fixtureFile,
      cohortKey: '2026-05',
      source: 'overture',
      sourceVersion: '2026-05-20.0',
      inspection: fixtureInspection,
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
    })

    const ingestRuns = sqlite
      .query(
        'SELECT runId, phase, status, stats, error, startedAt FROM ingestRuns WHERE releaseId = ? ORDER BY phase ASC',
      )
      .all(releaseId) as Array<{
      error: string | null
      phase: string
      runId: string
      startedAt: string
      stats: string | null
      status: string
    }>

    sqlite.close()

    expect(result.plan.datasetId).toBe('dr-hk-overture-division-2026-05-20.0')
    expect(ingestRuns).toEqual([
      {
        error: null,
        phase: 'registerDataset',
        runId: 'run-register-dataset-old',
        startedAt: expect.any(String),
        stats: expect.stringContaining('"schemaFingerprint"'),
        status: 'completed',
      },
      {
        error: null,
        phase: 'stageDataset',
        runId: 'run-stage-dataset-old',
        startedAt: expect.any(String),
        stats: JSON.stringify({
          rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
          rowCount: 3,
          schemaFieldCount: 5,
        }),
        status: 'completed',
      },
    ])
    expect(ingestRuns[0]?.startedAt).toBe('2026-06-02T00:00:00.000Z')
    expect(ingestRuns[1]?.startedAt).toBe('2026-06-02T00:00:01.000Z')
  })

  test('uses injected schema metadata for remote chronology checks', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const inspection = fixtureInspection

    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-05',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-05-20.0',
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-06',
        source: 'overture',
        sourceVersion: '2026-06-17.0',
        inspection,
        resolveSchemaFingerprint: async () => createSchemaFingerprint(inspection),
      }),
    ).resolves.toMatchObject({
      plan: {
        datasetId: 'dr-hk-overture-division-2026-06-17.0',
        supersedesDatasetId: 'dr-hk-overture-division-2026-05-20.0',
      },
    })

    sqlite.close()
  })

  test('allows the known overture division admin_level schema transition', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-01',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-01-21.0',
      rawObjectKey: 'hk/overture/2026-01-21.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-02',
        source: 'overture',
        sourceVersion: '2026-02-18.0',
        inspection: fixtureInspectionWithAdminLevel,
        resolveSchemaFingerprint: async () =>
          createSchemaFingerprint(fixtureInspection),
      }),
    ).resolves.toMatchObject({
      plan: {
        datasetId: 'dr-hk-overture-division-2026-02-18.0',
        supersedesDatasetId: 'dr-hk-overture-division-2026-01-21.0',
      },
    })

    sqlite.close()
  })

  test('allows the known overture divisionArea admin_level schema transition', async () => {
    await assertAdminLevelTransitionAllowed('divisionArea', 'division-area')
  })

  test('allows the known overture divisionBoundary admin_level schema transition', async () => {
    await assertAdminLevelTransitionAllowed('divisionBoundary', 'division-boundary')
  })

  test('allows the known C&SD density reference-period schema transition', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    seedCenstatdDensityDataset(sqlite)
    const db = createLocalHarbourDb(sqlite)
    const datasetCode =
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
    await registerUpload(db, {
      source: 'hkgov-censtatd',
      regionCode: 'hk',
      cohortKey: '2024',
      datasetCode,
      filePath: fixtureFile,
      inspection: censtatdDensityLegacyInspection,
      theme: 'stats',
      type: 'divisionStatistic',
      sourceVersion: '2024',
      rawObjectKey: 'hk/hkgov-censtatd/2024/density.parquet',
    })
    sqlite.exec("UPDATE releases SET status = 'published';")

    const planned = await planUpload(db, {
      cohortKey: '2024',
      datasetCode,
      filePath: fixtureFile,
      inspection: censtatdDensityReferencePeriodInspection,
      source: 'hkgov-censtatd',
      sourceVersion: '2024',
      theme: 'stats',
      type: 'divisionStatistic',
      allowExistingDatasetStatuses: ['published'],
      resolveSchemaFingerprint: async () =>
        createSchemaFingerprint(censtatdDensityLegacyInspection),
    })

    expect(planned).toMatchObject({
      plan: {
        datasetCode,
        releaseCode:
          'dr-hk-hkgov-censtatd-division-statistic-land-area-population-density-district-2024',
      },
    })

    sqlite.close()
  })

  test('allows schema-compatible uploads when parquet field order changes', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-02',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-02-18.0',
      rawObjectKey: 'hk/overture/2026-02-18.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-03',
        source: 'overture',
        sourceVersion: '2026-03-18.0',
        inspection: reorderedFixtureInspection,
        resolveSchemaFingerprint: async () =>
          createSchemaFingerprint(fixtureInspectionWithAdminLevel),
      }),
    ).resolves.toMatchObject({
      plan: {
        datasetId: 'dr-hk-overture-division-2026-03-18.0',
        supersedesDatasetId: 'dr-hk-overture-division-2026-02-18.0',
      },
    })

    sqlite.close()
  })

  test('still rejects unrelated schema drift', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-01',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-01-21.0',
      rawObjectKey: 'hk/overture/2026-01-21.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-02',
        source: 'overture',
        sourceVersion: '2026-02-18.0',
        inspection: {
          ...fixtureInspection,
          schema: [
            ...fixtureInspection.schema,
            { name: 'wrong_field', type: 'int_32', nullable: true },
          ],
        },
        resolveSchemaFingerprint: async () =>
          createSchemaFingerprint(fixtureInspection),
      }),
    ).rejects.toThrow(`Schema drift detected against dr-hk-overture-division-2026-01-21.0.
Current upload schema has 6 fields; dr-hk-overture-division-2026-01-21.0 recorded 5 fields.
Field-level differences:
- added \`wrong_field\` (int_32, nullable=true)
Reconcile the schema before uploading this dataset.`)

    sqlite.close()
  })

  test('rejects re-upload when the dataset already exists in a non-failed state', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-05',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-05-20.0',
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'processing',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })

    await expect(
      registerUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-20.0',
        inspection: fixtureInspection,
        rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
      }),
    ).rejects.toThrow(
      'Dataset already exists with status processing: ds-hk-overture-division',
    )

    sqlite.close()
  })

  test('continues a completed processing release only when explicitly requested', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-05',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-05-20.0',
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'processing',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })
    insertFixtureIngestRun(sqlite, {
      runId: 'completed-processing-run',
      releaseId,
      phase: 'processDataset',
      status: 'completed',
      startedAt: '2026-06-02T00:00:00.000Z',
      finishedAt: '2026-06-02T00:01:00.000Z',
    })

    await expect(
      registerUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-20.0',
        inspection: fixtureInspection,
        rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
        resumeInterruptedProcessingRelease: true,
      }),
    ).resolves.toMatchObject({ releaseId })

    expect(
      sqlite.query('SELECT status FROM releases WHERE id = ?').get(releaseId),
    ).toEqual({ status: 'staged' })
    sqlite.close()
  })

  test('does not continue a processing release with an active ingest phase', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-05',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-05-20.0',
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'processing',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })
    insertFixtureIngestRun(sqlite, {
      runId: 'completed-processing-run',
      releaseId,
      phase: 'processDataset',
      status: 'completed',
      startedAt: '2026-06-02T00:00:00.000Z',
      finishedAt: '2026-06-02T00:01:00.000Z',
    })
    insertFixtureIngestRun(sqlite, {
      runId: 'active-import-run',
      releaseId,
      phase: 'importPlandSqlSource',
      status: 'running',
      startedAt: '2026-06-02T00:01:00.000Z',
    })

    await expect(
      registerUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-20.0',
        inspection: fixtureInspection,
        rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
        resumeInterruptedProcessingRelease: true,
      }),
    ).rejects.toThrow('phase importPlandSqlSource is still running')

    sqlite.close()
  })

  test('keeps chronology checks scoped to the source', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-05',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-05-20.0',
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-05',
        source: 'hkgov',
        sourceVersion: '2026-01-20.0',
        inspection: fixtureInspection,
        resolveSchemaFingerprint: async () =>
          createSchemaFingerprint(fixtureInspection),
      }),
    ).resolves.toMatchObject({
      plan: {
        datasetId: 'dr-hk-hkgov-division-2026-01-20.0',
        supersedesDatasetId: null,
      },
    })

    sqlite.close()
  })

  test('ignores failed and uploading datasets when selecting the latest upload baseline', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const fixtureFile = createFixturePath(tempDir)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-05',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-05-20.0',
      rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-02T00:00:00.000Z',
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })
    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-06',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-06-24.0',
      rawObjectKey: 'hk/overture/2026-06-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'uploading',
      ingestedAt: '2026-06-03T00:00:00.000Z',
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
      supersededByReleaseCode: 'dr-hk-overture-division-2026-05-20.0',
    })
    insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-07',
      theme: 'divisions',
      type: 'division',
      sourceVersion: '2026-07-24.0',
      rawObjectKey: 'hk/overture/2026-07-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'failed',
      ingestedAt: '2026-06-04T00:00:00.000Z',
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    })

    await expect(
      planUpload(db, {
        filePath: fixtureFile,
        cohortKey: '2026-06',
        source: 'overture',
        sourceVersion: '2026-06-17.0',
        inspection: fixtureInspection,
        resolveSchemaFingerprint: async () =>
          createSchemaFingerprint(fixtureInspection),
      }),
    ).resolves.toMatchObject({
      plan: {
        datasetId: 'dr-hk-overture-division-2026-06-17.0',
        supersedesDatasetId: 'dr-hk-overture-division-2026-05-20.0',
      },
    })

    sqlite.close()
  })
})
