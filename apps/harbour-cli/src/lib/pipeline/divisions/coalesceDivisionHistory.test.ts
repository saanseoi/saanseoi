import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay'
import { compressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson'
import { requireDefined } from '@repo/core/requireDefined'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { insertFixtureSnapshot } from '../../../../../../libs/core/src/testing/snapshotFixtures'
import type { ResolvedSqlCandidates } from '../local/resolvedSqlPlan.ts'
import { coalesceDivisionHistory } from './coalesceDivisionHistory.ts'

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
    const current = requireDefined(before.DB_CURRENT),
      history = requireDefined(before.DB_HISTORY_OLD),
      meta = requireDefined(before.DB_META)
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
          requireDefined(locale),
          requireDefined(name),
          JSON.stringify([name]),
          'original',
          'original',
        )
    }
    for (const [snapshot, parent, binding] of [
      ['old', null, 'DB_HISTORY_OLD'],
      ['next', 'old', 'DB_HISTORY_NEW'],
    ] as const) {
      insertFixtureSnapshot(meta, {
        id: snapshot,
        resourceType: 'division',
        code: snapshot,
        cohortKey: '2025',
        status: 'published',
        parentSnapshotId: parent,
        createdAt: 'original',
        updatedAt: 'original',
      })
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
    requireDefined(before.DB_SOURCE).exec(
      "INSERT INTO overtureDivisions(sourceRecordId,versionHash,resourceReleaseId,validFromRelease,isCurrent,sourceGeometry) VALUES('source','raw','release-old','2025',1,'{}')",
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
    requireDefined(candidates.DB_CURRENT).db.exec(
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
  const _old = requireDefined(candidates.DB_HISTORY_OLD).db,
    next = requireDefined(candidates.DB_HISTORY_NEW).db,
    current = requireDefined(candidates.DB_CURRENT).db
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
      .run(requireDefined(name), JSON.stringify([name]), requireDefined(locale))
    next
      .query(
        "INSERT INTO divisionsI18n(versionHash,sourceReleaseId,isCurrent,isLocaleInferred,snapshotId,divisionId,locale,name,nameVariant,createdAt,updatedAt) VALUES('whole-candidate','release-next',1,0,'next','district',?,?,?,'now','now')",
      )
      .run(requireDefined(locale), requireDefined(name), JSON.stringify([name]))
  }
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
    for (const table of ['divisions', 'divisionsI18n', 'historyEvents'])
      expect(
        requireDefined(f.candidates.DB_HISTORY_NEW)
          .db.query(`SELECT count(*) AS n FROM ${table}`)
          .get(),
      ).toEqual({ n: 0 })
    for (const table of ['divisions', 'divisionsI18n'])
      expect(
        requireDefined(f.candidates.DB_HISTORY_OLD)
          .db.query(`SELECT * FROM ${table}`)
          .all(),
      ).toEqual(
        requireDefined(f.before.DB_HISTORY_OLD).query(`SELECT * FROM ${table}`).all(),
      )
    expect(
      requireDefined(f.candidates.DB_CURRENT)
        .db.query('SELECT sources FROM divisions')
        .get(),
    ).toEqual(
      requireDefined(f.before.DB_CURRENT).query('SELECT sources FROM divisions').get(),
    )
  }))

test('missing parent content is rejected rather than inferred from current flags', () =>
  fixture(async f => {
    stage(f.candidates)
    for (const db of [
      requireDefined(f.before.DB_HISTORY_OLD),
      requireDefined(f.candidates.DB_HISTORY_OLD).db,
    ])
      db.exec("DELETE FROM divisions WHERE snapshotId='old'")
    await expect(f.coalesce()).rejects.toThrow()
  }))

test('a changed locale writes a new event while preserving its parent', () =>
  fixture(async f => {
    stage(f.candidates)
    const oldHistory = requireDefined(f.before.DB_HISTORY_OLD)
    oldHistory
      .query(
        "UPDATE divisionsI18n SET name='Legacy name' WHERE divisionId='district' AND locale='en'",
      )
      .run()
    requireDefined(f.candidates.DB_HISTORY_OLD)
      .db.query(
        "UPDATE divisionsI18n SET name='Legacy name' WHERE divisionId='district' AND locale='en'",
      )
      .run()
    await f.coalesce()
    const oldEnglish = requireDefined(f.candidates.DB_HISTORY_OLD)
      .db.query('SELECT isCurrent FROM divisionsI18n WHERE divisionId=? AND locale=?')
      .all('district', 'en')
    expect(oldEnglish).toEqual([{ isCurrent: 1 }])
    const next = requireDefined(f.candidates.DB_HISTORY_NEW).db
    expect(
      next
        .query(
          'SELECT name,isCurrent FROM divisionsI18n WHERE divisionId=? AND locale=?',
        )
        .all('district', 'en'),
    ).toEqual([{ name: 'Original', isCurrent: 1 }])
    expect(
      next
        .query(
          "SELECT operation,versionHash FROM historyEvents WHERE snapshotId='next' AND recordType='divisionI18n' AND recordId='district' AND locale='en'",
        )
        .get(),
    ).toEqual({ operation: 'upsert', versionHash: 'whole-candidate' })
  }))

