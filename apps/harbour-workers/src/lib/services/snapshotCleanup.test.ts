import { expect, test } from 'bun:test'
import { currentSchema } from '@repo/db'

import { cleanupSnapshotByResourceType } from './snapshotCleanup'

test('deletes every street-owned table in one batch', async () => {
  const deletedTables: unknown[] = []
  let batchSize = 0
  const db = {
    batch(statements: Array<{ run(): void }>) {
      batchSize = statements.length
      for (const statement of statements) statement.run()
      return Promise.resolve()
    },
    delete(table: unknown) {
      return {
        where() {
          return {
            run() {
              deletedTables.push(table)
            },
          }
        },
      }
    },
    select() {
      return {
        from() {
          return {
            where() {
              return {
                limit() {
                  return { get: () => undefined }
                },
              }
            },
          }
        },
      }
    },
  }

  await cleanupSnapshotByResourceType(db as never, {
    resourceType: 'street',
    snapshotId: 'snapshot-id',
  })

  expect(batchSize).toBe(6)
  expect(deletedTables).toEqual([
    currentSchema.streetChangelog,
    currentSchema.streetGeometry,
    currentSchema.streetNameChanges,
    currentSchema.streetsAddress,
    currentSchema.streetsI18n,
    currentSchema.streets,
  ])
})

test('deletes division-statistic snapshots', async () => {
  const deletedTables: unknown[] = []
  const db = {
    delete(table: unknown) {
      return {
        where() {
          deletedTables.push(table)
        },
      }
    },
  }

  await cleanupSnapshotByResourceType(db as never, {
    resourceType: 'divisionStatistic',
    snapshotId: 'snapshot-id',
  })

  expect(deletedTables).toEqual([currentSchema.divisionStatistics])
})
