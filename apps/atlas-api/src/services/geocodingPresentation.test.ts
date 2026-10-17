import { expect, test } from 'bun:test'
import { presentGeocoding } from './geocodingPresentation'
import { createDivisionResolver } from './divisionGeocoding'
import { division, area, entry } from './geocoding.fixtures'
import { GeocodingQuerySchema, GeocodingResponseSchema } from '../schema/geocoding'
const root = division('hk')
root.division.level = 0
root.division.class = 'sar'
const district = division('district', 'administrative', { full: [[entry('hk')]] })
const city = division('city', 'locality', { full: [[entry('hk')]] })
city.division.level = 1
city.division.class = 'city'
const hood = division('hood', 'hood', {
  full: [[entry('hk'), entry('district'), entry('city')]],
})
hood.division.level = 5
hood.division.class = 'neighbourhood'
const resolution = createDivisionResolver(
  [hood, city, district, root],
  [area('hood'), area('city'), area('district'), area('hk')],
).resolve([2, 2], true)
const body = {
  data: resolution,
  meta: {
    direction: 'reverse',
    coordinates: [2, 2],
    release: { apiReleaseSet: 'release', snapshots: [{ snapshotId: 'snap' }] },
    divisionRelease: { apiReleaseSet: 'release' },
  },
}
test('JSON:API relationships keep category branches ordered and names concise', () => {
  const output = presentGeocoding(
    body,
    GeocodingQuerySchema.parse({ lat: '2', lng: '2' }),
  )
  expect(GeocodingResponseSchema.safeParse(output).success).toBe(true)
  expect(output.data[0]!.attributes.status).toBe('resolved')
  expect(output.data[0]!.relationships!.administrative!.data.map(r => r.id)).toEqual([
    'hk',
    'district',
  ])
  expect(output.data[0]!.relationships!.locality!.data.map(r => r.id)).toEqual(['city'])
  expect(output.data[0]!.relationships!.hood!.data.map(r => r.id)).toEqual(['hood'])
  expect(output.meta.divisionRelease).toBeUndefined()
  expect(output.included[0]!.attributes.i18n).toEqual({
    en: {
      name: 'hk',
      meta: null,
    },
  })
  expect(output.data[0]!.meta).toBeUndefined()
})
test('compact, default, map and full preserve identities while controlling detail', () => {
  const outputs = ['compact', 'default', 'map', 'full'].map(profile =>
    presentGeocoding(body, GeocodingQuerySchema.parse({ lat: '2', lng: '2', profile })),
  )
  for (const output of outputs)
    expect(output.data[0]!.relationships).toEqual(outputs[0]!.data[0]!.relationships)
  expect(outputs[0]!.data[0]!.attributes.match).toBeUndefined()
  expect(outputs[1]!.included[0]!.attributes.geometry).toBeUndefined()
  expect(outputs[2]!.included[0]!.attributes.geometry).toBeDefined()
  expect(outputs[3]!.data[0]!.meta?.datasetCoverage).toEqual({ covered: 4, total: 4 })
})
test('repeated candidates retain independent relationships with deduplicated included resources', () => {
  const result = presentGeocoding(
    {
      ...body,
      data: [
        { id: 'one', divisions: resolution },
        { id: 'two', divisions: resolution },
      ],
    },
    GeocodingQuerySchema.parse({ placename: 'hood' }),
  )
  expect(result.data[0]!.relationships).toEqual(result.data[1]!.relationships)
  expect(result.included).toHaveLength(4)
})
test('alternative branches keep district and neighbourhood choices correlated', () => {
  const alternative = {
    ...resolution,
    status: 'ambiguous',
    alternatives: [
      ['hk', 'district', 'hood'],
      ['hk', 'district-b', 'hood-b'],
    ],
    memberships: [
      ...resolution.memberships,
      { ...resolution.memberships.find(m => m.id === 'district')!, id: 'district-b' },
      { ...resolution.memberships.find(m => m.id === 'hood')!, id: 'hood-b' },
    ],
  }
  const result = presentGeocoding(
    { ...body, data: alternative },
    GeocodingQuerySchema.parse({ lat: '2', lng: '2' }),
  )
  expect(result.data[0]!.meta?.alternatives).toEqual([
    {
      administrative: [
        { type: 'divisions', id: 'hk' },
        { type: 'divisions', id: 'district' },
      ],
      locality: [],
      hood: [{ type: 'divisions', id: 'hood' }],
      landform: [],
    },
    {
      administrative: [
        { type: 'divisions', id: 'hk' },
        { type: 'divisions', id: 'district-b' },
      ],
      locality: [],
      hood: [{ type: 'divisions', id: 'hood-b' }],
      landform: [],
    },
  ])
})

test('division match types describe reverse and forward geocoding', () => {
  const reverse = presentGeocoding(
    body,
    GeocodingQuerySchema.parse({ lat: '2', lng: '2' }),
  )
  expect(reverse.data[0]!.attributes.match).toEqual({ type: 'reverse-geocoding' })
  const forward = presentGeocoding(
    { ...body, data: [{ id: 'hood', score: 1, divisions: resolution }] },
    GeocodingQuerySchema.parse({ placename: 'hood' }),
  )
  expect(forward.data[0]!.attributes.match).toEqual({
    type: 'forward-geocoding',
    score: 1,
  })
  expect(GeocodingResponseSchema.safeParse(forward).success).toBe(true)
})
