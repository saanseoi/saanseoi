import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { buildAddressStatsMetaSql } from './sqlStages'

test('Address metadata replay uses the current stats schema and preserves processing stats', () => {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE stats(id TEXT PRIMARY KEY,releaseId TEXT,apiReleaseSetId TEXT,dimension TEXT,metric TEXT,metricUnit TEXT,value REAL,groupBy TEXT,groupValue TEXT,createdAt TEXT,updatedAt TEXT)',
  )
  try {
    const rows = [
      {
        id: 'count',
        releaseId: 'release',
        dimension: 'records',
        metric: 'count',
        metricUnit: 'count',
        value: 42,
      },
      { id: 'processing', metric: 'processing', value: 1 },
    ]
    db.exec(buildAddressStatsMetaSql(rows))
    expect(db.query('SELECT id,value FROM stats').all()).toEqual([
      { id: 'count', value: 42 },
    ])
    db.exec(buildAddressStatsMetaSql([{ ...rows[0], value: 43 }]))
    expect(db.query('SELECT value FROM stats').get()).toEqual({ value: 43 })
  } finally {
    db.close()
  }
})
