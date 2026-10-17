import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import {
  backfillStatisticSourceReference,
  migrations,
} from './backfill-statistic-source-reference'

test('local migration preserves field sources and all retained content, supports rollback and repeats safely', () => {
  const root = mkdtempSync(join(tmpdir(), 'statistic-reference-'))
  const paths = ['current', 'history'].map(f => join(root, `${f}.sqlite`))
  const expected = new Map<string, unknown>()
  try {
    for (const [i, family] of (['current', 'history'] as const).entries()) {
      const db = new Database(paths[i]!)
      const directory = resolve(import.meta.dir, `../libs/db/migrations/${family}`)
      for (const name of readdirSync(directory).sort()) {
        const sql = join(directory, name, 'migration.sql')
        if (name >= migrations[family].split('/')[0]! || !existsSync(sql)) continue
        db.exec(readFileSync(sql, 'utf8'))
      }
      db.exec(
        'PRAGMA foreign_keys=OFF; CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE);',
      )
      const row: Record<string, any> = {
        id: 'record',
        datasetCode: 'dataset',
        sourceFeatureRef: 'representative-feature',
        referencePeriodCode: '2021',
        referencePeriodGranularity: 'year',
        referencePeriodEndYear: '2021',
        geography: '{"kind":"district","code":"11"}',
        definitionSetId: 'definitions',
        values: '{"population":"100","households":"20"}',
        fieldSources:
          '[{"property":"","sourceReleaseId":"old","sourceFeatureRef":"old-feature"},{"property":"/values/households","sourceReleaseId":"new","sourceFeatureRef":"new-feature"}]',
        versionHash: 'unchanged',
      }
      if (family === 'current') row.sourceReleaseId = 'snapshot-owner'
      else {
        row.snapshotId = 'snapshot'
        row.operation = 'upsert'
      }
      const columns = Object.keys(row)
      db.query(
        `INSERT INTO statsRecords (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      ).run(...Object.values(row))
      if (family === 'history')
        db.exec(
          "INSERT INTO statsRecords(id,snapshotId,operation,fieldSources) VALUES('deleted','snapshot','delete',NULL)",
        )
      expected.set(family, db.query('SELECT * FROM statsRecords ORDER BY id').all())
      db.close()
    }
    expect(backfillStatisticSourceReference(paths, join(root, 'dry')).rows).toBe(3)
    const result = backfillStatisticSourceReference(paths, join(root, 'apply'), true)
    expect(result.rows).toBe(3)
    for (const [i, family] of ['current', 'history'].entries()) {
      const db = new Database(paths[i]!)
      const records = db.query('SELECT * FROM statsRecords ORDER BY id').all()
      expect(records).toEqual(
        (expected.get(family) as any[]).map(({ sourceFeatureRef, ...rest }) => rest),
      )
      if (family === 'history')
        expect(db.query('SELECT count(*) n FROM historyEvents').get()).toEqual({ n: 2 })
      db.close()
    }
    expect(
      backfillStatisticSourceReference(paths, join(root, 'repeat'), true).rows,
    ).toBe(0)
    for (const [i, family] of ['current', 'history'].entries()) {
      const db = new Database(paths[i]!)
      db.exec(readFileSync(join(root, 'apply', `${i}-rollback.sql`), 'utf8'))
      expect(db.query('SELECT * FROM statsRecords ORDER BY id').all()).toEqual(
        expected.get(family),
      )
      db.close()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
