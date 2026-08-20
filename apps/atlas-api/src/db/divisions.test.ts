import { expect, test } from 'bun:test'

import { compressJsonBrotli } from '@repo/core/pipeline/services/brotliJson.ts'

import {
  listDivisionAreasCurrentByDivisionIds,
  listDivisionBoundariesCurrentByDivisionIds,
} from './divisions.ts'

test('decompresses exact C&SD division-area geometry before returning it to the API service', async () => {
  const geometry = {
    coordinates: [
      [114.1, 22.2],
      [114.2, 22.2],
      [114.1, 22.2],
    ],
    type: 'Polygon',
  }
  const rows = [
    {
      bbox: [114.1, 22.2, 114.2, 22.2],
      divisionId: 'district-central-western',
      geometry: compressJsonBrotli(geometry),
      id: 'censtatd-2016-central-western',
      isLand: true,
      isTerritorial: true,
      sourceKeys: null,
      sources: null,
      type: 'district',
      variant: 'hkgov-censtatd:2016',
    },
  ]
  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                all: () => rows,
              }
            },
          }
        },
      }
    },
  } as never

  const result = await listDivisionAreasCurrentByDivisionIds(db, {
    divisionIds: ['district-central-western'],
    snapshotId: 'snapshot-censtatd-2016',
    variant: 'hkgov-censtatd:2016',
  })

  expect(result[0]?.geometry).toEqual(geometry)
})

test('chunks division-area IDs within the D1 variable limit', async () => {
  let queryCount = 0
  const db = {
    select() {
      queryCount += 1
      return {
        from() {
          return {
            where() {
              return { all: async () => [] }
            },
          }
        },
      }
    },
  } as never

  await listDivisionAreasCurrentByDivisionIds(db, {
    divisionIds: Array.from({ length: 100 }, (_, index) => `division-${index}`),
    snapshotId: 'snapshot-1',
    variant: 'overture',
  })

  expect(queryCount).toBe(2)
})

test('chunks and deduplicates division-boundary lookups within the D1 variable limit', async () => {
  let queryCount = 0
  const row = {
    id: 'boundary-1',
    variant: 'overture',
    leftDivisionId: 'division-1',
    rightDivisionId: 'division-2',
    bbox: null,
    geometry: null,
    sourceKeys: null,
    sources: null,
    type: 'administrative',
    isLand: true,
    isTerritorial: true,
  }
  const db = {
    select() {
      queryCount += 1
      return {
        from() {
          return {
            where() {
              return { all: async () => [row] }
            },
          }
        },
      }
    },
  } as never

  const result = await listDivisionBoundariesCurrentByDivisionIds(db, {
    divisionIds: Array.from({ length: 100 }, (_, index) => `division-${index}`),
    snapshotId: 'snapshot-1',
  })

  expect(queryCount).toBe(4)
  expect(result).toHaveLength(1)
  expect(result[0]?.id).toBe('boundary-1')
})
