import { expect, test } from 'bun:test'
import { addMaterialisedStreetHash } from './processLocalStreetSqlUploadPreparation'

test('Street version counters do not change content identity but lifecycle dates do', async () => {
  const street = {
    id: 'street',
    version: 1,
    deletedAt: null,
    gazetteDate: '2026-01-01',
    districtIds: [],
    i18n: [],
    sources: {},
    status: 'active' as const,
  }
  const first = await addMaterialisedStreetHash(street)
  expect((await addMaterialisedStreetHash({ ...street, version: 2 })).versionHash).toBe(
    first.versionHash,
  )
  expect(
    (await addMaterialisedStreetHash({ ...street, gazetteDate: '2026-02-01' }))
      .versionHash,
  ).not.toBe(first.versionHash)
})
