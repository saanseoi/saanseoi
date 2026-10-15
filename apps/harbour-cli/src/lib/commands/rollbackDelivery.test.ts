import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures.ts'
import { buildDivisionSearchSyncSql } from '@repo/core/pipeline/services/search/divisions'
import { captureRollbackDelivery, type RollbackClaim } from './rollbackDelivery.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import type { NetStatement } from '../pipeline/local/netSqlitePlanTypes.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../pipeline/local/nativeSqlDelivery.ts'
import { readDeliveryProgress } from '../pipeline/local/sqlDeliveryFiles.ts'
import { completeSqlDeliveryRelease } from '../pipeline/local/sqlDeliveryPending.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rollback-delivery-test-'))
  const files = {
    DB_CURRENT: join(root, 'current.sqlite'),
    DB_META: join(root, 'meta.sqlite'),
  }
  const current = new Database(files.DB_CURRENT)
  const meta = new Database(files.DB_META)
  current.exec(
    loadMigrationSql(join(import.meta.dir, '../../../../../libs/db/migrations'), [
      'current',
    ]),
  )
  meta.exec(
    "CREATE TABLE resourceReleases(id TEXT PRIMARY KEY,status TEXT);INSERT INTO resourceReleases VALUES('release','current')",
  )
  current.exec(`INSERT INTO divisions(scopeId,id,class,category,level,hierarchies) VALUES('scope','id','district','administrative',2,'{}'),('other','else','district','administrative',2,'{}');
    INSERT INTO divisionsI18n(scopeId,divisionId,locale,name,meta) VALUES('scope','id','en','New term',json_object('fields',json_object('name',json_object('origin','provided')),'isLocaleInferred',json(CASE 0 WHEN 1 THEN 'true' ELSE 'false' END))),('scope','id','zh-hant','保留',json_object('fields',json_object('name',json_object('origin','provided')),'isLocaleInferred',json(CASE 0 WHEN 1 THEN 'true' ELSE 'false' END))),('other','else','en','Other name',json_object('fields',json_object('name',json_object('origin','provided')),'isLocaleInferred',json(CASE 0 WHEN 1 THEN 'true' ELSE 'false' END)));
    INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES('scope','new','current','original','date'),('other','other-snapshot','current','other-token','date');`)
  current.exec(
    buildDivisionSearchSyncSql([
      { scopeId: 'search', snapshotId: 'new' },
      { scopeId: 'other-search', snapshotId: 'other-snapshot' },
    ]).join(';'),
  )
  const context = {
    state: { target: 'local', dbCacheDir: root, files, bindings: {} },
  } as unknown as LocalAddressDbContext
  const claim: RollbackClaim = {
    table: 'divisionPublicationState',
    scopeId: 'scope',
    previous: { snapshotId: 'new', publicationToken: 'original' },
    snapshotId: 'old',
    publicationToken: 'rollback-owner',
  }
  const tables = ['divisions', 'divisionsI18n'].map(name => ({
    name,
    ignoredColumns: ['createdAt'],
    rowScope: { column: 'scopeId', values: ['scope'] },
  }))
  const capture = (
    append: Parameters<typeof captureRollbackDelivery>[0]['append'],
    change = 'Old term',
    remove = false,
  ) =>
    captureRollbackDelivery({
      context,
      tables,
      append,
      prepare: async candidate => {
        if (remove) {
          candidate.query("DELETE FROM divisionsI18n WHERE scopeId='scope'").run()
          candidate.query("DELETE FROM divisions WHERE scopeId='scope'").run()
        } else
          candidate
            .query(
              "UPDATE divisionsI18n SET name=? WHERE scopeId='scope' AND locale='en'",
            )
            .run(change)
        const guard = {
          sql: "SELECT CASE WHEN (SELECT status FROM resourceReleases WHERE id='release')='current' THEN 1 ELSE abs(-9223372036854775808) END",
          params: [],
        }
        const claims = [{ ...claim, snapshotId: remove ? null : 'old' }]
        return {
          claims,
          metadataGuard: guard,
          metadata: [
            guard,
            {
              sql: "UPDATE resourceReleases SET status='revoked' WHERE id='release'",
              params: [],
            },
          ],
          terminal: {
            operation: 'rollback',
            resourceReleaseId: 'release',
            catalogId: 'catalog',
            apiVersionId: 'api',
            regionCode: 'hk',
            claims,
          },
        }
      },
    })
  return {
    root,
    files,
    current,
    meta,
    context,
    claim,
    capture,
    close: async () => {
      current.close()
      meta.close()
      await rm(root, { recursive: true, force: true })
    },
  }
}
const run = (db: Database, items: NetStatement[]) =>
  db.transaction(() => {
    for (const item of items) db.query(item.sql).run(...item.params)
  })()

