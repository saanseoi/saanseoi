import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'

import { buildReportRowCounts, collectCountRowsByRelease } from './reportingRows.ts'
import type { CountTarget } from './reportingTypes.ts'

function sourceDatabase(
  rows: Array<{
    sourceRecordId: string
    validFromRelease: string
    validToRelease: string | null
  }>,
) {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE overturePlaces (
      sourceRecordId TEXT,
      validFromRelease TEXT,
      validToRelease TEXT
    );
  `)
  const insert = database.query(
    'INSERT INTO overturePlaces (sourceRecordId, validFromRelease, validToRelease) VALUES (?, ?, ?)',
  )
  for (const row of rows)
    insert.run(row.sourceRecordId, row.validFromRelease, row.validToRelease)

  return {
    database,
    binding: {
      prepare(query: string) {
        return {
          bind(...values: string[]) {
            return {
              all: async () => ({
                results: database.query(query).all(...values),
              }),
            }
          },
        }
      },
    } as unknown as D1Database,
  }
}

test('Place reporting counts valid rows across all assigned source shards', async () => {
  const old = sourceDatabase([
    {
      sourceRecordId: 'retained',
      validFromRelease: '2025-01-01.0',
      validToRelease: null,
    },
    {
      sourceRecordId: 'retired',
      validFromRelease: '2025-01-01.0',
      validToRelease: '2026-01-01.0',
    },
  ])
  const active = sourceDatabase([
    {
      sourceRecordId: 'changed',
      validFromRelease: '2026-09-01.0',
      validToRelease: null,
    },
    {
      sourceRecordId: 'new',
      validFromRelease: '2026-09-01.0',
      validToRelease: null,
    },
  ])
  const target = {
    bindings: [old.binding, active.binding],
    kind: 'source',
    releaseId: 'place-release-2026',
    sourceVersion: '2026-09-01.0',
    specs: [
      {
        label: 'source',
        strategy: 'source-validity',
        tableName: 'overturePlaces',
      },
    ],
  } satisfies CountTarget

  try {
    const counts = await collectCountRowsByRelease([
      { history: null, releaseId: target.releaseId, source: target },
    ])
    expect(buildReportRowCounts(target, counts)).toEqual([
      {
        kind: 'source',
        label: 'source',
        rowCount: 3,
        tableName: 'overturePlaces',
      },
    ])
  } finally {
    old.database.close()
    active.database.close()
  }
})
