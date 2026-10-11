import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import {
  buildGeographicCrosswalk,
  verifyGeographicCrosswalk,
  geographicCrosswalkStatements,
  type CrosswalkSelection,
} from './geographicCrosswalk'
const selection: CrosswalkSelection = {
  geographicReleaseSet: 'geo',
  geographicSnapshotId: 'g',
  geographicAreaSnapshotId: 'ga',
  sourceReleaseSet: 'planning',
  sourceSnapshotId: 'p',
  sourceAreaSnapshotId: 'pa',
  sourceDomain: 'hkgov-pland-pu',
  sourceCohort: '2021',
}
const box = (id: string, west: number, east: number) => ({
  id,
  areas: [
    {
      type: 'Polygon' as const,
      coordinates: [
        [
          [west, 22.3],
          [east, 22.3],
          [east, 22.31],
          [west, 22.31],
          [west, 22.3],
        ],
      ],
    },
  ],
})
test('cross-boundary TPU retains both districts; containment and disjoint bounds are explicit', () => {
  const result = buildGeographicCrosswalk(
    selection,
    [box('tpu', 114.1, 114.12)],
    [
      box('west', 114.09, 114.11),
      box('east', 114.11, 114.13),
      box('all', 114.09, 114.13),
      box('far', 114.2, 114.3),
    ],
  )
  expect(result.memberships.map(r => r.geographicDivisionId)).toEqual([
    'all',
    'east',
    'west',
  ])
  expect(result.memberships[0]!.fullyContained).toBe(true)
  expect(result.memberships[1]!.sourceFraction).toBeCloseTo(0.5, 3)
  expect(result.memberships[2]!.fullyContained).toBe(false)
  expect(
    buildGeographicCrosswalk(
      selection,
      [box('tpu', 114.1, 114.12)],
      [box('west', 114.09, 114.11)],
    ).id,
  ).toBe(result.id)
})
test('crosswalk SQL is idempotent and refuses a changed immutable selection', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      loadMigrationSql(
        resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
        ['current'],
      ),
    )
    const result = buildGeographicCrosswalk(
      selection,
      [box('tpu', 114.1, 114.12)],
      [box('district', 114.09, 114.13)],
    )
    db.transaction(() =>
      geographicCrosswalkStatements(result).forEach(statement => {
        db.run(statement)
      }),
    )()
    db.transaction(() =>
      geographicCrosswalkStatements(result).forEach(statement => {
        db.run(statement)
      }),
    )()
    expect(
      db.query('select count(*) as n from divisionGeographicMemberships').get(),
    ).toEqual({ n: 1 })
    expect(() =>
      db.transaction(() =>
        geographicCrosswalkStatements({ ...result, contentHash: 'changed' }).forEach(
          statement => {
            db.run(statement)
          },
        ),
      )(),
    ).toThrow()
    expect(db.query('pragma foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})

test('boundary-only contact, holes and sub-square-metre slivers do not create links', () => {
  const source = box('tpu', 114.1, 114.12)
  const touching = box('touching', 114.12, 114.13)
  const sliver = box('sliver', 114.12 - 1e-10, 114.13)
  const hole = {
    id: 'hole',
    areas: [
      {
        type: 'Polygon' as const,
        coordinates: [
          [
            [114, 22.2],
            [114.3, 22.2],
            [114.3, 22.4],
            [114, 22.4],
            [114, 22.2],
          ],
          [
            [114.09, 22.29],
            [114.09, 22.32],
            [114.13, 22.32],
            [114.13, 22.29],
            [114.09, 22.29],
          ],
        ],
      },
    ],
  }
  expect(
    buildGeographicCrosswalk(selection, [source], [touching, sliver, hole]).memberships,
  ).toEqual([])
})

test('crosswalk artefact integrity rejects tampered membership', () => {
  const result = buildGeographicCrosswalk(
    selection,
    [box('tpu', 114.1, 114.12)],
    [box('district', 114.09, 114.13)],
  )
  expect(() => verifyGeographicCrosswalk(result)).not.toThrow()
  result.memberships[0]!.sourceFraction = 0.25
  expect(() => verifyGeographicCrosswalk(result)).toThrow('hash or policy mismatch')
})
