import { expect, test } from 'bun:test'
import { currentSchema } from '@repo/db'

import { cleanupSnapshotByResourceType } from './snapshotCleanup'

test('retains a snapshot still serving the published search index', async () => {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => ({ scopeId: 'als' }),
        }),
      }),
    }),
    delete: () => {
      throw new Error('must preserve search snapshot')
    },
  }
  expect(
    await cleanupSnapshotByResourceType(db as never, {
      resourceType: 'division',
      snapshotId: 'old',
    }),
  ).toBe(false)
  expect(
    await cleanupSnapshotByResourceType(db as never, {
      resourceType: 'address',
      snapshotId: 'old',
    }),
  ).toBe(false)
  expect(
    await cleanupSnapshotByResourceType(db as never, {
      resourceType: 'place',
      snapshotId: 'old',
    }),
  ).toBe(false)
})

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
