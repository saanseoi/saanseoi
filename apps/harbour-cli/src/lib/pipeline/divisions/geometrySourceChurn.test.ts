import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { compressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { geometrySourceChurn } from './geometrySourceChurn'

for (const type of ['divisionArea', 'divisionBoundary'] as const) {
  test(`${type} counts publisher attribution changes across shards, independently of geometry`, async () => {
    const meta = new Database(':memory:')
    const old = new Database(':memory:')
    const current = new Database(':memory:')
    const table =
      type === 'divisionArea' ? 'overtureDivisionAreas' : 'overtureDivisionBoundaries'
    meta.exec(
      `CREATE TABLE resourceReleases(id,datasetId,sourceVersion,resourceType,status,revokedAt);`,
    )
    for (const [id, version] of [
      ['old', '2025-12'],
      ['new', '2026-01'],
    ])
      meta
        .query('INSERT INTO resourceReleases VALUES(?,?,?,?,?,NULL)')
        .run(id!, 'dataset', version!, type, 'current')
    for (const db of [old, current])
      db.exec(
        `CREATE TABLE ${table}(sourceRecordId,versionHash,properties,sourceGeometry,validFromRelease,validToRelease)`,
      )
    const geometry = compressJsonBrotli({ type: 'Point', coordinates: [114, 22] })
    old
      .query(`INSERT INTO ${table} VALUES(?,?,?,?,?,?)`)
      .run(
        'record',
        'A',
        JSON.stringify({ class: 'land', sources: [{ recordId: 'relation@1' }] }),
        geometry,
        '2025-12',
        '2026-01',
      )
    current
      .query(`INSERT INTO ${table} VALUES(?,?,?,?,?,NULL)`)
      .run(
        'record',
        'B',
        JSON.stringify({ class: 'land', sources: [{ recordId: 'relation@2' }] }),
        geometry,
        '2026-01',
      )
    const asDb = (db: Database) =>
      drizzle({ client: db }) as unknown as HarbourReadableDb
    try {
      const churn = await geometrySourceChurn(
        asDb(meta),
        [asDb(old), asDb(current)],
        'new',
        type,
      )
      expect(churn.totals).toEqual({
        count: 1,
        added_count: 0,
        removed_count: 0,
        changed_count: 1,
        unchanged_count: 0,
      })
      expect(churn.byType.get('land')?.changed_count).toBe(1)
      // A first release is all additions, irrespective of later retained rows.
      expect(
        (await geometrySourceChurn(asDb(meta), [asDb(old), asDb(current)], 'old', type))
          .totals.added_count,
      ).toBe(1)
      // Missing or overlapping history must not become believable summary counts.
      await expect(
        geometrySourceChurn(asDb(meta), [asDb(current)], 'new', type),
      ).rejects.toThrow('Missing retained')
      old.exec(`UPDATE ${table} SET validToRelease=NULL`)
      await expect(
        geometrySourceChurn(asDb(meta), [asDb(old), asDb(current)], 'new', type),
      ).rejects.toThrow('Ambiguous')
    } finally {
      meta.close()
      old.close()
      current.close()
    }
  })
}