test('rollback emits one locale change, gates interrupted reads, restores FTS and preserves unrelated documents', async () => {
  const f = await fixture()
  try {
    const before = f.current
      .query("SELECT rowid FROM divisionSearchFts WHERE scopeId='other-search'")
      .get()
    const batches: Array<{ binding: string; statements: NetStatement[] }> = []
    const result = await f.capture(async (target, bytes) => {
      batches.push({
        binding: target.bindingName,
        statements: JSON.parse(new TextDecoder().decode(bytes)),
      })
    })
    expect(result.mutationSummary.tables.DB_CURRENT?.divisionsI18n?.updated).toBe(1)
    expect(result.mutationSummary.tables.DB_CURRENT?.divisions?.updated).toBe(0)
    expect(
      f.current
        .query("SELECT name FROM divisionsI18n WHERE locale='en' AND scopeId='scope'")
        .get(),
    ).toEqual({ name: 'New term' })
    for (const [index, batch] of batches.entries()) {
      run(batch.binding === 'DB_CURRENT' ? f.current : f.meta, batch.statements)
      if (index > 0 && index < batches.length - 1)
        expect(
          f.current
            .query("SELECT status FROM divisionPublicationState WHERE scopeId='scope'")
            .get(),
        ).toEqual({ status: 'publishing' })
    }
    expect(
      f.current
        .query(
          "SELECT snapshotId,status FROM divisionPublicationState WHERE scopeId='scope'",
        )
        .get(),
    ).toEqual({ snapshotId: 'old', status: 'current' })
    expect(
      f.current
        .query(
          "SELECT nameText FROM divisionSearchFts WHERE scopeId='search' AND locale='en'",
        )
        .get(),
    ).toEqual({ nameText: 'Old term' })
    expect(
      f.current
        .query("SELECT rowid FROM divisionSearchFts WHERE scopeId='other-search'")
        .get(),
    ).toEqual(before)
    expect(f.meta.query('SELECT status FROM resourceReleases').get()).toEqual({
      status: 'revoked',
    })
  } finally {
    await f.close()
  }
})

test('unchanged predecessor has zero canonical mutations and no FTS document replacement', async () => {
  const f = await fixture()
  try {
    const before = f.current
      .query('SELECT rowid,* FROM divisionSearchFts ORDER BY rowid')
      .all()
    const batches: Array<{ binding: string; statements: NetStatement[] }> = []
    const result = await f.capture(async (target, bytes) => {
      batches.push({
        binding: target.bindingName,
        statements: JSON.parse(new TextDecoder().decode(bytes)),
      })
    }, 'New term')
    expect(result.mutationSummary.statements).toBe(0)
    for (const batch of batches)
      run(batch.binding === 'DB_CURRENT' ? f.current : f.meta, batch.statements)
    expect(
      f.current.query('SELECT rowid,* FROM divisionSearchFts ORDER BY rowid').all(),
    ).toEqual(before)
  } finally {
    await f.close()
  }
})

test('rollback refuses stale owners before any content mutation', async () => {
  const f = await fixture()
  try {
    const batches: Array<{ binding: string; statements: NetStatement[] }> = []
    await f.capture(async (target, bytes) => {
      batches.push({
        binding: target.bindingName,
        statements: JSON.parse(new TextDecoder().decode(bytes)),
      })
    })
    f.current.exec(
      "UPDATE divisionPublicationState SET publicationToken='changed' WHERE scopeId='scope'",
    )
    run(f.meta, batches[0]!.statements)
    expect(() => run(f.current, batches[1]!.statements)).toThrow()
    expect(
      f.current
        .query("SELECT name FROM divisionsI18n WHERE locale='en' AND scopeId='scope'")
        .get(),
    ).toEqual({ name: 'New term' })
  } finally {
    await f.close()
  }
})

