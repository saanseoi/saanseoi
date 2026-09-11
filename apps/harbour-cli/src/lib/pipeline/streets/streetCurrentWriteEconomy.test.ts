import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import {
  beginSnapshotPublication,
  completeSnapshotPublication,
  guardSnapshotPublicationWrites,
} from '../local/snapshotPublication.ts'
import { buildPublicationRowCountSql } from '@repo/core/pipeline/services/publication/sql.ts'
import { currentSchema } from '@repo/db'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { sqlDeliveryPhaseDirectory } from '../local/sqlDeliveryPhase.ts'
import { deliverStreetWorkflow } from './streetDelivery.ts'
import {
  replaceCurrentStreetRows,
  replaceCurrentStreetI18nRows,
} from './processLocalStreetSqlUploadRows.ts'
import type { PreparedMaterialisedStreet } from './processLocalStreetSqlUploadTypes.ts'

test('Street native delivery preserves unchanged current rows and only writes changed names or removals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'street-current-economy-'))
  const bindings = ['DB_CURRENT', 'DB_META', 'DB_HISTORY', 'DB_SOURCE']
  const files = Object.fromEntries(
    bindings.map(binding => [binding, join(root, `${binding}.sqlite`)]),
  )
  const databases = Object.fromEntries(
    bindings.map(binding => [binding, new Database(files[binding]!)]),
  )
  const current = databases.DB_CURRENT!
  const directories: string[] = []
  const context = {
    currentDb: drizzle({ client: current, schema: currentSchema }),
    metaDb: drizzle({ client: databases.DB_META! }),
    historyDb: drizzle({ client: databases.DB_HISTORY! }),
    sourceDb: drizzle({ client: databases.DB_SOURCE! }),
    historyBinding: createLocalExecBinding(databases.DB_HISTORY!, 'DB_HISTORY'),
    sourceBinding: createLocalExecBinding(databases.DB_SOURCE!, 'DB_SOURCE'),
    state: { target: 'local', files, dbCacheDir: root, bindings: {} },
  } as unknown as LocalAddressDbContext
  try {
    current.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        'current',
      ]),
    )
    current.exec(`CREATE TABLE audit(tableName TEXT,operation TEXT);`)
    for (const table of ['streets', 'streetsI18n', 'streetChangelog'])
      for (const operation of ['INSERT', 'UPDATE', 'DELETE'])
        current.exec(
          `CREATE TRIGGER audit_${table}_${operation} AFTER ${operation} ON ${table} BEGIN INSERT INTO audit VALUES ('${table}','${operation}'); END`,
        )
    const street = (id: string): PreparedMaterialisedStreet => ({
      id,
      status: 'active',
      version: 1,
      districtIds: [],
      deletedAt: null,
      gazetteDate: null,
      sources: {},
      versionHash: id,
      i18n: [
        { locale: 'en', name: id, description: null },
        { locale: 'zh-Hant', name: id, description: null },
      ],
    })
    const initial = [street('a'), street('b')]
    const run = async (
      revision: number,
      rows: PreparedMaterialisedStreet[],
      count: number,
      locales: number,
    ) => {
      const releaseId = `street-economy-${root.split('/').at(-1)}-${revision}`
      const phase = { context, releaseId, phase: 'street-data', inputs: { revision } }
      directories.push(dirname(sqlDeliveryPhaseDirectory(phase)))
      const generate = async (copy: LocalAddressDbContext) => {
        const publication = {
          table: 'streetPublicationState' as const,
          scopeId: 'street-scope',
          snapshotId: `snapshot-${revision}`,
          publicationToken: releaseId,
          timestamp: `2026-09-${revision}`,
        }
        await beginSnapshotPublication(copy.currentDb, publication)
        const guarded = guardSnapshotPublicationWrites(copy.currentDb, publication)
        await replaceCurrentStreetRows(
          guarded as never,
          'street-scope',
          rows,
          publication.timestamp,
        )
        await replaceCurrentStreetI18nRows(
          guarded as never,
          'street-scope',
          rows,
          publication.timestamp,
        )
        await completeSnapshotPublication(
          copy.currentDb,
          publication,
          [
            buildPublicationRowCountSql('streets', 'street-scope', count),
            buildPublicationRowCountSql('streetsI18n', 'street-scope', locales),
          ].join(' AND '),
        )
        return {
          importedRows: rows.length,
          changedRows: rows.length,
          sourceRowsChanged: 0,
        }
      }
      await deliverStreetWorkflow(context, releaseId, phase.inputs, generate)
      const writes = current.query('SELECT count(*) AS n FROM audit').get()
      await deliverStreetWorkflow(context, releaseId, phase.inputs, async () => {
        throw new Error('Must resume exact delivery')
      })
      expect(current.query('SELECT count(*) AS n FROM audit').get()).toEqual(writes)
      await completeSqlDeliveryRelease(root, releaseId)
    }
    await run(1, initial, 2, 4)
    current.exec('DELETE FROM audit')
    await run(2, initial, 2, 4)
    expect(current.query('SELECT * FROM audit').all()).toEqual([])
    const revised = structuredClone(initial)
    revised[0]!.i18n[0]!.name = 'Revised Road'
    await run(3, revised, 2, 4)
    expect(current.query('SELECT * FROM audit').all()).toEqual([
      { tableName: 'streetsI18n', operation: 'UPDATE' },
    ])
    current.exec('DELETE FROM audit')
    revised[0]!.i18n = [revised[0]!.i18n[0]!]
    revised[1]!.status = 'deleted'
    revised[1]!.i18n = []
    await run(4, revised, 1, 1)
    expect(
      current
        .query(
          'SELECT tableName,operation,count(*) AS n FROM audit GROUP BY tableName,operation ORDER BY tableName',
        )
        .all(),
    ).toEqual([
      { tableName: 'streets', operation: 'DELETE', n: 1 },
      { tableName: 'streetsI18n', operation: 'DELETE', n: 3 },
    ])
    expect(current.query('SELECT DISTINCT snapshotId FROM streets').all()).toEqual([
      { snapshotId: 'street-scope' },
    ])
  } finally {
    for (const db of Object.values(databases)) db.close()
    await rm(root, { recursive: true, force: true })
    for (const directory of directories)
      await rm(directory, { recursive: true, force: true })
  }
})
