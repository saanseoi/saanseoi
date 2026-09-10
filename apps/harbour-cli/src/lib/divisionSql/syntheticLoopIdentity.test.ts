import { expect, test } from 'bun:test'
import { overtureHongKongAreaDivisionId } from '@repo/core/pipeline/services/overtureHongKongAreas'
import { resolveSyntheticOvertureHongKongAreas } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry'

test('New Territories uses the reviewed Loop identity despite a same-named locality', async () => {
  const loop = '222b7818-970a-491d-98b6-b88d8c6f0161'
  const locality = 'c8488b42-3b2e-425b-8930-cce3fded69e2'
  const districts = Array.from({ length: 9 }, (_, i) => `district-${i}`)
  const rows = [
    {
      id: overtureHongKongAreaDivisionId('new-territories'),
      level: 1,
      identifiers: { saanseoiCorrection: { districtDivisionIds: districts } },
    },
    { id: loop, level: 4, identifiers: null },
    { id: locality, level: 6, identifiers: null },
  ]
  let includeLoop = true
  let reads = 0
  const current = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'all'
          ? async () =>
              reads++ % 2 === 0
                ? rows.filter(row => includeLoop || row.id !== loop)
                : [loop, locality].map(divisionId => ({
                    divisionId,
                    name: 'Lok Ma Chau Loop',
                  }))
          : () => current,
    },
  )
  const meta = new Proxy(
    {},
    {
      get: (_, key) => (key === 'get' ? async () => ({ id: 'snapshot' }) : () => meta),
    },
  )
  type Args = Parameters<typeof resolveSyntheticOvertureHongKongAreas>
  const resolve = () =>
    resolveSyntheticOvertureHongKongAreas(
      current as Args[0],
      meta as Args[1],
      { source: 'overture', regionCode: 'hk', cohortKey: '2025-09-24.0' } as Args[2],
    )
  const result = await resolve()
  expect(result[0]?.districtDivisionIds).toEqual([...districts, loop])
  includeLoop = false
  await expect(resolve()).rejects.toThrow(
    'expected the reviewed Lok Ma Chau Loop identity',
  )
})
