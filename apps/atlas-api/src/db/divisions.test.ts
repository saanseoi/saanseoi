import { expect, test } from 'bun:test'

import { compressJsonBrotli } from '@repo/core/pipeline/services/brotliJson.ts'

import { listDivisionAreasCurrentByDivisionIds } from './divisions.ts'

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
