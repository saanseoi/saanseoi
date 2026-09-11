import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
} from '@repo/core/pipeline/db/snapshotReplay'
import {
  hashDivisionGeometryRow,
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
  type DivisionGeometryKind,
} from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows.ts'

function geometry(kind: DivisionGeometryKind, id: string, edge = 115) {
  const row =
    kind === 'divisionArea'
      ? normaliseDivisionAreaGeometryRow({
          id,
          division_id: 'division',
          class: 'land',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [114, 22],
                [edge, 22],
                [edge, 23],
                [114, 22],
              ],
            ],
          },
        })
      : normaliseDivisionBoundaryGeometryRow({
          id,
          division_ids: ['left', 'right'],
          class: 'land',
          geometry: {
            type: 'LineString',
            coordinates: [
              [114, 22],
              [edge, 23],
            ],
          },
        })
  if (!row) throw new Error('Invalid geometry fixture')
  return row
}

function fixture(kind: DivisionGeometryKind) {
  const current = new Database(':memory:')
  const old = new Database(':memory:')
  const next = new Database(':memory:')
  const source = new Database(':memory:')
  const meta = new Database(':memory:')
  for (const [db, family] of [
    [current, 'current'],
    [old, 'history'],
    [next, 'history'],
    [source, 'source'],
  ] as const)
    db.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        family,
      ]),
    )
  meta.exec(`CREATE TABLE snapshots(id TEXT PRIMARY KEY,parentSnapshotId TEXT);
    CREATE TABLE dataShards(id TEXT PRIMARY KEY,bindingName TEXT);
    CREATE TABLE snapshotShardAssignments(snapshotId TEXT,dataShardId TEXT);
    INSERT INTO dataShards VALUES('old','DB_HISTORY_2025'),('next','DB_HISTORY_2026');`)
  const historyTargets = [
    [old, '2025'],
    [next, '2026'],
  ].map(([db, year]) => ({
    bindingName: `DB_HISTORY_${year}`,
    db: drizzle({ client: db as Database, schema: historySchema }),
    year,
  }))
  const context = {
    currentDb: drizzle({ client: current, schema: currentSchema }),
    sourceDb: drizzle({ client: source, schema: sourceSchema }),
    metaDb: drizzle({ client: meta }),
    historyTargets,
  } as unknown as LocalAddressDbContext
  const shards = new Map(
    historyTargets.map(target => [target.bindingName, target]),
  ) as unknown as Map<string, ReplayShard>
  const table = kind === 'divisionArea' ? 'divisionAreas' : 'divisionBoundaries'
  const publicationTable = `${kind}PublicationState`
  const selectContext = (binding: 'old' | 'next') => ({
    ...context,
    historyDb: historyTargets[binding === 'old' ? 0 : 1]!
      .db as unknown as LocalAddressDbContext['historyDb'],
    historyBinding: createLocalExecBinding(
      binding === 'old' ? old : next,
      `DB_HISTORY_${binding === 'old' ? '2025' : '2026'}`,
    ),
  })
  async function write(
    snapshotId: string,
    parentSnapshotId: string | null,
    rows: ReturnType<typeof geometry>[],
    options: { binding?: 'old' | 'next'; cohortKey?: string; merge?: boolean } = {},
  ) {
    const binding = options.binding ?? 'old'
    const result = await writeGeometryRows(selectContext(binding), kind, rows, {
      source: 'overture',
      variant: 'overture',
      releaseId: snapshotId,
      releaseCode: snapshotId,
      sourceVersion: snapshotId,
      snapshotId,
      snapshotLineageId: 'lineage',
      parentSnapshotId,
      cohortKey: options.cohortKey ?? '2026',
      merge: options.merge,
    })
    meta.query('INSERT INTO snapshots VALUES(?,?)').run(snapshotId, parentSnapshotId)
    meta
      .query('INSERT INTO snapshotShardAssignments VALUES(?,?)')
      .run(snapshotId, binding)
    return result
  }
  const journal = (db: Database, snapshotId: string) =>
    db
      .query(
        'SELECT recordId,operation FROM snapshotVersionChanges WHERE snapshotId=? ORDER BY recordId',
      )
      .all(snapshotId)
  const replay = async (snapshotId: string) =>
    [
      ...(
        await resolveSnapshotVersionState(
          await resolveSnapshotReplayPlan(context.metaDb as never, snapshotId),
          shards,
          [kind],
        )
      ).values(),
    ].sort((a, b) => a.recordId.localeCompare(b.recordId))
  const state = () => [
    current.query(`SELECT * FROM ${table} ORDER BY snapshotId,id`).all(),
    current.query(`SELECT * FROM ${publicationTable} ORDER BY snapshotId`).all(),
    ...[old, next].flatMap(db => [
      db.query(`SELECT * FROM ${table} ORDER BY id,versionHash`).all(),
      db
        .query('SELECT * FROM snapshotVersionChanges ORDER BY snapshotId,recordId')
        .all(),
      db
        .query('SELECT * FROM sourceResolutions ORDER BY snapshotId,sourceRecordId')
        .all(),
    ]),
    source
      .query(
        `SELECT * FROM overture${table[0]!.toUpperCase()}${table.slice(1)} ORDER BY sourceRecordId,versionHash`,
      )
      .all(),
  ]
  return {
    current,
    old,
    next,
    meta,
    context,
    table,
    publicationTable,
    write,
    journal,
    replay,
    state,
    close: () => {
      for (const db of [current, old, next, source, meta]) db.close()
    },
  }
}

