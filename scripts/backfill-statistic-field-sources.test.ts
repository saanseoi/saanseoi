import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { backfillStatisticFieldSources } from './backfill-statistic-field-sources'
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'statistic-sources-'))
  roots.push(root)
  const paths = ['current', 'history'].map(family => {
    const path = join(root, `${family}.sqlite`),
      db = new Database(path)
    const name =
      family === 'current'
        ? '20261015105444_flat_hellfire_club'
        : '20261015105445_calm_firebrand'
    db.exec(
      readFileSync(
        resolve(
          import.meta.dir,
          `../libs/db/migrations/${family}/${name}/migration.sql`,
        ),
        'utf8',
      ),
    )
    const row: any = {
      id: 'ss-record',
      datasetCode: 'dataset',
      sourceFeatureRef: 'feature',
      referencePeriodCode: '2021',
      referencePeriodGranularity: 'year',
      referencePeriodEndYear: '2021',
      geography: '{}',
      fieldSources: JSON.stringify({
        age: { sourceReleaseId: 'a', sourceFeatureRef: 'feature-a' },
        population: { sourceReleaseId: 'b', sourceFeatureRef: 'feature-b' },
      }),
      definitionSetId: 'defs',
      values: '{"age":"12","population":"123"}',
      versionHash: 'unchanged',
    }
    if (family === 'history') {
      row.snapshotId = 'snapshot'
      row.operation = 'upsert'
      row.isCurrent = 1
    } else row.sourceReleaseId = 'b'
    const cols = Object.keys(row)
    db.query(
      `INSERT INTO statsRecords (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    ).run(...(Object.values(row) as any[]))
    if (family === 'history')
      db.exec(
        "INSERT INTO statsRecords(id,snapshotId,operation,isCurrent,fieldSources) VALUES('deleted','snapshot','delete',0,NULL)",
      )
    db.close()
    return path
  })
  return { root, paths }
}
test('backfill preserves fields, hashes and deletion events while applying generated schemas and retaining recovery copies', () => {
  const f = fixture()
  expect(backfillStatisticFieldSources(f.paths, join(f.root, 'dry')).rows).toBe(2)
  expect(backfillStatisticFieldSources(f.paths, join(f.root, 'apply'), true).rows).toBe(
    2,
  )
  for (const path of f.paths) {
    const db = new Database(path)
    const row = db.query("SELECT * FROM statsRecords WHERE id='ss-record'").get() as any
    expect(row.versionHash).toBe('unchanged')
    expect(JSON.parse(row.fieldSources)).toEqual([
      { property: '', sourceReleaseId: 'a', sourceFeatureRef: 'feature-a' },
      {
        property: '/values/population',
        sourceReleaseId: 'b',
        sourceFeatureRef: 'feature-b',
      },
    ])
    expect(
      (db.query('PRAGMA table_info(statsRecords)').all() as any[]).find(
        c => c.name === 'fieldSources',
      ).dflt_value,
    ).toBe("'[]'")
    db.close()
  }
  const history = new Database(f.paths[1])
  expect(
    history
      .query("SELECT fieldSources FROM statsRecords WHERE operation='delete'")
      .get(),
  ).toEqual({ fieldSources: null })
  expect(
    history
      .query(
        "SELECT recordId,versionHash FROM historyEvents WHERE recordType='statsRecord' AND operation='upsert'",
      )
      .get(),
  ).toEqual({ recordId: 'ss-record', versionHash: 'unchanged' })
  history.close()
  const recovery = new Database(join(f.root, 'apply/0-before.sqlite'))
  expect(
    JSON.parse(
      (recovery.query('SELECT fieldSources FROM statsRecords').get() as any)
        .fieldSources,
    ).age.sourceReleaseId,
  ).toBe('a')
  recovery.close()
  expect(backfillStatisticFieldSources(f.paths, join(f.root, 'again'), true).rows).toBe(
    0,
  )
  for (const [i, path] of f.paths.entries()) {
    const db = new Database(path)
    db.exec(readFileSync(join(f.root, `apply/${i}-rollback.sql`), 'utf8'))
    expect(
      Array.isArray(
        JSON.parse(
          (
            db
              .query("SELECT fieldSources FROM statsRecords WHERE id='ss-record'")
              .get() as any
          ).fieldSources,
        ),
      ),
    ).toBe(false)
    db.close()
  }
})
test('missing provenance aborts all database updates', () => {
  const f = fixture()
  const bad = new Database(f.paths[1])
  bad.exec("UPDATE statsRecords SET fieldSources='{}' WHERE operation='upsert'")
  bad.close()
  expect(() =>
    backfillStatisticFieldSources(f.paths, join(f.root, 'bad'), true),
  ).toThrow('Incomplete')
  const first = new Database(f.paths[0])
  expect(
    Array.isArray(
      JSON.parse(
        (first.query('SELECT fieldSources FROM statsRecords').get() as any)
          .fieldSources,
      ),
    ),
  ).toBe(false)
  first.close()
})
