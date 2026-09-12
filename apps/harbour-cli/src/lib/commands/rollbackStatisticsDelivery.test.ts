import { expect, test } from 'bun:test'
import { fixture, insert } from './reconstructRollback.fixtures.ts'
import {
  captureRollbackDelivery,
  type RollbackClaim,
  type RollbackTerminal,
} from './rollbackDelivery.ts'
import type { NetStatement } from '../pipeline/local/netSqlitePlanTypes.ts'
import { verifyRollbackTerminal } from './reconstructRollback.ts'

test('Statistics finalisation retains the sealed token and terminal verification rejects a different ready owner', async () => {
  const f = await fixture()
  try {
    insert(f.current, 'statsPublicationState', {
      datasetCode: 'statistics-data',
      referencePeriodCode: '2026',
      snapshotId: 'new-stats',
      status: 'current',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const claim: RollbackClaim = {
      table: 'statsPublicationState',
      scopeId: JSON.stringify(['statistics-data', '2026']),
      statistics: { datasetCode: 'statistics-data', referencePeriodCode: '2026' },
      previous: {
        snapshotId: 'new-stats',
        publicationToken: '2026-01-01T00:00:00.000Z',
      },
      snapshotId: 'old-stats',
      publicationToken: '2026-02-01T00:00:00.000Z',
    }
    const terminal: RollbackTerminal = {
      operation: 'rollback',
      releaseId: 'release-new',
      catalogId: 'catalogue',
      apiVersionId: 'api',
      regionCode: 'hk',
      claims: [claim],
    }
    const batches: Array<{ binding: string; statements: NetStatement[] }> = []
    await captureRollbackDelivery({
      context: f.context,
      tables: [],
      prepare: async () => ({
        claims: [claim],
        metadataGuard: { sql: 'SELECT 1', params: [] },
        metadata: [
          {
            sql: "UPDATE releases SET status='revoked' WHERE id='release-new'",
            params: [],
          },
        ],
        terminal,
      }),
      append: async (target, bytes) => {
        batches.push({
          binding: target.bindingName,
          statements: JSON.parse(new TextDecoder().decode(bytes)),
        })
      },
    })
    for (const batch of batches) {
      const db = batch.binding === 'DB_CURRENT' ? f.current : f.meta
      db.transaction(() => {
        for (const statement of batch.statements)
          db.query(statement.sql).run(...statement.params)
      })()
    }
    expect(
      f.current
        .query('SELECT snapshotId,status,updatedAt FROM statsPublicationState')
        .get(),
    ).toEqual({
      snapshotId: 'old-stats',
      status: 'current',
      updatedAt: claim.publicationToken,
    })
    await verifyRollbackTerminal(f.files, terminal)
    f.current.exec(
      "UPDATE statsPublicationState SET updatedAt='2026-03-01T00:00:00.000Z'",
    )
    await expect(verifyRollbackTerminal(f.files, terminal)).rejects.toThrow(
      'sealed publication token',
    )
  } finally {
    await f.close()
  }
})
