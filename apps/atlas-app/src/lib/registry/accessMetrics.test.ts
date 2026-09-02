import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import * as schema from '@repo/db/metaSchema'

import { getRegistryAccessMetricsBatch } from './accessMetrics'

describe('getRegistryAccessMetricsBatch', () => {
  test('preserves input order and separates matching entity IDs by scope', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE accessAnalyticsRollups (
        period TEXT NOT NULL,
        scope TEXT NOT NULL,
        entityId TEXT NOT NULL,
        metrics TEXT NOT NULL,
        asOf TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (period, scope, entityId)
      );

      INSERT INTO accessAnalyticsRollups (
        period, scope, entityId, metrics, asOf, createdAt, updatedAt
      ) VALUES
        ('all_time', 'source_release', 'shared-id', '{"requests":12}', '2026-08-31', '2026-08-31', '2026-08-31'),
        ('all_time', 'api_release_set', 'shared-id', '{"requests":34}', '2026-09-01', '2026-09-01', '2026-09-01'),
        ('daily', 'source_release', 'shared-id', '{"requests":99}', '2026-09-01', '2026-09-01', '2026-09-01');
    `)

    const db = drizzle({ client: sqlite, schema })
    const results = await getRegistryAccessMetricsBatch(db as never, [
      { scope: 'api_release_set', entityId: 'shared-id' },
      { scope: 'source_release', entityId: 'missing-id' },
      { scope: 'source_release', entityId: 'shared-id' },
    ])

    expect(results).toEqual([
      { metrics: { requests: 34 }, asOf: '2026-09-01' },
      null,
      { metrics: { requests: 12 }, asOf: '2026-08-31' },
    ])
    sqlite.close()
  })
})
