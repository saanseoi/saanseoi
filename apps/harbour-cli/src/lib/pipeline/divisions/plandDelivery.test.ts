import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { sql } from 'drizzle-orm'
import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { sqlDeliveryPhaseDirectory } from '../local/sqlDeliveryPhase.ts'
import { deliverPlandWorkflow, readPlandDeliveryCounts } from './plandDelivery.ts'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import {
  compressPlanningDivisionGeometry,
  replaceCurrentSnapshot,
} from './processLocalHkgovPlandDivisionSqlUploadRows.ts'
import type { PreparedDivision } from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'
import type { HarbourWritableDb } from '@repo/core/db/types'

const counter = sqliteTable('counter', { n: integer().notNull() })

test('Planning copies isolate failed preparation and resume partial delivery without recalculating counts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pland-delivery-'))
  const names = ['DB_META', 'DB_CURRENT', 'DB_HISTORY', 'DB_SOURCE'] as const
  const files = Object.fromEntries(
    names.map(name => [name, join(root, `${name}.sqlite`)]),
  )
  const clients = Object.fromEntries(
    names.map(name => [name, new Database(files[name])]),
  ) as Record<(typeof names)[number], Database>
  const context = {
    historyBinding: createLocalExecBinding(clients.DB_HISTORY, 'DB_HISTORY'),
    sourceBinding: createLocalExecBinding(clients.DB_SOURCE, 'DB_SOURCE'),
    state: { target: 'local', files, dbCacheDir: root },
  } as unknown as LocalAddressDbContext
  const phase = {
    context,
    releaseId: `pland-test-${crypto.randomUUID()}`,
    phase: 'planning-division-data',
    inputs: { source: 'fixed' },
  }
  try {
    clients.DB_CURRENT.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        'current',
      ]),
    )
    for (const db of Object.values(clients))
      db.exec('CREATE TABLE counter(n INTEGER NOT NULL); INSERT INTO counter VALUES(0)')
    await expect(
      deliverPlandWorkflow(phase, context, async copy => {
        await copy.currentDb.update(counter).set({ n: 1 }).run()
        throw new Error('preparation interrupted')
      }),
    ).rejects.toThrow('preparation interrupted')
    for (const db of Object.values(clients))
      expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
    const counts = { importedRows: 7, changedRows: 3, deletedRows: 1 }
    const record: PreparedDivision = {
      base: {
        id: 'planning-test',
        bbox: [114, 22, 115, 23],
        cartography: null,
        divisionCode: 'test',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [114, 22],
              [115, 22],
              [115, 23],
              [114, 22],
            ],
          ],
        },
        hierarchy: [],
        identifiers: {},
        level: 1,
        sources: {},
        type: 'area',
        wikidata: null,
      },
      cells: [],
      i18n: [],
      newTown: null,
      raw: {},
      sourceCellIds: [],
      versionHash: 'fixed',
    }
    await expect(
      deliverPlandWorkflow(phase, context, async copy => {
        await replaceCurrentSnapshot(
          copy.currentDb as unknown as HarbourWritableDb,
          'snapshot',
          [record],
          compressPlanningDivisionGeometry([record], () => {}),
          [],
          '2026-09-07T00:00:00.000Z',
          () => {},
        )
        for (const db of [copy.currentDb, copy.historyDb, copy.sourceDb, copy.metaDb]) {
          await db
            .update(counter)
            .set({ n: sql`${counter.n}+1` })
            .run()
          expect(await db.select().from(counter).all()).toEqual([{ n: 1 }])
        }
        // Fault only the real target, after preparation copies have been created.
        clients.DB_HISTORY.exec(
          "CREATE TRIGGER fail BEFORE UPDATE ON counter BEGIN SELECT RAISE(ABORT, 'delivery interrupted'); END",
        )
        for (const db of Object.values(clients))
          expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
        return counts
      }),
    ).rejects.toThrow('delivery interrupted')
    expect(clients.DB_CURRENT.query('SELECT n FROM counter').get()).toEqual({ n: 1 })
    clients.DB_HISTORY.exec('DROP TRIGGER fail')
    expect(
      await deliverPlandWorkflow(phase, context, async () => {
        throw new Error('Must not repeat Planning materialisation')
      }),
    ).toEqual(counts)
    for (const db of Object.values(clients))
      expect(db.query('SELECT n FROM counter').get()).toEqual({ n: 1 })
    expect(
      clients.DB_CURRENT.query(
        'SELECT id, snapshotId, typeof(geometry) AS encoding FROM divisions',
      ).all(),
    ).toEqual([{ id: 'planning-test', snapshotId: 'snapshot', encoding: 'blob' }])
  } finally {
    for (const db of Object.values(clients)) db.close()
    await rm(root, { recursive: true, force: true })
    await rm(dirname(sqlDeliveryPhaseDirectory(phase)), {
      recursive: true,
      force: true,
    })
  }
})

test('Planning continuation counts fail closed on invalid retained values', () => {
  expect(() => readPlandDeliveryCounts(undefined)).toThrow('importedRows')
  expect(() =>
    readPlandDeliveryCounts({ importedRows: 3, changedRows: -1, deletedRows: 0 }),
  ).toThrow('changedRows')
})