for (const kind of ['divisionArea', 'divisionBoundary'] as const) {
  test(`${kind} inherits unchanged membership and owning shards across history years`, async () => {
    const f = fixture(kind)
    try {
      const rows = [geometry(kind, 'a'), geometry(kind, 'b')]
      await f.write('root', null, rows)
      const unchanged = await f.write('child', 'root', rows, { binding: 'next' })
      expect(unchanged.churn.unchanged).toBe(2)
      expect(unchanged.currentChanges.changedCurrentIds).toEqual([])
      expect(f.journal(f.next, 'child')).toEqual([])
      expect(f.next.query(`SELECT count(*) AS n FROM ${f.table}`).get()).toEqual({
        n: 0,
      })
      expect(
        (await f.replay('child')).map(version => [
          version.recordId,
          version.sourceReleaseId,
          version.shard.bindingName,
        ]),
      ).toEqual([
        ['a', 'root', 'DB_HISTORY_2025'],
        ['b', 'root', 'DB_HISTORY_2025'],
      ])
      // Publisher occurrences keep their independent provenance contract.
      expect(
        f.next
          .query(
            "SELECT count(*) AS n FROM sourceResolutions WHERE snapshotId='child' AND sourceReleaseId='child'",
          )
          .get(),
      ).toEqual({ n: 2 })
    } finally {
      f.close()
    }
  })

  test(`${kind} replays changes, removals and reappearance independently of history current flags`, async () => {
    const f = fixture(kind)
    try {
      const original = [geometry(kind, 'a'), geometry(kind, 'b'), geometry(kind, 'c')]
      await f.write('root', null, original)
      f.old.exec(`UPDATE ${f.table} SET isCurrent=0`)
      const changed = geometry(kind, 'a', 116)
      await f.write('child', 'root', [changed, original[1]!], { binding: 'next' })
      expect(f.journal(f.next, 'child')).toEqual([
        { recordId: 'a', operation: 'upsert' },
        { recordId: 'c', operation: 'delete' },
      ])
      expect(
        (await f.replay('child')).map(version => [
          version.recordId,
          version.shard.bindingName,
        ]),
      ).toEqual([
        ['a', 'DB_HISTORY_2026'],
        ['b', 'DB_HISTORY_2025'],
      ])
      expect((await f.replay('child'))[0]!.versionHash).toBe(
        await hashDivisionGeometryRow(changed.canonical),
      )
      await f.write('reappeared', 'child', [changed, original[1]!, original[2]!], {
        binding: 'next',
      })
      expect(f.journal(f.next, 'reappeared')).toEqual([
        { recordId: 'c', operation: 'upsert' },
      ])
      expect(
        (await f.replay('reappeared')).map(version => [
          version.recordId,
          version.shard.bindingName,
        ]),
      ).toEqual([
        ['a', 'DB_HISTORY_2026'],
        ['b', 'DB_HISTORY_2025'],
        ['c', 'DB_HISTORY_2026'],
      ])
      expect(f.next.query(`SELECT id FROM ${f.table} ORDER BY id`).all()).toEqual([
        { id: 'a' },
        { id: 'c' },
      ])
      const root = await f.replay('root')
      expect(root.map(version => version.recordId)).toEqual(['a', 'b', 'c'])
      expect(root[0]!.versionHash).toBe(
        await hashDivisionGeometryRow(original[0]!.canonical),
      )
    } finally {
      f.close()
    }
  })

  test(`${kind} parentless checkpoints retain full membership and distinct cohort projections`, async () => {
    const f = fixture(kind)
    try {
      const rows = [geometry(kind, 'a')]
      await f.write('root', null, rows)
      await f.write('checkpoint', null, rows, { cohortKey: '2027' })
      expect(f.journal(f.old, 'checkpoint')).toEqual([
        { recordId: 'a', operation: 'upsert' },
      ])
      expect((await f.replay('checkpoint')).map(version => version.recordId)).toEqual([
        'a',
      ])
      expect(f.current.query(`SELECT count(*) AS n FROM ${f.table}`).get()).toEqual({
        n: 2,
      })
      await f.write('empty-checkpoint', null, [], { cohortKey: '2028' })
      expect(f.journal(f.old, 'empty-checkpoint')).toEqual([])
      expect(await f.replay('empty-checkpoint')).toEqual([])
    } finally {
      f.close()
    }
  })

  test(`${kind} merges partial inputs with sparse inherited membership`, async () => {
    const f = fixture(kind)
    try {
      await f.write('root', null, [geometry(kind, 'a'), geometry(kind, 'b')])
      await f.write('child', 'root', [geometry(kind, 'a'), geometry(kind, 'c')], {
        binding: 'next',
        merge: true,
      })
      expect(f.journal(f.next, 'child')).toEqual([
        { recordId: 'c', operation: 'upsert' },
      ])
      expect(f.current.query(`SELECT id FROM ${f.table} ORDER BY id`).all()).toEqual([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ])
      expect(
        (await f.replay('child')).map(version => [
          version.recordId,
          version.shard.bindingName,
        ]),
      ).toEqual([
        ['a', 'DB_HISTORY_2025'],
        ['b', 'DB_HISTORY_2025'],
        ['c', 'DB_HISTORY_2026'],
      ])
    } finally {
      f.close()
    }
  })

  for (const problem of [
    'missing assignment',
    'unavailable shard',
    'missing content',
    'incomplete journal',
    'wrong content hash',
  ] as const)
    test(`${kind} rejects ${problem} in its parent before writing`, async () => {
      const f = fixture(kind)
      try {
        const rows = [geometry(kind, 'a'), geometry(kind, 'b')]
        await f.write('root', null, rows)
        if (problem === 'missing assignment')
          f.meta.exec('DELETE FROM snapshotShardAssignments')
        if (problem === 'unavailable shard')
          f.context.historyTargets = f.context.historyTargets.filter(
            target => target.bindingName !== 'DB_HISTORY_2025',
          )
        if (problem === 'missing content')
          f.old.exec(`DELETE FROM ${f.table} WHERE id='b'`)
        if (problem === 'incomplete journal')
          f.old.exec("DELETE FROM snapshotVersionChanges WHERE recordId='b'")
        if (problem === 'wrong content hash')
          f.old.exec(`UPDATE ${f.table} SET type='maritime' WHERE id='b'`)
        const before = f.state()
        await expect(
          f.write('child', 'root', rows, { binding: 'next' }),
        ).rejects.toThrow()
        expect(f.state()).toEqual(before)
      } finally {
        f.close()
      }
    })

  test(`${kind} forward ingest after rollback uses the restored parent selection`, async () => {
    const f = fixture(kind)
    try {
      const original = geometry(kind, 'a')
      await f.write('root', null, [original, geometry(kind, 'removed')])
      const restored = new Map(
        [f.table, f.publicationTable].map(table => [
          table,
          f.current
            .query<Record<string, SQLQueryBindings>, []>(`SELECT * FROM ${table}`)
            .all(),
        ]),
      )
      const changed = geometry(kind, 'a', 116)
      await f.write('revoked', 'root', [changed], { binding: 'next' })
      for (const [table, rows] of restored) {
        f.current.exec(`DELETE FROM ${table}`)
        for (const row of rows) {
          const columns = Object.keys(row)
          f.current
            .query(
              `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
            )
            .run(...columns.map(column => row[column] ?? null))
        }
      }
      // A rollback restores membership without rewriting every history cache flag.
      f.old.exec(`UPDATE ${f.table} SET isCurrent=0`)
      await f.write('replacement', 'root', [changed], { binding: 'next' })
      expect(f.journal(f.next, 'replacement')).toEqual([
        { recordId: 'a', operation: 'upsert' },
        { recordId: 'removed', operation: 'delete' },
      ])
      expect(
        (await f.replay('replacement')).map(version => [
          version.recordId,
          version.sourceReleaseId,
        ]),
      ).toEqual([['a', 'replacement']])
      expect(f.next.query(`SELECT count(*) AS n FROM ${f.table}`).get()).toEqual({
        n: 1,
      })
      await f.write('unchanged', 'replacement', [changed], { binding: 'next' })
      expect(f.journal(f.next, 'unchanged')).toEqual([])
    } finally {
      f.close()
    }
  })
}
