import { expect, test } from 'bun:test'
import { createDivisionMembership, type MembershipDivision } from './divisionMembership'

const square = (x: number, y: number, size: number) => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
]
const polygon = (id: string, x = 0, y = 0, size = 10) => ({
  divisionId: id,
  geometry: { type: 'Polygon', coordinates: [square(x, y, size)] },
})
const entry = (id: string, kind: string) => ({ id, class: kind, name: id })
const hk = entry('hk', 'country'),
  district = entry('d', 'district'),
  town = entry('t', 'town')
const division = (
  id: string,
  kind: string,
  parents = [hk, district],
  name = id,
  locale = 'en',
): MembershipDivision => ({
  id,
  class: kind,
  name,
  locale,
  hierarchies: { full: [[...parents, entry(id, kind)]] },
})
const base = [
  division('hk', 'country', []),
  division('d', 'district', [hk]),
  division('t', 'town'),
]

test('spatial membership fills levels 3–6, separate islands and administrative ancestors without an address', () => {
  const rows = [
    ...base,
    division('m', 'macrohood', [hk, district, town]),
    division('n', 'neighbourhood', [hk, district, town]),
    division('u', 'microhood', [hk, district, town]),
    division('island', 'major_island', [hk]),
  ]
  const lookup = createDivisionMembership(
    rows,
    ['t', 'm', 'n', 'u', 'island'].map(id => polygon(id)),
  )
  expect(lookup.resolve({ lng: 2, lat: 2 }).references).toEqual({
    countryId: 'hk',
    districtId: 'd',
    townId: 't',
    macrohoodId: 'm',
    neighbourhoodId: 'n',
    microhoodId: 'u',
    landformId: 'island',
  })
})

test('holes and disjoint multipolygon parts are respected; shared edges and overlapping peers remain ambiguous', () => {
  const rows = [...base, division('t2', 'town')]
  const area = {
    divisionId: 't',
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 10), square(2, 2, 2)], [square(20, 20, 2)]],
    },
  }
  const lookup = createDivisionMembership(rows, [area, polygon('t2', 10, 0, 10)])
  expect(lookup.resolve({ lng: 3, lat: 3 }).divisionIds).toEqual([])
  expect(lookup.resolve({ lng: 21, lat: 21 }).references.townId).toBe('t')
  expect(lookup.resolve({ lng: 10, lat: 5 }).references.townId).toBeNull()
  expect(lookup.resolve({ lng: NaN, lat: 5 }).divisionIds).toEqual([])
})

test('exact bilingual village and hamlet names require district and compatible ancestry', () => {
  const village = division('v', 'village', [hk, district, town], 'Example Village')
  const rows = [
    ...base,
    village,
    { ...village, locale: 'zh-hant', name: '示例村' },
    division(
      'h',
      'hamlet',
      [hk, district, town, entry('v', 'village')],
      'Example Hamlet',
    ),
    division('other', 'village', [hk, entry('d2', 'district')], 'Example Village'),
  ]
  const lookup = createDivisionMembership(rows, [polygon('t')])
  const result = lookup.resolve({
    lng: 1,
    lat: 1,
    names: [
      { locale: 'en', name: '  EXAMPLE   VILLAGE ' },
      { locale: 'zh-hant', name: '示例村' },
      { locale: 'en', name: 'Example Hamlet' },
    ],
  })
  expect(result.references).toMatchObject({
    villageId: 'v',
    hamletId: 'h',
    townId: 't',
    districtId: 'd',
  })
  expect(result.evidence).toContainEqual({ divisionId: 'v', method: 'text' })
  expect(
    lookup.resolve({ names: [{ locale: 'en', name: 'Example Village' }] }).divisionIds,
  ).toEqual([])
  expect(
    lookup.resolve({
      districtId: 'd',
      names: [{ locale: 'en', name: '12 Example Village Road' }],
    }).divisionIds,
  ).toEqual([])
})

