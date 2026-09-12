import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import type { HarbourReadableDb } from '../../lib/db/types'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { landsdPlaceNameResolutions } from './landsdPlaceNameSources'

test('LandsD resolutions select exact native versions with bounded queries, independently of canonical hashes', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'source',
      ]),
    )
    const insert = sqlite.prepare(
      'INSERT INTO hkgovLandsdPlaceNames (sourceRecordId,versionHash,releaseId,validFromRelease,validToRelease,isCurrent,sourceGeometry,placeNames,properties) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const rows = Array.from({ length: 150 }, (_, index) => ({
      id: `canonical-${index}`,
      raw: { geo_name_id: String(index), corrected: true },
    }))
    for (const row of rows) {
      insert.run(
        `LANDSD:PLACE_NAME:${row.raw.geo_name_id}`,
        'earlier-native-hash',
        'latest-acquisition',
        '2020-01-01.0',
        '2026-01-01.0',
        0,
        '{}',
        '[]',
        '{"upstream":true}',
      )
      insert.run(
        `LANDSD:PLACE_NAME:${row.raw.geo_name_id}`,
        'later-native-hash',
        'latest-acquisition',
        '2026-01-01.0',
        null,
        1,
        '{}',
        '[]',
        '{"upstream":false}',
      )
    }
    const counts: number[] = []
    const db = drizzle({
      client: sqlite,
      logger: {
        logQuery(_query, params) {
          counts.push(params.length)
        },
      },
    }) as unknown as HarbourReadableDb
    const earlier = await landsdPlaceNameResolutions(
      [db],
      '2025-01-01.0',
      'earlier-snapshot',
      rows,
      'requested-release',
    )
    expect(earlier).toHaveLength(150)
    expect(earlier[0]).toEqual({
      snapshotId: 'earlier-snapshot',
      sourceReleaseId: 'requested-release',
      sourceRecordId: 'LANDSD:PLACE_NAME:0',
      sourceVersionHash: 'earlier-native-hash',
      resolutions: { entities: { division: ['canonical-0'] } },
    })
    const later = await landsdPlaceNameResolutions(
      [db],
      '2026-01-01.0',
      'later-snapshot',
      rows.slice(0, 1),
      'later-release',
    )
    expect(later[0]?.sourceVersionHash).toBe('later-native-hash')
    expect(Math.max(...counts)).toBeLessThanOrEqual(100)
    await expect(
      landsdPlaceNameResolutions(
        [db],
        '2019-01-01.0',
        'snapshot',
        rows.slice(0, 1),
        'release',
      ),
    ).rejects.toThrow('Missing retained LandsD source version')
    await expect(
      landsdPlaceNameResolutions(
        [db],
        '2025-01-01.0',
        'snapshot',
        [{ id: 'invented', raw: {} }],
        'release',
      ),
    ).rejects.toThrow('Missing LandsD publisher identity')
  } finally {
    sqlite.close()
  }
})