test('a Division locale edit closes only that component in its owning shard and replay inherits others', () =>
  fixture(async f => {
    stage(f.candidates, 'Revised')
    await f.coalesce()
    const next = requireDefined(f.candidates.DB_HISTORY_NEW).db,
      old = requireDefined(f.candidates.DB_HISTORY_OLD).db
    expect(next.query('SELECT recordType,locale FROM historyEvents').all()).toEqual([
      { recordType: 'divisionI18n', locale: 'en' },
    ])
    expect(
      old.query("SELECT isCurrent FROM divisionsI18n WHERE locale='en'").get(),
    ).toEqual({ isCurrent: 1 })
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
    const current = requireDefined(f.candidates.DB_CURRENT).db,
      old = requireDefined(f.candidates.DB_HISTORY_OLD).db
    current.exec("DELETE FROM divisionsI18n WHERE locale='zh-hant'")
    old.exec(
      "INSERT INTO divisions(id,versionHash,sourceReleaseId,snapshotId,isCurrent,class,hierarchies) VALUES('foreign','foreign','foreign','foreign',1,'district','{}')",
    )
    await f.coalesce()
    expect(
      old.query("SELECT isCurrent FROM divisionsI18n WHERE locale='zh-hant'").get(),
    ).toEqual({ isCurrent: 1 })
    expect(
      old.query("SELECT isCurrent FROM divisions WHERE id='foreign'").get(),
    ).toEqual({ isCurrent: 1 })
    expect(
      requireDefined(f.candidates.DB_HISTORY_NEW)
        .db.query('SELECT recordType,locale,operation FROM historyEvents')
        .all(),
    ).toEqual([{ recordType: 'divisionI18n', locale: 'zh-hant', operation: 'delete' }])
  }))

test('Division source omissions retain explicit evidence while unchanged assertions inherit', () =>
  fixture(async f => {
    requireDefined(f.candidates.DB_SOURCE).db.exec(
      "UPDATE overtureDivisions SET isCurrent=0 WHERE sourceRecordId='source'",
    )
    await f.coalesce()
  }))

test('Division base changes retain unchanged locales and preserve meaningful identifiers', () =>
  fixture(async f => {
    stage(f.candidates)
    const next = requireDefined(f.candidates.DB_HISTORY_NEW).db
    next.exec(`UPDATE divisions SET identifiers='{"statistical":"district-1"}'`)
    requireDefined(f.candidates.DB_CURRENT).db.exec(
      `UPDATE divisions SET identifiers='{"statistical":"district-1"}'`,
    )
    await f.coalesce()
    expect(next.query('SELECT recordType,locale FROM historyEvents').all()).toEqual([
      { recordType: 'division', locale: '' },
    ])
    expect(next.query('SELECT identifiers FROM divisions').get()).toEqual({
      identifiers: '{"statistical":"district-1"}',
    })
    expect(next.query('SELECT count(*) AS n FROM divisionsI18n').get()).toEqual({
      n: 0,
    })
    expect(
      requireDefined(f.candidates.DB_HISTORY_OLD)
        .db.query('SELECT isCurrent FROM divisions')
        .get(),
    ).toEqual({ isCurrent: 1 })
  }))

