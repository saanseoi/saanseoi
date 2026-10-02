import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { normaliseReleaseStats } from '../scripts/normaliseReleaseStats'

test('generated renames and classification preserve release stats facts', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE stats (
      id TEXT PRIMARY KEY, resourceReleaseId TEXT, dimension TEXT NOT NULL,
      metric TEXT NOT NULL, metricUnit TEXT NOT NULL, value REAL NOT NULL,
      groupBy TEXT, groupValue TEXT, createdAt TEXT, updatedAt TEXT
    );
    INSERT INTO stats VALUES
      ('change','release','changed_count','churn','count',3,'level','5','created','updated'),
      ('locale','release','locale_coverage','completeness','percentage',62.5,'locale','en','created','updated'),
      ('quality','release','name_regression_count','quality','count',1,NULL,NULL,'created','updated'),
      ('district','release','records','distribution','count',12,'district','district-id','created','updated'),
      ('area','release','geometry','area','square_kilometres',902.89,'district','district-id','created','updated');`)
    for (const migration of [
      '20261002172807_elite_sharon_carter',
      '20261002172904_black_millenium_guard',
    ])
      db.exec(
        readFileSync(
          new URL(`../migrations/meta/${migration}/migration.sql`, import.meta.url),
          'utf8',
        ),
      )
    expect(normaliseReleaseStats(db)).toBe(4)
    expect(db.query("SELECT category FROM stats WHERE id = 'change'").get()).toEqual({
      category: 'changed_count',
    })
    expect(normaliseReleaseStats(db, true)).toBe(4)
    expect(normaliseReleaseStats(db, true)).toBe(0)
    expect(
      db
        .query(
          'SELECT id, category, measure, unit, value, dimension, dimensionValue FROM stats ORDER BY id',
        )
        .all(),
    ).toEqual([
      {
        id: 'area',
        category: 'geometry',
        measure: 'area',
        unit: 'square_kilometres',
        value: 902.89,
        dimension: 'district',
        dimensionValue: 'district-id',
      },
      {
        id: 'change',
        category: 'changes',
        measure: 'changed_count',
        unit: 'count',
        value: 3,
        dimension: 'level',
        dimensionValue: '5',
      },
      {
        id: 'district',
        category: 'records',
        measure: 'count',
        unit: 'count',
        value: 12,
        dimension: 'district',
        dimensionValue: 'district-id',
      },
      {
        id: 'locale',
        category: 'completeness',
        measure: 'locale_coverage',
        unit: 'percentage',
        value: 62.5,
        dimension: 'locale',
        dimensionValue: 'en',
      },
      {
        id: 'quality',
        category: 'quality',
        measure: 'name_regression_count',
        unit: 'count',
        value: 1,
        dimension: null,
        dimensionValue: null,
      },
    ])
    expect(
      db
        .query(
          "SELECT count(*) AS count FROM stats WHERE resourceReleaseId = 'release' AND createdAt = 'created' AND updatedAt = 'updated'",
        )
        .get(),
    ).toEqual({ count: 5 })
  } finally {
    db.close()
  }
})
