import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { coalesceDivisionHistory } from './coalesceDivisionHistory.ts'
import type { ResolvedSqlCandidates } from '../local/resolvedSqlPlan.ts'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay'
import { resolveSnapshotSourceResolutions } from '@repo/core/pipeline/db/sourceResolutionReplay'
import { compressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson'

async function fixture(
  run: (f: {
    before: Record<string, Database>
    candidates: ResolvedSqlCandidates
    coalesce: () => Promise<void>
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'division-components-'))
  const before: Record<string, Database> = {}
  const candidates: ResolvedSqlCandidates = {}
  const files: Record<string, string> = {}
  try {
    for (const [binding, family] of [
      ['DB_CURRENT', 'current'],
      ['DB_META', 'meta'],
      ['DB_SOURCE', 'source'],
      ['DB_HISTORY_OLD', 'history'],
      ['DB_HISTORY_NEW', 'history'],
    ] as const) {
      const path = join(root, `${binding}.sqlite`)
      const db = new Database(path)
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          [family],
        ),
      )
      before[binding] = db
      files[binding] = path
    }
    const current = before.DB_CURRENT!,
      history = before.DB_HISTORY_OLD!,
      meta = before.DB_META!
    current.exec(
      "INSERT INTO divisionPublicationState(scopeId,snapshotId,publicationToken,status,preparedAt,updatedAt) VALUES('scope','old','release-old','ready','original','original')",
    )
    for (const [db, isHistory] of [
      [current, false],
      [history, true],
    ] as const) {
      db.query(`INSERT INTO divisions(${isHistory ? 'versionHash,sourceReleaseId,isCurrent,' : ''}snapshotId,id,class,geometry,sources,hierarchies,createdAt,updatedAt)
        VALUES(${isHistory ? "'old-base','release-old',1," : ''}?,?,?,?,?,'{}',?,?)`).run(
        isHistory ? 'old' : 'scope',
        'district',
        'district',
        JSON.stringify({ type: 'Point', coordinates: [114, 22] }),
        JSON.stringify({
          hkgovPland: { sourceRecordId: 'source', sourceVersion: '2025' },
        }),
        'original',
        'original',
      )
      for (const [locale, name] of [
        ['en', 'Original'],
        ['zh-hant', '原文'],
      ])
        db.query(`INSERT INTO divisionsI18n(${isHistory ? 'versionHash,sourceReleaseId,isCurrent,' : ''}isLocaleInferred,snapshotId,divisionId,locale,name,nameVariant,createdAt,updatedAt)
          VALUES(${isHistory ? "'old-base','release-old',1," : ''}0,?,?,?,?,?,?,?)`).run(
          isHistory ? 'old' : 'scope',
          'district',
          locale!,
          name!,
          JSON.stringify([name]),
          'original',
          'original',
        )
    }
    for (const [snapshot, parent, binding] of [
      ['old', null, 'DB_HISTORY_OLD'],
      ['next', 'old', 'DB_HISTORY_NEW'],
    ] as const) {
      meta
        .query(
          "INSERT INTO snapshots(id,resourceType,code,cohortKey,status,parentSnapshotId,createdAt,updatedAt) VALUES(?,'division',?,'2025','published',?,'original','original')",
        )
        .run(snapshot, snapshot, parent)
      meta
        .query(
          "INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash) VALUES(?,'history','hk',?,'preview',?,?,?,'active','hash')",
        )
        .run(binding, snapshot === 'old' ? '2025' : '2026', binding, binding, binding)
      meta
        .query(
          'INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES(?,?)',
        )
        .run(snapshot, binding)
    }
    for (const [recordType, locale] of [
      ['division', ''],
      ['divisionI18n', 'en'],
      ['divisionI18n', 'zh-hant'],
    ])
      history
        .query(
          "INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId) VALUES('old',?,'district',?,'old-base','upsert','release-old')",
        )
        .run(recordType!, locale!)
    history.exec(
      `INSERT INTO sourceResolutions(scopeId,snapshotId,sourceReleaseId,sourceRecordId,sourceVersionHash,resolutions) VALUES('snapshot:old','old','release-old','source','raw','{"entities":{"division":["district"]}}')`,
    )
    before.DB_SOURCE!.exec(
      "INSERT INTO overtureDivisions(sourceRecordId,versionHash,releaseId,validFromRelease,isCurrent,sourceGeometry) VALUES('source','raw','release-old','2025',1,'{}')",
    )
    for (const [binding, path] of Object.entries(files)) {
      const candidatePath = join(root, `${binding}-candidate.sqlite`)
      await copyFile(path, candidatePath)
      const db = new Database(candidatePath)
      candidates[binding] = {
        db,
        path: candidatePath,
        drizzle: drizzle({ client: db }),
        execute: bytes => db.exec(new TextDecoder().decode(bytes)),
      }
    }
    candidates.DB_CURRENT!.db.exec(
      "UPDATE divisionPublicationState SET snapshotId='next',publicationToken='release-next',status='publishing',preparedAt='now',updatedAt='now'",
    )
    await run({
      before,
      candidates,
      coalesce: () =>
        coalesceDivisionHistory({
          candidates,
          files,
          historyBinding: 'DB_HISTORY_NEW',
        }),
    })
  } finally {
    for (const db of Object.values(before)) db.close()
    for (const value of Object.values(candidates)) value.db.close()
    await rm(root, { recursive: true, force: true })
  }
}