test('Division publication after rollback compares against selected A when C repeats historical B', () =>
  fixture(async f => {
    // A remains the serving receipt; B stays retained and flagged current after rollback.
    for (const db of [
      requireDefined(f.before.DB_HISTORY_NEW),
      requireDefined(f.candidates.DB_HISTORY_NEW).db,
    ])
      db.exec(`
        INSERT INTO divisionsI18n(versionHash,sourceReleaseId,isCurrent,isLocaleInferred,snapshotId,divisionId,locale,name,nameVariant,createdAt,updatedAt)
          VALUES('branch-b','release-b',1,0,'branch-b','district','en','Revised','["Revised"]','b','b');
        `)
    for (const db of [
      requireDefined(f.before.DB_HISTORY_OLD),
      requireDefined(f.candidates.DB_HISTORY_OLD).db,
    ])
      db.exec("UPDATE divisionsI18n SET isCurrent=0 WHERE locale='en'")
    requireDefined(f.candidates.DB_META).db.exec(`
      INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'branch-b','fixture-lineage-' || 'branch-b','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='fixture-lineage-' || 'branch-b' AND resourceType IS NULL;
INSERT INTO snapshots(id, snapshotLineageId, code, cohortKey, status, parentSnapshotId) VALUES
('branch-b', 'fixture-lineage-' || 'branch-b', 'branch-b', '2025', 'published', 'old');
      INSERT INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES('branch-b','DB_HISTORY_NEW');`)
    stage(f.candidates, 'Revised')
    await f.coalesce()
    const next = requireDefined(f.candidates.DB_HISTORY_NEW).db
    expect(
      next
        .query(
          "SELECT recordType,locale,versionHash FROM historyEvents WHERE snapshotId='next'",
        )
        .all(),
    ).toEqual([
      { recordType: 'divisionI18n', locale: 'en', versionHash: 'whole-candidate' },
    ])
    const state = await resolveSnapshotVersionState(plan, shards(f.candidates), [
      'division',
      'divisionI18n',
    ])
    const english = requireDefined(state.get('divisionI18n\0district\0en'))
    expect(english.versionHash).toBe('whole-candidate')
    expect(
      next
        .query(
          'SELECT name FROM divisionsI18n WHERE divisionId=? AND versionHash=? AND locale=?',
        )
        .get(english.recordId, english.versionHash, english.locale),
    ).toEqual({ name: 'Revised' })
    expect(state.get('division\0district\0')?.shard.bindingName).toBe('DB_HISTORY_OLD')
    expect(state.get('divisionI18n\0district\0zh-hant')?.shard.bindingName).toBe(
      'DB_HISTORY_OLD',
    )
    expect(
      next
        .query("SELECT isCurrent,name FROM divisionsI18n WHERE versionHash='branch-b'")
        .get(),
    ).toEqual({ isCurrent: 1, name: 'Revised' })
  }))

test('Division coalescing rejects unavailable selected content even when another history version exists', () =>
  fixture(async f => {
    requireDefined(f.before.DB_HISTORY_OLD).exec(
      "DELETE FROM divisionsI18n WHERE locale='en'",
    )
    stage(f.candidates, 'Revised')
    await expect(f.coalesce()).rejects.toThrow(
      'Missing exact Division parent district/en',
    )
  }))

test('Division coalescing permits a new locale with no predecessor', () =>
  fixture(async f => {
    stage(f.candidates)
    requireDefined(f.candidates.DB_CURRENT).db.exec(
      "INSERT INTO divisionsI18n(snapshotId,divisionId,locale,name,isLocaleInferred) VALUES('scope','district','fr','District',0)",
    )
    const next = requireDefined(f.candidates.DB_HISTORY_NEW).db
    next.exec(`
      INSERT INTO divisionsI18n(snapshotId,divisionId,locale,name,isLocaleInferred,versionHash,sourceReleaseId,isCurrent) VALUES('next','district','fr','District',0,'french','release-next',1);
      `)
    await f.coalesce()
    expect(next.query('SELECT locale,versionHash FROM historyEvents').all()).toEqual([
      { locale: 'fr', versionHash: 'french' },
    ])
  }))

test('historical Division reissue compares against its parent even after a later revision occupies current', () =>
  fixture(async f => {
    const baseline = requireDefined(f.before.DB_CURRENT)
    baseline.exec(
      "UPDATE divisionPublicationState SET snapshotId='later'; UPDATE divisionsI18n SET name='Later',nameVariant='[\"Later\"]' WHERE locale='en'",
    )
    stage(f.candidates)
    await f.coalesce()
    const state = await resolveSnapshotVersionState(plan, shards(f.candidates), [
      'division',
      'divisionI18n',
    ])
    expect(state.get('divisionI18n\u0000district\u0000en')?.versionHash).toBe(
      'old-base',
    )
    expect(
      requireDefined(f.candidates.DB_HISTORY_NEW)
        .db.query("SELECT * FROM historyEvents WHERE recordType='divisionI18n'")
        .all(),
    ).toHaveLength(0)
    expect(
      baseline
        .query<{ name: string }, []>("SELECT name FROM divisionsI18n WHERE locale='en'")
        .get()?.name,
    ).toBe('Later')
  }))