test('duplicate names and conflicting languages do not select a village', () => {
  const a = division('a', 'village', [hk, district], 'A'),
    b = division('b', 'village', [hk, district], 'B')
  const lookup = createDivisionMembership(
    [
      ...base,
      a,
      b,
      { ...a, locale: 'zh-hant', name: '村' },
      { ...b, locale: 'zh-hant', name: '村' },
    ],
    [],
  )
  for (const names of [
    [
      { locale: 'en', name: 'A' },
      { locale: 'zh-hant', name: '村' },
    ],
    [
      { locale: 'en', name: 'A' },
      { locale: 'en', name: 'B' },
    ],
  ])
    expect(lookup.resolve({ districtId: 'd', names }).references.villageId).toBeNull()
})

test('Place geometry takes precedence over address links; missing village polygons retain compatible address membership', () => {
  const rows = [
    ...base,
    division('old', 'town'),
    division('v', 'village', [hk, district, town]),
    division('wrong', 'village', [hk, district, entry('old', 'town')]),
  ]
  const lookup = createDivisionMembership(rows, [polygon('t'), polygon('old', 20, 20)])
  const result = lookup.resolve({
    lng: 1,
    lat: 1,
    fallback: { townId: 'old', villageId: 'v', districtId: 'd' },
  })
  expect(result.references.townId).toBe('t')
  expect(result.references.villageId).toBe('v')
  expect(result.evidence).toContainEqual({ divisionId: 'v', method: 'address' })
  expect(
    lookup.resolve({ lng: 1, lat: 1, fallback: { villageId: 'wrong' } }).references
      .villageId,
  ).toBeUndefined()
  expect(
    lookup.resolve({ lng: 50, lat: 50, fallback: { townId: 't' } }).references.townId,
  ).toBeUndefined()
})

test('conflicting ancestor paths are not collapsed to the first district', () => {
  const rows = [
    ...base,
    division('d2', 'district', [hk]),
    {
      ...division('v', 'village'),
      hierarchies: {
        full: [
          [hk, district],
          [hk, entry('d2', 'district')],
        ],
      },
    },
  ]
  expect(
    createDivisionMembership(rows, [polygon('v')]).resolve({ lng: 1, lat: 1 })
      .references,
  ).toEqual({ villageId: 'v', countryId: 'hk' })
})

test('text and inherited ancestry cannot reintroduce a polygon that excludes the point', () => {
  const rows = [...base, division('v', 'village', [hk, district, town], 'Village')]
  const lookup = createDivisionMembership(rows, [polygon('t')])
  expect(
    lookup.resolve({
      lng: 30,
      lat: 30,
      districtId: 'd',
      names: [{ locale: 'en', name: 'Village' }],
    }).references.villageId,
  ).toBeUndefined()
  expect(
    lookup.resolve({ lng: 30, lat: 30, fallback: { villageId: 'v', districtId: 'd' } })
      .references.villageId,
  ).toBeUndefined()
})

test('missing coordinates do not turn available polygons into text exclusions', () => {
  const rows = [...base, division('v', 'village', [hk, district, town], 'Village')]
  const lookup = createDivisionMembership(rows, [polygon('t'), polygon('v')])
  expect(
    lookup.resolve({ districtId: 'd', names: [{ locale: 'en', name: 'Village' }] })
      .references,
  ).toMatchObject({ villageId: 'v', townId: 't' })
})

test('rural areas have independent geometry and ancestry membership alongside villages', () => {
  const rural = entry('r', 'rural_area')
  const lookup = createDivisionMembership(
    [
      ...base,
      division('r', 'rural_area', [hk, district, town]),
      division('v', 'village', [hk, district, town, rural]),
    ],
    [polygon('r'), polygon('v', 1, 1, 2)],
  )
  expect(lookup.resolve({ lng: 2, lat: 2 }).references).toMatchObject({
    ruralAreaId: 'r',
    villageId: 'v',
  })
  expect(lookup.resolve({ lng: 5, lat: 5 }).references).toMatchObject({
    ruralAreaId: 'r',
  })
  expect(lookup.resolve({ lng: 5, lat: 5 }).references.villageId).toBeUndefined()
})
