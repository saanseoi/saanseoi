import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/places/place'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { fixture } from '../local/sqlDeliveryTestFixture.ts'
import { prepareSqlDelivery, runSqlDelivery } from '../local/sqlDelivery.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { getPreparedPublication } from '../local/snapshotPublication.ts'
import { importPlaceSqlBatches } from './processLocalPlaceSqlUploadImport.ts'
import type {
  BuildPlaceSqlInput,
  EnrichedPlace,
} from './processLocalPlaceSqlUploadTypes.ts'

test('Places delivery writes only current content changes and removals, with receipt-safe remote and mirror replay', () =>
  fixture(async f => {
    const local = new Database(f.localPath)
    try {
      const migrationSql = loadMigrationSql(
        join(import.meta.dir, '../../../../../../libs/db/migrations'),
        ['current'],
      )
      const tables = ['places', 'placesI18n', 'placesCells', 'placesDivision']
      for (const db of [f.remote, local]) {
        db.exec(migrationSql)
        db.exec(
          'PRAGMA foreign_keys=ON; CREATE TABLE audit(tableName TEXT, operation TEXT);',
        )
        for (const table of tables)
          for (const operation of ['INSERT', 'UPDATE', 'DELETE'])
            db.exec(
              `CREATE TRIGGER audit_${table}_${operation} AFTER ${operation} ON ${table} BEGIN INSERT INTO audit VALUES ('${table}','${operation}'); END`,
            )
      }
      const place = (id: string): EnrichedPlace => {
        const normalised = normaliseOverturePlace(
          {
            id,
            geometry: { type: 'Point', coordinates: [114.17, 22.32] },
            names: { en: id },
          },
          '2026-09-01.0',
        )
        if (!normalised) throw new Error('Missing normalised Place')
        normalised.i18n.push({ ...normalised.i18n[0]!, locale: 'zh-Hant' })
        return {
          place: normalised,
          sourcePayloadHash: id,
          versionHash: id,
          address2dId: null,
          address3dId: null,
          divisionIds: [],
        }
      }
      const target = { name: 'current' as const, databaseId: 'db' }
      const other = { name: 'history' as const, databaseId: 'ignored' }
      const targets = {
        current: target,
        history: other,
        sourceByBinding: new Map([['source', other]]),
        historyByBinding: new Map([['history', other]]),
      } as unknown as Parameters<typeof importPlaceSqlBatches>[0]
      const initial = [place('a'), place('b')]
      const run = async (revision: number, rows: EnrichedPlace[]) => {
        const releaseId = `release-${revision}`
        const directory = join(f.root, `delivery-${revision}`)
        const path = join(f.root, `places-${revision}.jsonl`)
        await Bun.write(path, rows.map(row => JSON.stringify(row)).join('\n'))
        const previous = await getPreparedPublication(
          drizzle({ client: local }) as never,
          'placePublicationState',
          'place-scope',
        )
        const input: BuildPlaceSqlInput = {
          publicationPrevious: previous,
          activeHistoryBindingName: 'history',
          activeSourceBindingName: 'source',
          sourceBindingNames: [],
          datasetId: 'dataset',
          message: {
            releaseId,
            sourceVersion: `2026-${revision}`,
          } as BuildPlaceSqlInput['message'],
          snapshots: {
            snapshotId: `snapshot-${revision}`,
            snapshotLineageId: 'place-scope',
            addressSnapshotId: 'address',
            divisionSnapshotId: 'division',
          },
          places: [],
          historyRows: [],
        }
        await prepareSqlDelivery(
          directory,
          { ...f.context, releaseId, inputs: { revision } },
          async append => {
            await importPlaceSqlBatches(
              targets,
              input,
              path,
              rows.length,
              `2026-09-${revision}`,
              {
                isLocal: false,
                captureSql: async (selected, bytes) => {
                  if (selected.databaseId === 'db')
                    await append({ bindingName: 'DB_CURRENT', databaseId: 'db' }, bytes)
                },
              },
            )
          },
        )
        for (const mode of ['remote', 'local'] as const)
          await runSqlDelivery(directory, { ...f.options, mode })
        const writes = [f.remote, local].map(db =>
          db.query('SELECT * FROM audit').all(),
        )
        expect(writes[0]).toEqual(writes[1])
        for (const mode of ['remote', 'local'] as const)
          await runSqlDelivery(directory, { ...f.options, mode })
        expect(
          [f.remote, local].map(db => db.query('SELECT * FROM audit').all()),
        ).toEqual(writes)
        await completeSqlDeliveryRelease(f.root, releaseId)
      }
      await run(1, initial)
      for (const db of [f.remote, local]) db.exec('DELETE FROM audit')
      const reissued = structuredClone(initial)
      for (const row of reissued) row.place.lastSeenMonth = '2026-10'
      await run(2, reissued)
      expect(local.query('SELECT * FROM audit').all()).toEqual([])
      reissued[0]!.place.i18n[0]!.name = 'Revised place'
      reissued[0]!.versionHash = 'revised'
      await run(3, reissued)
      expect(local.query('SELECT * FROM audit').all()).toEqual([
        { tableName: 'placesI18n', operation: 'UPDATE' },
      ])
      for (const db of [f.remote, local]) db.exec('DELETE FROM audit')
      reissued[0]!.place.i18n = [reissued[0]!.place.i18n[0]!]
      await run(4, [reissued[0]!])
      const summary = local
        .query(
          'SELECT tableName,operation,count(*) AS n FROM audit GROUP BY tableName,operation ORDER BY tableName',
        )
        .all()
      expect(summary).toEqual([
        { tableName: 'places', operation: 'DELETE', n: 1 },
        { tableName: 'placesCells', operation: 'DELETE', n: 5 },
        { tableName: 'placesI18n', operation: 'DELETE', n: 3 },
      ])
      expect(local.query('SELECT DISTINCT snapshotId FROM places').all()).toEqual([
        { snapshotId: 'place-scope' },
      ])
      for (const db of [f.remote, local]) db.exec('DELETE FROM audit')
      await run(5, [])
      expect(local.query('SELECT count(*) AS n FROM places').get()).toEqual({ n: 0 })
    } finally {
      local.close()
    }
  }))
