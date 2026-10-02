import { Database } from 'bun:sqlite'
import { test, expect } from 'bun:test'
import { metaSchema, eq } from '@repo/db'
import { createLocalHarbourDb } from '../../testing/localDb'
import {
  retainProcessingRules,
  retainIngestionProcessingRules,
  processingRulesSelection,
} from './processingRuleDefinitions'

test('multiple releases share one immutable processing definition', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      'CREATE TABLE processingRuleDefinitions(id TEXT PRIMARY KEY, definition TEXT NOT NULL); CREATE TABLE resourceReleases(id TEXT PRIMARY KEY, processingRules TEXT);',
    )
    const db = createLocalHarbourDb(sqlite)
    const rules = {
      rulesets: [
        {
          rulesetVersion: 'v1',
          rulesetVersionHash: 'hash',
          rules: [
            {
              operationCode: 'normalise',
              mappings: [{ from: 'raw.name', to: 'name' }],
            },
          ],
        },
      ],
    }
    const first = await retainProcessingRules(db, rules)
    const second = await retainProcessingRules(db, rules)
    expect(second).toEqual(first)
    sqlite
      .query('INSERT INTO resourceReleases VALUES (?,?)')
      .run('release', JSON.stringify(first))
    const row = await db
      .select({
        processingRules: processingRulesSelection(
          metaSchema.metaResourceReleases.processingRules,
        ),
      })
      .from(metaSchema.metaResourceReleases)
      .where(eq(metaSchema.metaResourceReleases.id, 'release'))
      .get()
    expect(row?.processingRules).toEqual(rules)
    expect(
      sqlite.query('SELECT COUNT(*) AS n FROM processingRuleDefinitions').get(),
    ).toEqual({ n: 1 })
    expect(sqlite.query('SELECT processingRules FROM resourceReleases').get()).toEqual({
      processingRules: JSON.stringify(first),
    })
  } finally {
    sqlite.close()
  }
})

test('source and resource releases accept ingestion policies and reject assembly policies', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      'CREATE TABLE processingRuleDefinitions(id TEXT PRIMARY KEY, definition TEXT NOT NULL)',
    )
    const db = createLocalHarbourDb(sqlite)
    await expect(
      retainIngestionProcessingRules(db, { stage: 'assembly', rulesets: [] }),
    ).rejects.toThrow('require ingestion')
    await expect(retainIngestionProcessingRules(db, { rulesets: [] })).rejects.toThrow(
      'require ingestion',
    )
    expect(sqlite.query('SELECT * FROM processingRuleDefinitions').all()).toEqual([])
    expect(
      await retainIngestionProcessingRules(db, { stage: 'ingestion', rulesets: [] }),
    ).toHaveProperty('definitionId')
    expect(await retainIngestionProcessingRules(db, null)).toBeNull()
  } finally {
    sqlite.close()
  }
})