test('first-release rollback removes only its owned scope and search documents', async () => {
  const f = await fixture()
  try {
    const batches: Array<{ binding: string; statements: NetStatement[] }> = []
    await f.capture(
      async (target, bytes) => {
        batches.push({
          binding: target.bindingName,
          statements: JSON.parse(new TextDecoder().decode(bytes)),
        })
      },
      '',
      true,
    )
    for (const batch of batches)
      run(batch.binding === 'DB_CURRENT' ? f.current : f.meta, batch.statements)
    expect(
      f.current.query("SELECT 1 FROM divisions WHERE scopeId='scope'").get(),
    ).toBeNull()
    expect(f.current.query('SELECT scopeId FROM divisionSearchFts').all()).toEqual([
      { scopeId: 'other-search' },
    ])
  } finally {
    await f.close()
  }
})

test('sealed rollback reconciles lost local progress from receipts without repeating FTS writes', async () => {
  const f = await fixture()
  try {
    const directory = join(f.root, 'plan')
    const plan = await prepareNativeSqlDelivery({
      directory,
      ownershipDirectory: f.root,
      files: f.files,
      resourceReleaseId: 'release',
      phase: 'rollback-reconstruction',
      inputs: { operation: 'rollback' },
      generate: append => f.capture(append),
    })
    await runNativeSqlDelivery(directory, { files: f.files })
    const before = f.current
      .query('SELECT rowid,* FROM divisionSearchFts ORDER BY rowid')
      .all()
    const progress = await readDeliveryProgress(directory, plan)
    progress.local = {}
    await writeFile(join(directory, 'progress.json'), JSON.stringify(progress))
    await runNativeSqlDelivery(directory, { files: f.files })
    expect(
      f.current.query('SELECT rowid,* FROM divisionSearchFts ORDER BY rowid').all(),
    ).toEqual(before)
    expect(await completeSqlDeliveryRelease(f.root, 'release')).toBe(true)
    const text = await readFile(join(directory, '0.json'), 'utf8')
    await writeFile(join(directory, '0.json'), `${text} `)
    await expect(runNativeSqlDelivery(directory, { files: f.files })).rejects.toThrow(
      'changed',
    )
  } finally {
    await f.close()
  }
})

