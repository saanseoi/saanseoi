import { requireDefined } from '../../requireDefined'
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
    CREATE TABLE snapshotRecipes(id TEXT PRIMARY KEY, processingRules TEXT);
    CREATE TABLE snapshotAssemblies(snapshotId TEXT, snapshotRecipeId TEXT);
    CREATE TABLE snapshotResourceReleases(snapshotId TEXT, resourceReleaseId TEXT);
    CREATE TABLE processingRuleDefinitions(id TEXT PRIMARY KEY, definition TEXT NOT NULL);
    CREATE TABLE resourceReleases (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      processingRules TEXT,
      updatedAt TEXT NOT NULL DEFAULT 'initial'
    );
    CREATE TABLE releaseProcessingActions (
      id TEXT PRIMARY KEY,
      resourceReleaseId TEXT NOT NULL,
      action TEXT NOT NULL,
      mode TEXT NOT NULL,
      generation TEXT NOT NULL,
      decisionCount INTEGER NOT NULL,
      affectedRecordCount INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE releaseProcessingActionChunks (
      id TEXT PRIMARY KEY, resourceReleaseId TEXT NOT NULL, actionId TEXT NOT NULL,
      generation TEXT NOT NULL, firstOrdinal INTEGER NOT NULL, decisionCount INTEGER NOT NULL,
      part INTEGER NOT NULL, parts INTEGER NOT NULL, encoding TEXT NOT NULL,
      checksum TEXT NOT NULL, payload BLOB NOT NULL CHECK(length(payload) <= 32768)
    );
    CREATE TABLE stats (
      id TEXT PRIMARY KEY,
      resourceReleaseId TEXT,
      apiReleaseSetId TEXT,
      category TEXT,
      measure TEXT,
      unit TEXT,
      dimension TEXT,
      dimensionValue TEXT,
      value REAL NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  return { sqlite, db: createLocalHarbourDb(sqlite) }
}

describe('replaceReleaseProcessingActions', () => {
  test('retains aggregate counts without evidence chunks or duplicate metrics', async () => {
    const { sqlite, db } = createProcessingActionsDb()
    sqlite.exec(
      "INSERT INTO resourceReleases(id,status) VALUES ('release','processing')",
    )
    const actions = Array.from({ length: 1000 }, () => ({
      action: 'normalise',
      mode: 'automatic' as const,
      affectedRecordCount: 1,
      summary: 'Normalise',
      evidence: { record: 'must-not-be-written' },
    }))
    const rows = await replaceReleaseProcessingActionsAndReturnRows(
      db,
      'release',
      actions,
    )
    expect(rows.actions).toHaveLength(1)
    expect(rows.actions[0]).toMatchObject({
      decisionCount: 1000,
      affectedRecordCount: 1000,
    })
    expect(rows.chunks).toEqual([])
    expect(rows.stats).toEqual([])
    expect(
      sqlite.query('SELECT count(*) AS n FROM releaseProcessingActionChunks').get(),
    ).toEqual({ n: 0 })
    expect(sqlite.query('SELECT count(*) AS n FROM stats').get()).toEqual({ n: 0 })
    const writes = sqlite.query('SELECT total_changes() AS n').get()
    await replaceReleaseProcessingActions(db, 'release', actions)
    expect(sqlite.query('SELECT total_changes() AS n').get()).toEqual(writes)
    expect((await readReleaseAuditDecisions(db, ['release']))[0]).toMatchObject({
      evidence: null,
      summary: 'normalise',
    })
    const replay = buildAuditReplaySql('release', rows).join('')
    expect(replay).not.toContain('must-not-be-written')
    expect(replay).not.toContain('INSERT INTO "stats"')
    sqlite.close()
  })

  test('count changes replace atomically and published summaries are immutable', async () => {
    const { sqlite, db } = createProcessingActionsDb()
    sqlite.exec(
      "INSERT INTO resourceReleases(id,status) VALUES ('release','processing')",
    )
    const action = {
      action: 'curation',
      mode: 'manual' as const,
      affectedRecordCount: 1,
      summary: 'Reviewed fixture',
      evidence: {},
    }
    await replaceReleaseProcessingActions(db, 'release', [action])
    await replaceReleaseProcessingActions(db, 'release', [
      { ...action, affectedRecordCount: 2 },
    ])
    expect(
      (await listReleaseAuditSummaries(db, ['release']))[0]?.affectedRecordCount,
    ).toBe(2)
    sqlite.exec("UPDATE resourceReleases SET status='published'")
    await expect(replaceReleaseProcessingActions(db, 'release', [])).rejects.toThrow(
      'immutable',
    )
    expect(
      (await listReleaseAuditSummaries(db, ['release']))[0]?.affectedRecordCount,
    ).toBe(2)
    sqlite.close()
  })

  test('undeclared operations fail before writes', async () => {
    const { sqlite, db } = createProcessingActionsDb()
    sqlite.exec(
      `INSERT INTO processingRuleDefinitions VALUES ('policy','{"rulesets":[{"rules":[{"operationCode":"known","kind":"bulk"}]}]}'); INSERT INTO resourceReleases(id,status,processingRules) VALUES ('release','processing','{"definitionId":"policy"}');`,
    )
    const writes = sqlite.query('SELECT total_changes() AS n').get()
    await expect(
      replaceReleaseProcessingActions(db, 'release', [
        {
          action: 'unknown',
          mode: 'automatic',
          affectedRecordCount: 1,
          summary: 'Unknown',
          evidence: {},
        },
      ]),
    ).rejects.toThrow('not declared')
    expect(sqlite.query('SELECT total_changes() AS n').get()).toEqual(writes)
    sqlite.close()
  })
})

test('record actions use the snapshot recipe policy alongside ingestion declarations', async () => {
  const { sqlite, db } = createProcessingActionsDb()
  try {
    sqlite.exec(`INSERT INTO processingRuleDefinitions VALUES ('ingestion','{"stage":"ingestion","rulesets":[{"rules":[{"operationCode":"retain","kind":"bulk"}]}]}'),('assembly','{"stage":"assembly","rulesets":[{"rules":[{"operationCode":"review","kind":"record"}]}]}');
      INSERT INTO resourceReleases(id,status,processingRules) VALUES ('release','processing','{"definitionId":"ingestion"}');
      INSERT INTO snapshotRecipes VALUES ('recipe','{"definitionId":"assembly"}');
      INSERT INTO snapshotAssemblies VALUES ('snapshot','recipe');
      INSERT INTO snapshotResourceReleases VALUES ('snapshot','release');`)
    await replaceReleaseProcessingActions(db, 'release', [
      {
        action: 'review',
        mode: 'manual',
        affectedRecordCount: 1,
        summary: 'Reviewed',
        evidence: {},
      },
    ])
    expect(sqlite.query('SELECT action FROM releaseProcessingActions').all()).toEqual([
      { action: 'review' },
    ])
  } finally {
    sqlite.close()
  }
})