function stage(candidates: ResolvedSqlCandidates, english = 'Original') {
  const old = candidates.DB_HISTORY_OLD!.db,
    next = candidates.DB_HISTORY_NEW!.db,
    current = candidates.DB_CURRENT!.db
  old.exec('UPDATE divisions SET isCurrent=0; UPDATE divisionsI18n SET isCurrent=0')
  next
    .query(
      "INSERT INTO divisions(versionHash,sourceReleaseId,isCurrent,snapshotId,id,class,geometry,sources,hierarchies,createdAt,updatedAt) VALUES('whole-candidate','release-next',1,'next','district','district',?,?,'{}','now','now')",
    )
    .run(
      compressJsonBrotli({ type: 'Point', coordinates: [114, 22] }),
      JSON.stringify({
        hkgovPland: { sourceRecordId: 'source', sourceVersion: '2026' },
      }),
    )
  current.query('UPDATE divisions SET sources=?').run(
    JSON.stringify({
      hkgovPland: { sourceRecordId: 'source', sourceVersion: '2026' },
    }),
  )
  for (const [locale, name] of [
    ['en', english],
    ['zh-hant', '原文'],
  ]) {
    current
      .query('UPDATE divisionsI18n SET name=?,nameVariant=? WHERE locale=?')
      .run(name!, JSON.stringify([name]), locale!)
    next
      .query(
        "INSERT INTO divisionsI18n(versionHash,sourceReleaseId,isCurrent,isLocaleInferred,snapshotId,divisionId,locale,name,nameVariant,createdAt,updatedAt) VALUES('whole-candidate','release-next',1,0,'next','district',?,?,?,'now','now')",
      )
      .run(locale!, name!, JSON.stringify([name]))
  }
  for (const [type, locale] of [
    ['division', ''],
    ['divisionI18n', 'en'],
    ['divisionI18n', 'zh-hant'],
  ])
    next
      .query(
        "INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId) VALUES('next',?,'district',?,'whole-candidate','upsert','release-next')",
      )
      .run(type!, locale!)
  next.exec(
    `INSERT INTO sourceResolutions(scopeId,snapshotId,sourceReleaseId,sourceRecordId,sourceVersionHash,resolutions) VALUES('snapshot:next','next','release-next','source','raw','{"entities":{"division":["district"]}}')`,
  )
}
const plan = [
  {
    snapshotId: 'old',
    parentSnapshotId: null,
    shards: [{ dataShardId: 'old', bindingName: 'DB_HISTORY_OLD' }],
  },
  {
    snapshotId: 'next',
    parentSnapshotId: 'old',
    shards: [{ dataShardId: 'next', bindingName: 'DB_HISTORY_NEW' }],
  },
]
const shards = (candidates: ResolvedSqlCandidates) =>
  new Map(
    Object.entries(candidates)
      .filter(([binding]) => binding.startsWith('DB_HISTORY'))
      .map(([bindingName, candidate]) => [
        bindingName,
        { bindingName, db: candidate.drizzle as never },
      ]),
  )

