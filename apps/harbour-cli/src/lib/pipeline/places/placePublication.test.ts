import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { importPlaceSqlBatches } from './processLocalPlaceSqlUploadImport.ts'

test('streamed empty Places delivery validates every projection table before preparing its receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'place-publication-'))
  const current = new Database(':memory:')
  try {
    current.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        'current',
      ]),
    )
    const path = join(root, 'places.jsonl')
    await Bun.write(path, '')
    const targets = {
      current: {
        name: 'current',
        databaseId: 'DB_CURRENT',
        binding: createLocalExecBinding(current, 'DB_CURRENT'),
      },
      sourceByBinding: new Map(),
      historyByBinding: new Map(),
    } as unknown as Parameters<typeof importPlaceSqlBatches>[0]
    await importPlaceSqlBatches(
      targets,
      {
        activeHistoryBindingName: 'history',
        activeSourceBindingName: 'source',
        sourceBindingNames: [],
        datasetId: 'dataset',
        message: { releaseId: 'release', sourceVersion: '2026-09' } as Parameters<
          typeof importPlaceSqlBatches
        >[1]['message'],
        snapshots: {
          snapshotId: 'snapshot',
          snapshotLineageId: 'lineage',
          addressSnapshotId: 'address',
          divisionSnapshotId: 'division',
        },
        places: [],
        historyRows: [],
      },
      path,
      0,
      '2026-09-11',
      { isLocal: true },
    )
    expect(
      current
        .query(
          'SELECT scopeId, snapshotId, status, preparedAt FROM placePublicationState',
        )
        .get(),
    ).toEqual({
      scopeId: 'lineage',
      snapshotId: 'snapshot',
      status: 'publishing',
      preparedAt: '2026-09-11',
    })
  } finally {
    current.close()
    await rm(root, { recursive: true, force: true })
  }
})
