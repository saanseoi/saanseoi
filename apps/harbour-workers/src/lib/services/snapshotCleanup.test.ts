import { expect, test } from 'bun:test'
import { currentSchema } from '@repo/db'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'

import { cleanupSnapshotByResourceType } from './snapshotCleanup'

test('retains a snapshot still serving the published search index', async () => {
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({ get: async () => undefined }),
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
    select: () => ({
      from: () => ({ where: () => ({ limit: () => ({ get: () => undefined }) }) }),
    }),
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

test('protects completed and interrupted geometry publications, including an empty snapshot', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
        'current',
      ]),
    )
    const db = drizzle({ client: sqlite })
    for (const status of ['publishing', 'current']) {
      sqlite
        .query(`INSERT INTO divisionAreaPublicationState(snapshotId, scopeId, status, publicationToken, preparedAt)
        VALUES (?, 'cohort', ?, 'generation', ?)`)
        .run(status, status, status === 'current' ? 'complete' : null)
      expect(
        await cleanupSnapshotByResourceType(db as never, {
          resourceType: 'divisionArea',
          snapshotId: status,
        }),
      ).toBe(false)
    }
    expect(
      sqlite.query('SELECT count(*) AS count FROM divisionAreaPublicationState').get(),
    ).toEqual({ count: 2 })
    expect(
      await cleanupSnapshotByResourceType(db as never, {
        resourceType: 'divisionArea',
        snapshotId: 'retired',
      }),
    ).toBe(true)
  } finally {
    sqlite.close()
  }
})

test('a publication acquired after the cleanup precheck prevents the data deletion', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
        'current',
      ]),
    )
    sqlite.exec(
      `INSERT INTO divisionAreas(snapshotId, id, divisionId, type) VALUES ('snapshot', 'area', 'division', 'district')`,
    )
    const underlying = drizzle({ client: sqlite })
    const racing = new Proxy(underlying, {
      get(db, key, receiver) {
        if (key !== 'delete') return Reflect.get(db, key, receiver)
        return (...args: Parameters<typeof underlying.delete>) => {
          sqlite.exec(
            `INSERT INTO divisionAreaPublicationState(snapshotId, scopeId, publicationToken) VALUES ('snapshot', 'scope', 'owner')`,
          )
          return db.delete(...args)
        }
      },
    })
    await cleanupSnapshotByResourceType(racing as never, {
      resourceType: 'divisionArea',
      snapshotId: 'snapshot',
    })
    expect(sqlite.query('SELECT id FROM divisionAreas').all()).toEqual([{ id: 'area' }])
  } finally {
    sqlite.close()
  }
})
