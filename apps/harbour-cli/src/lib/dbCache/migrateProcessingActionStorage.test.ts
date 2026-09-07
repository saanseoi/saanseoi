import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { readReleaseAuditDecisions } from '@repo/core/pipeline/db/processingActionStorage'
import { migrateProcessingActionStorage } from './migrateProcessingActionStorage'

const migration = readFileSync(
  new URL(
    '../../../../../../libs/db/migrations/meta/20260907075220_short_swordsman/migration.sql',
    import.meta.url,
  ),
  'utf8',
)

function originalDatabase() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE releases(id TEXT PRIMARY KEY, status TEXT);
    INSERT INTO releases VALUES ('published','published');
    CREATE TABLE releaseProcessingActions(id TEXT PRIMARY KEY, releaseId TEXT NOT NULL, action TEXT NOT NULL, mode TEXT NOT NULL, summary TEXT NOT NULL, affectedRecordCount INTEGER NOT NULL, evidence TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
    INSERT INTO releaseProcessingActions VALUES
      ('first','published','review','manual','First decision',2,'{"text":"香港"}','2026-01-01','2026-01-02'),
      ('second','published','review','manual','Second decision',3,'{"text":"中文"}','2026-01-03','2026-01-04');`)
  return sqlite
}

test('offline conversion preserves published decisions, original IDs and timestamps', async () => {
  const sqlite = originalDatabase()
  const original = sqlite
    .query('SELECT * FROM releaseProcessingActions ORDER BY id')
    .all()
    .map(row => ({
      ...row,
      evidence: JSON.parse((row as { evidence: string }).evidence),
    }))
  expect(await migrateProcessingActionStorage(sqlite, migration)).toEqual({
    decisions: 2,
    summaries: 1,
    chunks: 1,
  })
  const records = await readReleaseAuditDecisions(createLocalHarbourDb(sqlite), [
    'published',
  ])
  expect(records.sort((a, b) => a.id.localeCompare(b.id))).toEqual(original)
  expect(sqlite.query('SELECT status FROM releases').get()).toEqual({
    status: 'published',
  })
  sqlite.close()
})

test('failed generated migration rolls back the original evidence', async () => {
  const sqlite = originalDatabase()
  await expect(
    migrateProcessingActionStorage(sqlite, `${migration}\nSELECT missing_function();`),
  ).rejects.toThrow()
  expect(
    sqlite
      .query(
        'SELECT count(*) AS n FROM releaseProcessingActions WHERE evidence IS NOT NULL',
      )
      .get(),
  ).toEqual({ n: 2 })
  sqlite.close()
})
