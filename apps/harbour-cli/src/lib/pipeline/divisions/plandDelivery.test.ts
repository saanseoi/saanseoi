import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { sql } from 'drizzle-orm'
import {
  beginSnapshotPublication,
  completeSnapshotPublication,
} from '../local/snapshotPublication.ts'
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
    for (const [binding, db] of Object.entries(clients))
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          [
            binding === 'DB_CURRENT'
              ? 'current'
              : binding === 'DB_META'
                ? 'meta'
                : binding === 'DB_HISTORY'
                  ? 'history'
                  : 'source',
          ],
        ),
      )
    await expect(
      deliverPlandWorkflow(phase, context, async _copy => {
        throw new Error('preparation interrupted')
      }),
    ).rejects.toThrow('preparation interrupted')
    expect(
      clients.DB_CURRENT.query('SELECT count(*) AS n FROM divisions').get(),
    ).toEqual({ n: 0 })
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
        hierarchies: { administrative: [], locality: [], full: [] },
        identifiers: {},
        level: 1,
        sources: {},
        class: 'area',
        category: 'administrative',
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
        const publication = {
          table: 'divisionPublicationState' as const,
          scopeId: 'snapshot',
          snapshotId: 'logical-snapshot',
          publicationToken: phase.releaseId,
          timestamp: '2026-09-12',
        }
        await beginSnapshotPublication(copy.currentDb, publication)
        await replaceCurrentSnapshot(
          copy.currentDb as unknown as HarbourWritableDb,
          'snapshot',
          [record],
          compressPlanningDivisionGeometry([record], () => {}),
          [],
          '2026-09-07T00:00:00.000Z',
          () => {},
        )
        await copy.historyDb.run(
          sql`INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId) VALUES('logical-snapshot','division','planning-test','','fixed','upsert','release')`,
        )
        await completeSnapshotPublication(
          copy.currentDb,
          publication,
          "(SELECT count(*) FROM divisions WHERE snapshotId='snapshot')=1",
        )
        clients.DB_HISTORY.exec(
          "CREATE TRIGGER fail BEFORE INSERT ON snapshotVersionChanges BEGIN SELECT RAISE(ABORT, 'delivery interrupted'); END",
        )
        expect(
          clients.DB_CURRENT.query('SELECT count(*) AS n FROM divisions').get(),
        ).toEqual({ n: 0 })
        return counts
      }),
    ).rejects.toThrow('delivery interrupted')
    expect(
      clients.DB_CURRENT.query('SELECT count(*) AS n FROM divisions').get(),
    ).toEqual({ n: 1 })
    clients.DB_HISTORY.exec('DROP TRIGGER fail')
    expect(
      await deliverPlandWorkflow(phase, context, async () => {
        throw new Error('Must not repeat Planning materialisation')
      }),
    ).toEqual(counts)
    expect(
      clients.DB_HISTORY.query(
        'SELECT count(*) AS n FROM snapshotVersionChanges',
      ).get(),
    ).toEqual({ n: 1 })
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
