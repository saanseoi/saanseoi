import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures.ts'
import { requireFullAcknowledgedMirror } from './currentWriteContext.ts'
import { prepareGeometryMirror } from './geometryPreparationContext.ts'
import { DB_CACHE_MANIFEST_VERSION } from './localDbCacheConfig.ts'
import type { DbCacheManifest, LocalAddressDbContext } from './localDbCacheTypes.ts'
import {
  assertSqlDeliveryPlanningAllowed,
  completeSqlDeliveryRelease,
} from '../pipeline/local/sqlDeliveryPending.ts'
import { invalidateSqlDeliveryReleases } from '../pipeline/local/sqlDeliveryGeneration.ts'

const bindings = {
  DB_META: 'meta',
  DB_CURRENT: 'current',
  DB_HISTORY_HK_BEFORE: 'history',
  DB_HISTORY_HK_2026: 'history',
  DB_SOURCE_HK_BEFORE: 'source',
  DB_SOURCE_HK_2026: 'source',
} as const
const migrations = Object.fromEntries(
  ['meta', 'current', 'history', 'source'].map(family => [
    family,
    loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
      family,
    ]),
  ]),
)

async function fixture(
  work: (input: {
    context: LocalAddressDbContext
    directory: string
    manifest: DbCacheManifest
    targets: Array<{
      bindingName: string
      databaseId: string
      databaseName: string
      localDatabaseId: string
    }>
    databases: Record<string, Database>
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'full-current-mirror-'))
  const databases: Record<string, Database> = {}
  const targets = Object.keys(bindings).map(bindingName => ({
    bindingName,
    databaseId: `id-${bindingName}`,
    databaseName: bindingName,
    localDatabaseId: bindingName,
  }))
  const manifest: DbCacheManifest = {
    cacheVersion: DB_CACHE_MANIFEST_VERSION,
    target: 'preview',
    preparedAt: 'acknowledged',
    files: {},
    bindings: Object.fromEntries(
      targets.map(record => [
        record.bindingName,
        {
          databaseId: record.databaseId,
          databaseName: record.databaseName,
        },
      ]),
    ),
  }
  try {
    for (const [binding, family] of Object.entries(bindings)) {
      const path = join(root, `${binding}.sqlite`)
      manifest.files[binding] = path
      const db = new Database(path)
      databases[binding] = db
      db.exec(required(migrations[family]))
      db.exec(
        'CREATE TABLE probe(id TEXT PRIMARY KEY, value TEXT); PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;',
      )
      db.query('INSERT INTO probe VALUES (?, ?)').run(binding, 'acknowledged')
    }
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest))
    const context = {
      state: {
        ...manifest,
        dbCacheDir: root,
      },
    } as unknown as LocalAddressDbContext
    await work({
      context,
      directory: join(root, 'reservation'),
      manifest,
      targets,
      databases,
    })
  } finally {
    for (const db of Object.values(databases)) db.close()
    await rm(root, { recursive: true, force: true })
  }
}

test('full mirror acquisition rejects profiled, scoped, incomplete and rebound manifests', async () => {
  await fixture(async ({ context, manifest, targets }) => {
    const path = join(context.state.dbCacheDir, 'manifest.json')
    expect(
      await requireFullAcknowledgedMirror(context.state.dbCacheDir, 'preview', targets),
    ).toEqual(manifest)
    for (const broken of [
      { ...manifest, cacheTableProfile: 'division' },
      { ...manifest, cacheScopeKey: 'release' },
      { ...manifest, cacheVersion: DB_CACHE_MANIFEST_VERSION - 1 },
      { ...manifest, target: 'production' },
      { ...manifest, bindings: {} },
      {
        ...manifest,
        bindings: {
          ...manifest.bindings,
          DB_CURRENT: { databaseId: 'other', databaseName: 'DB_CURRENT' },
        },
      },
      { ...manifest, files: { ...manifest.files, DB_SOURCE_HK_BEFORE: '' } },
    ]) {
      await writeFile(path, JSON.stringify(broken))
      await expect(
        requireFullAcknowledgedMirror(context.state.dbCacheDir, 'preview', targets),
      ).rejects.toThrow('complete shared')
    }
  })
})