test('Division reissues inherit unchanged base, every locale and source assertion despite coupled hashes and compressed geometry', () =>
  fixture(async f => {
    stage(f.candidates)
    await f.coalesce()
    for (const table of [
      'divisions',
      'divisionsI18n',
      'snapshotVersionChanges',
      'sourceResolutions',
    ])
      expect(
        f.candidates
          .DB_HISTORY_NEW!.db.query(`SELECT count(*) AS n FROM ${table}`)
          .get(),
      ).toEqual({ n: 0 })
    for (const table of ['divisions', 'divisionsI18n'])
      expect(
        f.candidates.DB_HISTORY_OLD!.db.query(`SELECT * FROM ${table}`).all(),
      ).toEqual(f.before.DB_HISTORY_OLD!.query(`SELECT * FROM ${table}`).all())
    expect(
      f.candidates.DB_CURRENT!.db.query('SELECT sources FROM divisions').get(),
    ).toEqual(f.before.DB_CURRENT!.query('SELECT sources FROM divisions').get())
    expect(
      (await resolveSnapshotSourceResolutions(plan, shards(f.candidates))).get('source')
        ?.shard.bindingName,
    ).toBe('DB_HISTORY_OLD')
  }))

test('a Division locale edit closes only that component in its owning shard and replay inherits others', () =>
  fixture(async f => {
    stage(f.candidates, 'Revised')
    await f.coalesce()
    const next = f.candidates.DB_HISTORY_NEW!.db,
      old = f.candidates.DB_HISTORY_OLD!.db
    expect(
      next.query('SELECT recordType,locale FROM snapshotVersionChanges').all(),
    ).toEqual([{ recordType: 'divisionI18n', locale: 'en' }])
    expect(
      old.query("SELECT isCurrent FROM divisionsI18n WHERE locale='en'").get(),
    ).toEqual({ isCurrent: 0 })
    expect(
      old.query("SELECT isCurrent FROM divisionsI18n WHERE locale='zh-hant'").get(),
    ).toEqual({ isCurrent: 1 })
    const state = await resolveSnapshotVersionState(plan, shards(f.candidates), [
      'division',
      'divisionI18n',
    ])
    expect(
      [...state.values()]
        .map(row => [row.recordType, row.locale, row.shard.bindingName])
        .sort(),
    ).toEqual([
      ['division', '', 'DB_HISTORY_OLD'],
      ['divisionI18n', 'en', 'DB_HISTORY_NEW'],
      ['divisionI18n', 'zh-hant', 'DB_HISTORY_OLD'],
    ])
  }))

test('Division component omissions retire the exact older shard and leave another scope intact', () =>
  fixture(async f => {
    const current = f.candidates.DB_CURRENT!.db,
      old = f.candidates.DB_HISTORY_OLD!.db
    current.exec("DELETE FROM divisionsI18n WHERE locale='zh-hant'")
    old.exec(
      "INSERT INTO divisions(id,versionHash,sourceReleaseId,snapshotId,isCurrent,class,hierarchies) VALUES('foreign','foreign','foreign','foreign',1,'district','{}')",
    )
    await f.coalesce()
    expect(
      old.query("SELECT isCurrent FROM divisionsI18n WHERE locale='zh-hant'").get(),
    ).toEqual({ isCurrent: 0 })
    expect(
      old.query("SELECT isCurrent FROM divisions WHERE id='foreign'").get(),
    ).toEqual({ isCurrent: 1 })
    expect(
      f.candidates
        .DB_HISTORY_NEW!.db.query(
          'SELECT recordType,locale,operation FROM snapshotVersionChanges',
        )
        .all(),
    ).toEqual([{ recordType: 'divisionI18n', locale: 'zh-hant', operation: 'delete' }])
  }))

test('Division source omissions retain explicit evidence while unchanged assertions inherit', () =>
  fixture(async f => {
    f.candidates.DB_SOURCE!.db.exec(
      "UPDATE overtureDivisions SET isCurrent=0 WHERE sourceRecordId='source'",
    )
    await f.coalesce()
    expect(
      (await resolveSnapshotSourceResolutions(plan, shards(f.candidates))).get('source')
        ?.resolutions,
    ).toEqual({ entities: {}, decisions: [{ type: 'source_omission' }] })
  }))
