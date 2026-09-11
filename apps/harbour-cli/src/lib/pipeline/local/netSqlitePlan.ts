import { Database } from 'bun:sqlite'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { journalNetTable } from './netSqlitePlanDiff.ts'
import { postponeNetParentDeletions } from './netSqlitePlanDependencies.ts'
import {
  assertNetForeignKeys,
  assertNetReplayEqualsCandidate,
  assertNetSchema,
  normaliseNetIgnoredColumns,
  orderNetTables,
  readNetTables,
} from './netSqlitePlanSchema.ts'
import {
  quoteNetIdentifier as q,
  type NetSqlitePlanInput,
  type NetSqlitePlanSummary,
  type NetStatement,
  type NetTable,
  type NetTableSummary,
} from './netSqlitePlanTypes.ts'

export type {
  NetSqlitePlanInput,
  NetSqlitePlanSummary,
  NetTablePolicy,
} from './netSqlitePlanTypes.ts'

/**
 * Resolve on isolated WAL-safe copies, then compile and replay only final row changes.
 * The caller holds the mirror-wide delivery lock throughout capture and plan sealing.
 * Appends start only after every target passes schema, budgets, FK and exact replay checks.
 * Local scratch tables are allowed; only explicitly selected persistent tables are delivered.
 */
export async function captureNetSqlitePlan<T>(input: NetSqlitePlanInput<T>) {
  const maxStatements = input.limits?.maxStatements ?? 64
  const maxPayloadBytes = input.limits?.maxPayloadBytes ?? 4 * 1024 * 1024
  if (
    !Number.isInteger(maxStatements) ||
    maxStatements < 2 ||
    maxStatements > 512 ||
    !Number.isInteger(maxPayloadBytes) ||
    maxPayloadBytes < 256 ||
    maxPayloadBytes > 16 * 1024 * 1024
  )
    throw new Error('Invalid bounded net-plan payload limits.')
  const directory = await mkdtemp(join(tmpdir(), 'harbour-net-plan-'))
  const journalPath = join(directory, 'journal.sqlite')
  const journal = new Database(journalPath)
  const candidates: Record<string, { db: Database; path: string }> = {}
  const exactClients: Database[] = []
  const baselines: Record<string, string> = {}
  const tables: Record<string, NetTable[]> = {}
  const summary: NetSqlitePlanSummary = {
    tables: {},
    statements: 0,
    batches: 0,
    bytes: 0,
  }
  try {
    journal.exec(`PRAGMA temp_store=FILE;
      CREATE TABLE mutations(seq INTEGER PRIMARY KEY, binding TEXT NOT NULL, groupKey TEXT NOT NULL, sortOrder INTEGER NOT NULL, statement TEXT NOT NULL, tableName TEXT NOT NULL, kind TEXT NOT NULL, rowKey TEXT NOT NULL);
      CREATE INDEX mutations_group ON mutations(binding,groupKey,sortOrder,seq);
      CREATE INDEX mutations_row ON mutations(binding,tableName,kind,rowKey);
      CREATE TABLE lateDeletes(binding TEXT NOT NULL,tableName TEXT NOT NULL,rowKey TEXT NOT NULL,PRIMARY KEY(binding,tableName,rowKey));
      CREATE TABLE payloads(seq INTEGER PRIMARY KEY, binding TEXT NOT NULL, contents TEXT NOT NULL);`)
    const entries = Object.entries(input.targets)
    for (const [index, [binding, target]] of entries.entries()) {
      const baseline = join(directory, `${index}.baseline.sqlite`)
      const source = new Database(target.path, { readonly: true, create: false })
      try {
        source.query('VACUUM INTO ?').run(baseline)
      } finally {
        source.close()
      }
      baselines[binding] = baseline
      const path = join(directory, `${index}.candidate.sqlite`)
      await copyFile(baseline, path)
      const db = new Database(path, { readwrite: true, create: false })
      candidates[binding] = { db, path }
      db.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=FILE;')
      tables[binding] = orderNetTables(readNetTables(db, target.tables))
    }
    const result = await input.generate(candidates)
    const insert = journal.query(
      'INSERT INTO mutations(binding,groupKey,sortOrder,statement,tableName,kind,rowKey) VALUES(?,?,?,?,?,?,?)',
    )
    let sequence = 0
    for (const [binding] of entries) {
      const candidate = candidates[binding]
      const baseline = baselines[binding]
      const ordered = tables[binding]
      if (!candidate || !baseline || !ordered)
        throw new Error('Missing net-plan target.')
      if (candidate.db.inTransaction)
        throw new Error(`Net-plan generation left an open transaction: ${binding}`)
      // Existing planners use ordinary numeric results. Exact diff readers preserve
      // all SQLite integers, including values above JavaScript's safe range.
      const db = new Database(candidate.path, {
        readwrite: true,
        create: false,
        safeIntegers: true,
      })
      exactClients.push(db)
      db.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=FILE;')
      db.query('ATTACH DATABASE ? AS net_baseline').run(baseline)
      for (const table of ordered) {
        assertNetSchema(db, table)
        if (!input.bootstrap) normaliseNetIgnoredColumns(db, table)
      }
      assertNetForeignKeys(db)
      const counts: Record<string, NetTableSummary> = {}
      summary.tables[binding] = counts
      journal.transaction(() => {
        for (const [rank, table] of ordered.entries()) {
          counts[table.policy.name] = journalNetTable({
            db,
            table,
            bootstrap: input.bootstrap ?? false,
            record(kind, statement, group, rowKey) {
              // Parent deletions which would affect surviving children are moved
              // after inserts and updates once the complete delta is known.
              const sort =
                kind === 'delete'
                  ? ordered.length - rank - 1
                  : kind === 'insert'
                    ? ordered.length + rank
                    : ordered.length * 2 + rank
              insert.run(
                binding,
                group ?? `singleton:${++sequence}`,
                sort,
                JSON.stringify(statement),
                table.policy.name,
                kind,
                rowKey,
              )
              summary.statements++
            },
          })
        }
      })()
      if (!input.bootstrap)
        postponeNetParentDeletions({ db, journalPath, binding, tables: ordered })
      journalPayloads(journal, binding, { maxStatements, maxPayloadBytes }, summary)
      const replayPath = join(
        directory,
        `${entries.findIndex(([name]) => name === binding)}.replay.sqlite`,
      )
      await copyFile(baseline, replayPath)
      const replay = new Database(replayPath, {
        readwrite: true,
        create: false,
        safeIntegers: true,
      })
      try {
        if (input.bootstrap) {
          replay.exec('PRAGMA foreign_keys=OFF')
          replay.transaction(() => {
            for (const table of ordered.toReversed())
              replay.exec(`DELETE FROM ${q(table.policy.name)}`)
          })()
        }
        replay.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=FILE;')
        for (const payload of journal
          .query<{ contents: string }, [string]>(
            'SELECT contents FROM payloads WHERE binding=? ORDER BY seq',
          )
          .iterate(binding)) {
          const statements = JSON.parse(payload.contents) as NetStatement[]
          replay.transaction(() => {
            for (const statement of statements)
              replay.query(statement.sql).run(...statement.params)
          })()
        }
        assertNetForeignKeys(replay)
        replay.query('ATTACH DATABASE ? AS net_candidate').run(candidate.path)
        assertNetReplayEqualsCandidate(replay, ordered)
      } catch (error) {
        throw new Error(
          `Net-plan replay failed for ${binding}; no writes were emitted. ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        )
      } finally {
        replay.close()
      }
    }
    for (const row of journal
      .query<{ binding: string; contents: string }, []>(
        'SELECT binding,contents FROM payloads ORDER BY seq',
      )
      .iterate()) {
      const target = input.targets[row.binding]
      if (!target) throw new Error('Unknown net-plan delivery target.')
      await input.append(
        { bindingName: row.binding, databaseId: target.databaseId ?? row.binding },
        Buffer.from(row.contents),
        'bound',
      )
    }
    return { result, summary }
  } finally {
    for (const client of exactClients) client.close()
    for (const candidate of Object.values(candidates)) candidate.db.close()
    journal.close()
    await rm(directory, { recursive: true, force: true })
  }
}

function journalPayloads(
  journal: Database,
  binding: string,
  limits: { maxStatements: number; maxPayloadBytes: number },
  summary: NetSqlitePlanSummary,
) {
  let pending: NetStatement[] = []
  let bytes = 2
  const store = journal.query('INSERT INTO payloads(binding,contents) VALUES(?,?)')
  const flush = () => {
    if (!pending.length) return
    const contents = JSON.stringify(pending)
    store.run(binding, contents)
    summary.batches++
    summary.bytes += Buffer.byteLength(contents)
    pending = []
    bytes = 2
  }
  const groups = journal.query<{ groupKey: string }, [string]>(
    // A locale deletion must not pull its collection update ahead of a newly
    // inserted owner. Every collection waits until its last dependency stage.
    'SELECT groupKey FROM mutations WHERE binding=? GROUP BY groupKey ORDER BY max(sortOrder),min(seq)',
  )
  const members = journal.query<{ statement: string }, [string, string]>(
    'SELECT statement FROM mutations WHERE binding=? AND groupKey=? ORDER BY sortOrder,seq',
  )
  journal.transaction(() => {
    for (const group of groups.iterate(binding)) {
      const collection: NetStatement[] = []
      let collectionBytes = 2
      for (const row of members.iterate(binding, group.groupKey)) {
        collectionBytes += Buffer.byteLength(row.statement) + 1
        if (
          collection.length + 1 > limits.maxStatements - 1 ||
          collectionBytes > limits.maxPayloadBytes
        )
          throw new Error(
            `Net-plan atomic collection exceeds delivery budget: ${group.groupKey}`,
          )
        collection.push(JSON.parse(row.statement) as NetStatement)
      }
      // Deferral ends at the delivery transaction's commit, where SQLite checks FKs.
      const statements =
        collection.length > 1
          ? [{ sql: 'PRAGMA defer_foreign_keys=ON', params: [] }, ...collection]
          : collection
      const size = Buffer.byteLength(JSON.stringify(statements))
      if (size > limits.maxPayloadBytes)
        throw new Error(
          `Net-plan atomic collection exceeds payload budget: ${group.groupKey}`,
        )
      if (
        pending.length + statements.length > limits.maxStatements ||
        bytes + size > limits.maxPayloadBytes
      )
        flush()
      pending.push(...statements)
      bytes += size
    }
    flush()
  })()
}