test('Places rollback delivers shared definitions before scalars and resumes interrupted or unacknowledged payloads', async () => {
  const { preparePlaceDivisionDefinitions } = await import(
    '../pipeline/places/placeDivisionDefinitions'
  )
  const { buildPlaceSearchSyncSql } = await import(
    '@repo/core/pipeline/services/places/searchIndex'
  )
  const f = await fixture()
  try {
    const definitions = (id: string) =>
      preparePlaceDivisionDefinitions(
        { districtId: id },
        { [id]: { level: 2, locales: [{ locale: 'en', name: id }] } },
        id,
      )
    const newer = definitions('new-district'),
      older = definitions('old-district')
    f.current
      .query('INSERT INTO placeDivisionDefinitions(id,definition) VALUES (?,?)')
      .run(newer.id, JSON.stringify(newer.definition))
    for (const scope of ['place-scope', 'other-place']) {
      f.current
        .query(
          "INSERT INTO places(scopeId,id,resourceReleaseId,geometry,firstSeenMonth,districtId,divisionDefinitionSetId) VALUES(?,'p','release','{}','2026-01','new-district',?)",
        )
        .run(scope, newer.id)
      f.current
        .query(
          "INSERT INTO placesI18n(scopeId,placeId,locale,name,searchDependencyText) VALUES(?,'p','en','Place',?)",
        )
        .run(
          scope,
          JSON.stringify({
            addressSnapshotId: null,
            addressText: '',
            divisionText: 'new-district',
            streetText: '',
          }),
        )
      f.current
        .query(
          "INSERT INTO placePublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES(?,?,'current','original','ready')",
        )
        .run(scope, scope)
    }
    f.current.exec(
      buildPlaceSearchSyncSql([
        { scopeId: 'places-search', snapshotId: 'place-scope' },
        { scopeId: 'other-places-search', snapshotId: 'other-place' },
      ]).join(';'),
    )
    const unrelated = f.current
      .query("SELECT rowid,* FROM places WHERE scopeId='other-place'")
      .get()
    const unrelatedFts = f.current
      .query("SELECT rowid,* FROM placeSearchFts WHERE scopeId='other-places-search'")
      .all()
    const claim: RollbackClaim = {
      table: 'placePublicationState',
      scopeId: 'place-scope',
      previous: { snapshotId: 'place-scope', publicationToken: 'original' },
      snapshotId: 'place-old',
      publicationToken: 'rollback-place',
    }
    const directory = join(f.root, 'places-plan')
    const plan = await prepareNativeSqlDelivery({
      directory,
      ownershipDirectory: f.root,
      files: f.files,
      resourceReleaseId: 'release',
      phase: 'rollback-reconstruction',
      inputs: { family: 'place' },
      generate: append =>
        captureRollbackDelivery({
          context: f.context,
          append,
          tables: [
            { name: 'placeDivisionDefinitions', ignoredColumns: [] },
            ...['places', 'placesI18n'].map(name => ({
              name,
              ignoredColumns: ['createdAt'],
              rowScope: { column: 'scopeId', values: ['place-scope'] },
            })),
          ],
          prepare: async candidate => {
            candidate
              .query('INSERT INTO placeDivisionDefinitions(id,definition) VALUES (?,?)')
              .run(older.id, JSON.stringify(older.definition))
            candidate
              .query(
                "UPDATE places SET districtId='old-district',divisionDefinitionSetId=? WHERE scopeId='place-scope'",
              )
              .run(older.id)
            candidate.exec(
              "UPDATE placesI18n SET searchDependencyText=json_set(searchDependencyText,'$.divisionText','old-district') WHERE scopeId='place-scope'",
            )
            return {
              claims: [claim],
              metadataGuard: { sql: 'SELECT 1', params: [] },
              metadata: [
                {
                  sql: "UPDATE resourceReleases SET status='revoked' WHERE id='release'",
                  params: [],
                },
              ],
              terminal: {
                operation: 'rollback',
                resourceReleaseId: 'release',
                catalogId: 'catalog',
                apiVersionId: 'api',
                regionCode: 'hk',
                claims: [claim],
              },
            }
          },
        }),
    })
    await expect(
      runNativeSqlDelivery(directory, {
        files: f.files,
        onProgress: completed => {
          if (completed === 2) throw new Error('interrupted Places rollback')
        },
      }),
    ).rejects.toThrow('interrupted Places rollback')
    await runNativeSqlDelivery(directory, { files: f.files })
    expect(
      f.current
        .query(
          "SELECT districtId,divisionDefinitionSetId FROM places WHERE scopeId='place-scope'",
        )
        .get(),
    ).toEqual({ districtId: 'old-district', divisionDefinitionSetId: older.id })
    expect(f.current.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(
      f.current.query("SELECT rowid,* FROM places WHERE scopeId='other-place'").get(),
    ).toEqual(unrelated)
    expect(
      f.current
        .query("SELECT rowid,* FROM placeSearchFts WHERE scopeId='other-places-search'")
        .all(),
    ).toEqual(unrelatedFts)
    const documents = f.current
      .query('SELECT rowid,* FROM placeSearchFts ORDER BY rowid')
      .all()
    const progress = await readDeliveryProgress(directory, plan)
    progress.local = {}
    await writeFile(join(directory, 'progress.json'), JSON.stringify(progress))
    await runNativeSqlDelivery(directory, { files: f.files })
    expect(
      f.current.query('SELECT rowid,* FROM placeSearchFts ORDER BY rowid').all(),
    ).toEqual(documents)
  } finally {
    await f.close()
  }
})
