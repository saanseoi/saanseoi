import { expect, test } from 'bun:test'
import { resolveGeocode as geocode, type GeocodingDependencies } from './geocoding'
import { GeocodingQuerySchema } from '../schema/geocoding'
import type { GeocodingDatabases, GeocodingRelease } from './geocodingData'
import type { AddressRecord } from '../db/addresses'
import { area, division } from './geocoding.fixtures'
import { collectAddressCandidates } from './addressGeocoding'

const databases = {} as GeocodingDatabases
const release = (code: string): GeocodingRelease => ({
  code,
  id: code,
  cohortKey: '2026-08-19.0',
  domainCode: 'geographic',
  schemaVersion: '1',
  rulesetVersion: '1',
  snapshots: [
    {
      snapshotId: `${code}-division`,
      snapshotResourceType: 'division',
      role: 'primary',
      variant: 'overture',
    },
  ],
})
const address = (
  id: string,
  name: string,
  coordinates: [number, number],
): AddressRecord => ({
  address: {
    id,
    snapshotId: 'address',
    divisionSnapshotId: 'division',
    geometry: { type: 'Point', coordinates },
    bbox: null,
    identifiers: null,
    sources: null,
    parentAddressId: null,
    granularity: 'building',
    divisionRelationships: [],
    countryId: null,
    landformId: null,
    areaId: null,
    districtId: null,
    townId: null,
    macrohoodId: null,
    neighbourhoodId: null,
    microhoodId: null,
    villageId: null,
    hamletId: null,
    createdAt: '',
    updatedAt: '',
  },
  i18n: { en: { formattedAddress: name, buildingName: name } },
})
function fixture(overrides: Partial<GeocodingDependencies> = {}) {
  const calls: unknown[][] = []
  const dependencies: GeocodingDependencies = {
    resolveGeocodingRelease: async (_, family, code, ids) => {
      calls.push([family, code, ids])
      return release(code ?? 'latest')
    },
    loadGeocodingDivisions: async () => ({
      records: [division('a')],
      areas: [area('a')],
    }),
    loadGeocodingAddresses: async () => ({
      records: [address('a', 'Harbour', [1, 1]), address('b', 'Harbour', [1, 1.001])],
      total: 2,
    }),
    ...overrides,
  }
  const run = (family: 'address' | 'division', input: Record<string, string>) =>
    geocode({
      ...databases,
      family,
      query: GeocodingQuerySchema.parse(input),
      dependencies,
    })
  return { run, calls }
}
test('one release resolution per family and exact companion snapshot pin', async () => {
  const f = fixture()
  const result = await f.run('address', {
    lat: '1',
    lng: '1',
    apiReleaseSet: 'older',
    include: 'divisions',
  })
  expect(f.calls).toEqual([
    ['address', 'older', undefined],
    ['division', undefined, ['older-division']],
  ])
  expect(result.status).toBe(200)
  expect(result.body).toMatchObject({
    meta: {
      release: { apiReleaseSet: 'older' },
      divisionRelease: { apiReleaseSet: 'latest' },
    },
    data: [
      { id: 'a', match: { type: 'exact_location', distanceMetres: 0 } },
      { id: 'b', match: { type: 'nearest' } },
    ],
  })
})
test('ambiguous forward address names remain ambiguous when limit hides an alternative', async () => {
  const result = await fixture().run('address', { address: 'Harbour', limit: '1' })
  expect(result.body).toMatchObject({
    meta: { resolution: 'ambiguous', total: 2, truncated: true },
    data: [{ id: 'a', match: { type: 'exact_text', score: 1 } }],
  })
})
test('ambiguous division placenames preserve each identity and rank exact before partial', async () => {
  const first = division('a')
  const second = division('b', 'landform')
  const third = division('c')
  first.i18n.en!.name = second.i18n.en!.name = 'Island'
  third.i18n.en!.name = 'Island village'
  const result = await fixture({
    loadGeocodingDivisions: async () => ({
      records: [third, second, first],
      areas: [],
    }),
  }).run('division', { placename: 'Island' })
  expect(result.body).toMatchObject({
    meta: { resolution: 'ambiguous', total: 3 },
    data: [
      { id: 'a', score: 1 },
      { id: 'b', score: 1 },
      { id: 'c', score: 0.8 },
    ],
  })
})
test('no compatible companion fails explicitly instead of joining unrelated releases', async () => {
  const result = await fixture({
    resolveGeocodingRelease: async (_, family) =>
      family === 'address' ? release('old') : null,
  }).run('address', { address: 'Harbour', include: 'divisions' })
  expect(result).toMatchObject({
    status: 503,
    body: { error: 'compatible_release_unavailable', apiReleaseSet: 'old' },
  })
})
test('reverse results enforce distance radius and forward division output composes addresses', async () => {
  expect(
    (await fixture().run('address', { lat: '2', lng: '2', maxDistance: '1' })).body,
  ).toMatchObject({ data: [], meta: { resolution: 'not_found' } })
  expect((await fixture().run('division', { address: 'Harbour' })).body).toMatchObject({
    data: [
      { type: 'divisions', addressId: 'a', divisions: { path: ['a'] } },
      { type: 'divisions', addressId: 'b' },
    ],
  })
})

test('paged ranking counts all candidates and can rank a late page first', async () => {
  async function* pages() {
    for (let page = 0; page < 6; page++)
      yield Array.from({ length: 100 }, (_, offset) =>
        address(
          String(page * 100 + offset).padStart(3, '0'),
          page === 5 && offset === 99 ? 'Harbour' : 'Harbour Road',
          [1, 1],
        ),
      )
  }
  const result = await collectAddressCandidates(
    pages(),
    GeocodingQuerySchema.parse({ address: 'Harbour', limit: '1' }),
  )
  expect(result.total).toBe(600)
  expect(result.records.map(record => record.address.id)).toEqual(['599', '000'])
})
