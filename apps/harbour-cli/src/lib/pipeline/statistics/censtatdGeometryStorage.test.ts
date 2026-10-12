import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { sourceSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import {
  censtatdGeometryId,
  censtatdGeometryRow,
  censtatdDerivativeRow,
} from '@repo/core/pipeline/services/sources/censtatdGeometry'
import { describeCenstatdGeometryReuse } from './censtatdGeometryStorage'
import { sourceStatisticAssertion } from './sourceStatisticAssertion'
import { buildStatisticSqlBatches } from './statisticSqlReplay'

const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [114, 22],
      [115, 22],
      [115, 23],
      [114, 22],
    ],
  ],
}
test('releases and datasets own statistics while reusing geometry, including repeat delivery', async () => {
  const db = new Database(':memory:')
  db.exec(
    loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
      'source',
    ]),
  )
  db.exec('PRAGMA foreign_keys=ON')
  const readable = drizzle({
    client: db,
    schema: sourceSchema,
  }) as unknown as HarbourReadableDb
  const write = (
    release: string,
    dataset: string,
    population: number,
    sourceGeometry = geometry,
  ) => {
    const row = sourceStatisticAssertion(
      {
        sourceRecordId: 'district',
        sourceGeometry,
        properties: { population },
        sources: [],
        versionHash: `${population}-${censtatdGeometryId(sourceGeometry)}`,
        resourceReleaseId: release,
        validFromRelease: release,
        validToRelease: null,
        isCurrent: true,
        createdAt: 'now',
        updatedAt: 'now',
      },
      dataset,
    )
    for (const sql of buildStatisticSqlBatches({
      resourceReleaseId: release,
      sourceVersion: release,
      source: {
        table: 'hkgovCenstatdStatistics',
        rows: [row],
        geometries: [censtatdGeometryRow(sourceGeometry)],
      },
    }).source)
      db.exec(sql)
  }
  try {
    expect(
      await describeCenstatdGeometryReuse(readable, [{ sourceGeometry: geometry }]),
    ).toContain('1 new, 0 reused')
    write('r1', 'dataset-a', 100)
    expect(
      await describeCenstatdGeometryReuse(readable, [{ sourceGeometry: geometry }]),
    ).toContain('0 new, 1 reused')
    write('r2', 'dataset-a', 120)
    write('r2', 'dataset-a', 120)
    write('r3', 'dataset-b', 200)
    expect(db.query('SELECT count(*) AS n FROM hkgovCenstatdStatistics').get()).toEqual(
      { n: 3 },
    )
    expect(
      db.query('SELECT count(*) AS n FROM hkgovCenstatdStatisticsGeometry').get(),
    ).toEqual({ n: 1 })
    write('r4', 'dataset-a', 120, {
      ...geometry,
      coordinates: [
        [
          [114, 22],
          [116, 22],
          [116, 23],
          [114, 22],
        ],
      ],
    })
    expect(
      db.query('SELECT count(*) AS n FROM hkgovCenstatdStatisticsGeometry').get(),
    ).toEqual({ n: 2 })
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})

test('geometry identity ignores object key order and derivatives include coverage and engine settings', () => {
  expect(censtatdGeometryId(geometry)).toBe(
    censtatdGeometryId({ coordinates: geometry.coordinates, type: geometry.type }),
  )
  const input = {
    geometryId: censtatdGeometryId(geometry),
    transform: 'simplified',
    derivation: { tolerance: 10, engineVersion: '1' },
    coverageGeometryIds: ['a', 'b'],
    geometry,
    bbox: [114, 22, 115, 23],
  }
  const first = censtatdDerivativeRow(input)
  expect(
    censtatdDerivativeRow({ ...input, coverageGeometryIds: ['b', 'a'] }).transformHash,
  ).toBe(first.transformHash)
  expect(
    censtatdDerivativeRow({ ...input, coverageGeometryIds: ['a', 'c'] }).transformHash,
  ).not.toBe(first.transformHash)
  expect(
    censtatdDerivativeRow({
      ...input,
      derivation: { tolerance: 20, engineVersion: '1' },
    }).transformHash,
  ).not.toBe(first.transformHash)
  expect(
    censtatdDerivativeRow({
      ...input,
      derivation: { tolerance: 10, engineVersion: '2' },
    }).transformHash,
  ).not.toBe(first.transformHash)
})
