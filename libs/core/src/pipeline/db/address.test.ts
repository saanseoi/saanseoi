import { expect, test } from 'bun:test'

import { getMergedCurrentAddressVersionLookup } from './address'

const addressRow = (id: string, versionHash: string) => ({
  areaId: null,
  bbox: null,
  countryId: null,
  districtId: null,
  geometry: null,
  hamletId: null,
  id,
  identifiers: {},
  macrohoodId: null,
  microhoodId: null,
  neighbourhoodId: null,
  sources: {},
  streetId: null,
  townId: null,
  versionHash,
  villageId: null,
})

function createLookupDb(row: ReturnType<typeof addressRow>) {
  let selectCount = 0

  return {
    select() {
      selectCount += 1

      return {
        from() {
          return {
            where() {
              return {
                all: async () => (selectCount === 1 ? [row] : []),
              }
            },
          }
        },
      }
    },
  }
}

test('prefers the target history shard over a prior-year shard', async () => {
  const lookup = await getMergedCurrentAddressVersionLookup(
    [
      { db: createLookupDb(addressRow('address-1', '2025-hash')), sortOrder: 0 },
      { db: createLookupDb(addressRow('address-1', '2026-hash')), sortOrder: 1 },
    ],
    ['address-1'],
    [],
    {
      buildAddressBaseHashInput: base => base,
      buildMatchKey: () => null,
      normaliseAddressI18nSnapshotRow: row => row,
    },
  )

  expect(lookup.byId.get('address-1')?.versionHash).toBe('2026-hash')
})
