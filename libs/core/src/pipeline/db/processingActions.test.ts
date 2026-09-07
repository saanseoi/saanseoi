import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import { createLocalHarbourDb } from '../../testing/localDb'
import {
  replaceReleaseProcessingActions,
  replaceReleaseProcessingActionsAndReturnRows,
} from './processingActions'
import {
  listReleaseAuditSummaries,
  readAuditPages,
  readReleaseAuditDecisions,
} from './processingActionStorage'
import { buildAuditReplaySql } from './processingActionReplay'

function createProcessingActionsDb() {
  const sqlite = new SQLiteDatabase(':memory:')
  sqlite.exec(`
    CREATE TABLE releases (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      processingRules TEXT,
      updatedAt TEXT NOT NULL DEFAULT 'initial'
    );
    CREATE TABLE releaseProcessingActions (
      id TEXT PRIMARY KEY,
      releaseId TEXT NOT NULL,
      action TEXT NOT NULL,
      mode TEXT NOT NULL,
      generation TEXT NOT NULL,
      decisionCount INTEGER NOT NULL,
      affectedRecordCount INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE releaseProcessingActionChunks (
      id TEXT PRIMARY KEY, releaseId TEXT NOT NULL, actionId TEXT NOT NULL,
      generation TEXT NOT NULL, firstOrdinal INTEGER NOT NULL, decisionCount INTEGER NOT NULL,
      part INTEGER NOT NULL, parts INTEGER NOT NULL, encoding TEXT NOT NULL,
      checksum TEXT NOT NULL, payload BLOB NOT NULL CHECK(length(payload) <= 32768)
    );
    CREATE TABLE stats (
      id TEXT PRIMARY KEY,
      releaseId TEXT,
      snapshotId TEXT,
      apiReleaseSetId TEXT,
      type TEXT NOT NULL,
      dimension TEXT,
      metric TEXT,
      metricUnit TEXT,
      groupBy TEXT,
      groupValue TEXT,
      value REAL NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  return { sqlite, db: createLocalHarbourDb(sqlite) }
}

describe('replaceReleaseProcessingActions', () => {
  test('publication winning the staging race prevents the audit switch', async () => {
    const { sqlite, db } = createProcessingActionsDb()
    sqlite.exec("INSERT INTO releases(id,status) VALUES ('release-1','processing')")
    const original = [
      {
        action: 'review',
        mode: 'manual' as const,
        summary: 'Original',
        affectedRecordCount: 1,
        evidence: {},
      },
    ]
    await replaceReleaseProcessingActions(db, 'release-1', original)
    const before = await readReleaseAuditDecisions(db, ['release-1'])
    let published = false
    const racing = new Proxy(db, {
      get(target, key, receiver) {
        if (key === 'batch')
          return async (
            statements: Array<{ run(): unknown; toSQL(): { params: unknown[] } }>,
          ) => {
            expect(
              statements.every(statement => statement.toSQL().params.length <= 100),
            ).toBe(true)
            sqlite.transaction(() => {
              for (const statement of statements) statement.run()
            })()
            if (!published) {
              published = true
              sqlite.exec("UPDATE releases SET status='published'")
            }
          }
        return Reflect.get(target, key, receiver)
      },
    })
    await expect(
      replaceReleaseProcessingActions(racing, 'release-1', [
        { ...original[0]!, summary: 'New' },
      ]),
    ).rejects.toThrow()
    expect(await readReleaseAuditDecisions(db, ['release-1'])).toEqual(before)
  })

  test('compacts decisions, retains page boundaries and skips identical writes', async () => {
    const { sqlite, db } = createProcessingActionsDb()
    sqlite.exec("INSERT INTO releases(id,status) VALUES ('release-1','processing')")
    const actions = Array.from({ length: 1000 }, (_, index) => ({
      action: 'normalise',
      mode: 'automatic' as const,
      summary: 'Normalised locale',
      affectedRecordCount: 2,
      evidence: { index, text: '中文' },
    }))
    const materialised = await replaceReleaseProcessingActionsAndReturnRows(
      db,
      'release-1',
      actions,
    )
    expect(materialised.actions).toHaveLength(1)
    expect(materialised.actions[0]!.decisionCount).toBe(1000)
    expect(materialised.actions[0]!.affectedRecordCount).toBe(2000)
    expect(materialised.chunks).toHaveLength(4)
    expect(materialised.chunks.every(chunk => chunk.payload.length <= 32768)).toBe(true)
    const page = await readAuditPages(db, materialised.actions, 250, 20)
    expect(page.map(row => row.evidence)).toEqual(
      actions.slice(250, 270).map(row => row.evidence),
    )
    const before = sqlite.query('SELECT total_changes() AS n').get()
    expect(await replaceReleaseProcessingActions(db, 'release-1', actions)).toBe(1000)
    expect(sqlite.query('SELECT total_changes() AS n').get()).toEqual(before)
    const target = createProcessingActionsDb()
    target.sqlite.exec(
      "INSERT INTO releases(id,status) VALUES ('release-1','processing')",
    )
    for (const statement of buildAuditReplaySql('release-1', materialised)) {
      expect(new TextEncoder().encode(statement).length).toBeLessThan(100_000)
      target.sqlite.transaction(() => target.sqlite.exec(statement))()
    }
    expect(await readReleaseAuditDecisions(target.db, ['release-1'])).toEqual(
      await readReleaseAuditDecisions(db, ['release-1']),
    )
  })

  test('fragments oversized evidence losslessly and detects corruption', async () => {
    const { sqlite, db } = createProcessingActionsDb()
    sqlite.exec("INSERT INTO releases(id,status) VALUES ('release-1','processing')")
    const evidence = {
      text: Array.from({ length: 12000 }, () => crypto.randomUUID()).join('香港'),
    }
    const materialised = await replaceReleaseProcessingActionsAndReturnRows(
      db,
      'release-1',
      [
        {
          action: 'review',
          mode: 'manual',
          summary: 'Reviewed',
          affectedRecordCount: 1,
          evidence,
        },
      ],
    )
    expect(materialised.chunks.length).toBeGreaterThan(1)
    expect(materialised.chunks[0]!.parts).toBe(materialised.chunks.length)
    expect((await readReleaseAuditDecisions(db, ['release-1']))[0]!.evidence).toEqual(
      evidence,
    )
    sqlite.exec(
      "UPDATE releaseProcessingActionChunks SET checksum = 'broken' WHERE part = 0",
    )
    await expect(readReleaseAuditDecisions(db, ['release-1'])).rejects.toThrow(
      'checksum',
    )
  })

  test('failed summary commit keeps previous evidence and statistics visible', async () => {
    const { sqlite, db } = createProcessingActionsDb()
    sqlite.exec("INSERT INTO releases(id,status) VALUES ('release-1','processing')")
    const original = [
      {
        action: 'review',
        mode: 'manual' as const,
        summary: 'First',
        affectedRecordCount: 1,
        evidence: { original: true },
      },
    ]
    await replaceReleaseProcessingActions(db, 'release-1', original)
    const before = await readReleaseAuditDecisions(db, ['release-1'])
    sqlite.exec(
      "CREATE TRIGGER fail_stats BEFORE INSERT ON stats BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    )
    await expect(
      replaceReleaseProcessingActions(db, 'release-1', [
        { ...original[0]!, affectedRecordCount: 5, summary: 'Second' },
      ]),
    ).rejects.toThrow()
    expect(await readReleaseAuditDecisions(db, ['release-1'])).toEqual(before)
    expect(sqlite.query('SELECT value FROM stats').get()).toEqual({ value: 1 })
    sqlite.exec('DROP TRIGGER fail_stats')
    await replaceReleaseProcessingActions(db, 'release-1', [])
    expect(await listReleaseAuditSummaries(db, ['release-1'])).toEqual([])
    expect(sqlite.query('SELECT * FROM stats').all()).toEqual([])
  })

  test('allows retries before publication and preserves published action evidence', async () => {
    const { sqlite, db } = createProcessingActionsDb()
    sqlite.exec(
      `INSERT INTO releases (id, status, processingRules) VALUES (
        'release-1',
        'staged',
        '{"rulesets":[{"rules":[{"operationCode":"division_code_mapped","type":"bulk"}]}]}'
      )`,
    )

    await replaceReleaseProcessingActions(db, 'release-1', [
      {
        action: 'division_code_mapped',
        mode: 'automatic',
        summary: 'Mapped district codes.',
        affectedRecordCount: 18,
        evidence: { bridge: 'districts-v1' },
      },
    ])

    await expect(
      replaceReleaseProcessingActions(db, 'release-1', [
        {
          action: 'undeclared_action',
          mode: 'automatic',
          summary: 'Should be rejected.',
          affectedRecordCount: 1,
          evidence: {},
        },
      ]),
    ).rejects.toThrow('not declared in processing rules')

    sqlite.exec("UPDATE releases SET status = 'published' WHERE id = 'release-1'")

    await expect(replaceReleaseProcessingActions(db, 'release-1', [])).rejects.toThrow(
      'published releases are immutable',
    )
    expect(
      sqlite
        .query('SELECT action, affectedRecordCount FROM releaseProcessingActions')
        .all(),
    ).toEqual([{ action: 'division_code_mapped', affectedRecordCount: 18 }])
  })
})