test('geometry reserves the shared mirror and keeps WAL-safe disposable preparation on resume', async () => {
  await fixture(async ({ context, directory, databases }) => {
    const input = {
      context,
      directory,
      releaseId: 'release',
      phase: 'geometry-preparation',
      inputs: { source: 'checksum' },
    }
    const prepared = await prepareGeometryMirror(input)
    for (const [binding, path] of Object.entries(prepared.files)) {
      const scratch = new Database(path)
      try {
        expect(scratch.query('SELECT value FROM probe').get()).toEqual({
          value: 'acknowledged',
        })
        scratch.exec("UPDATE probe SET value='prepared'")
      } finally {
        scratch.close()
      }
      expect(
        required(databases[binding]).query('SELECT value FROM probe').get(),
      ).toEqual({
        value: 'acknowledged',
      })
    }
    await expect(
      assertSqlDeliveryPlanningAllowed(context.state.dbCacheDir, 'another-release'),
    ).rejects.toThrow('unfinished SQL delivery')
    const resumed = await prepareGeometryMirror(input)
    expect(resumed.cloneDir).toBe(prepared.cloneDir)
    const scratch = new Database(required(resumed.files.DB_CURRENT))
    try {
      expect(scratch.query('SELECT value FROM probe').get()).toEqual({
        value: 'prepared',
      })
    } finally {
      scratch.close()
    }
    // Preparation receipts are zero-write reservations, never replacement mirror files.
    expect(await completeSqlDeliveryRelease(context.state.dbCacheDir, 'release')).toBe(
      true,
    )
    expect(
      required(databases.DB_CURRENT).query('SELECT value FROM probe').get(),
    ).toEqual({
      value: 'acknowledged',
    })
  })
})

test('geometry refuses a missing retained copy and changed source or binding inputs', async () => {
  await fixture(async ({ context, directory }) => {
    const input = {
      context,
      directory,
      releaseId: 'release',
      phase: 'geometry-preparation',
      inputs: { source: 'checksum' },
    }
    const prepared = await prepareGeometryMirror(input)
    await expect(
      prepareGeometryMirror({ ...input, inputs: { source: 'changed' } }),
    ).rejects.toThrow('planning context has changed')
    const rebound = {
      ...context,
      state: {
        ...context.state,
        bindings: {
          ...context.state.bindings,
          DB_CURRENT: { databaseId: 'other', databaseName: 'DB_CURRENT' },
        },
      },
    }
    await expect(prepareGeometryMirror({ ...input, context: rebound })).rejects.toThrow(
      'planning context has changed',
    )
    await rm(required(prepared.files.DB_SOURCE_HK_BEFORE))
    await expect(prepareGeometryMirror(input)).rejects.toThrow(
      'missing or incompatible',
    )
  })
})

test('geometry refuses to reuse preparation after a reset generation or mirror generation changes', async () => {
  await fixture(async ({ context, directory, manifest }) => {
    const input = {
      context,
      directory,
      releaseId: 'release',
      phase: 'geometry-preparation',
      inputs: {},
    }
    await prepareGeometryMirror(input)
    const path = join(context.state.dbCacheDir, 'manifest.json')
    await writeFile(path, JSON.stringify({ ...manifest, preparedAt: 'new-generation' }))
    await expect(prepareGeometryMirror(input)).rejects.toThrow(
      'planning context has changed',
    )
    await writeFile(path, JSON.stringify(manifest))
    await invalidateSqlDeliveryReleases(context.state.dbCacheDir, ['release'])
    await expect(prepareGeometryMirror(input)).rejects.toThrow(
      'planning context has changed',
    )
    expect(
      JSON.parse(await readFile(join(directory, 'plan.json'), 'utf8')).outputs.cloneDir,
    ).toBeString()
  })
})

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing mirror fixture value')
  return value
}
