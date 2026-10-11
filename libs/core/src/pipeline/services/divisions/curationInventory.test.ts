import { expect, test } from 'bun:test'
import {
  buildCurationInventory,
  curatedPrimaryNames,
  sourceDivisionNames,
  divisionCuration,
} from './curationInventory'
const context = { cohort: '2026-08-19.0', releaseSet: 'test' }
test('source identities are generated with class-derived taxonomy and authored additions retain stable identity', () => {
  const source = {
    id: 'source-test',
    subtype: 'locality',
    class: 'village',
    names: { common: { en: 'Source Village', zh: '村' } },
    geometry: { type: 'Point', coordinates: [114, 22] },
    hierarchies: [],
  }
  const before = structuredClone(source)
  const inventory = buildCurationInventory([source], context, false)
  expect(inventory.divisions.find(row => row.id === source.id)).toMatchObject({
    class: 'village',
    category: 'locality',
    level: 5,
    names: { en: 'Source Village', 'zh-hant': '村' },
    point: [114, 22],
  })
  expect(source).toEqual(before)
  for (const addition of divisionCuration.additions.entries)
    expect(inventory.divisions.filter(row => row.id === addition.id)).toHaveLength(1)
  expect(() => buildCurationInventory([source, source], context, false)).toThrow(
    'Duplicate',
  )
})
test('curated point modifications apply only to generated review inputs', () => {
  const source = {
    id: 'point',
    subtype: 'microhood',
    names: { common: { en: 'Point' } },
    geometry: { type: 'Point', coordinates: [114, 22] },
    hierarchies: [],
  }
  expect(
    buildCurationInventory([source], context, false, [
      { divisionId: 'point', point: [114.1, 22.1] },
    ]).divisions.find(row => row.id === 'point')?.point,
  ).toEqual([114.1, 22.1])
  expect(source.geometry.coordinates).toEqual([114, 22])
})
test('localisation parsing excludes structural source fields and supports explicit locale removal', () => {
  expect(
    sourceDivisionNames({
      id: 'source',
      names: {
        common: { en: 'Village', suffix: 'Village', 'en-t-zh': 'Translated', zh: '村' },
      },
    }),
  ).toEqual({ en: 'Village', 'zh-hant': '村' })
  expect(
    curatedPrimaryNames('13363714-2649-4066-935d-c24757ff2a86', {
      en: 'Po Toi Islands',
      vi: 'Publisher translation',
    }),
  ).not.toHaveProperty('vi')
})
test('all editorial definitions explain their purpose and contain unique entry identities', () => {
  for (const fixture of Object.values(divisionCuration)) {
    expect(fixture.purpose.length).toBeGreaterThan(20)
    if ('entries' in fixture) {
      const ids = fixture.entries.map((row: any) => row.id ?? row.divisionId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  }
})

test('missing points derive from authored polygons while reviewed core points take precedence', () => {
  const id = 'ss-5afb2d5b-a7ad-58ad-9ba6-ca818f4dcc9f'
  const area = {
    type: 'Feature',
    properties: { divisionId: id, variant: 'saanseoi' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 1],
          [1, 1],
          [1, 4],
          [0, 4],
          [0, 0],
        ],
      ],
    },
  } as any
  const build = (features: any[], points: any[] = []) =>
    buildCurationInventory([], context, false, points, features).divisions.find(
      row => row.id === id,
    )!
  const derived = build([area]).point!
  expect(derived[0]! <= 1 || derived[1]! <= 1).toBe(true)
  expect(derived.every(Number.isFinite)).toBe(true)
  expect(build([area], [{ divisionId: id, point: [0.3, 0.3] }]).point).toEqual([
    0.3, 0.3,
  ])
  area.properties.corePoint = [0.5, 0.5]
  expect(build([area], [{ divisionId: id, point: [0.3, 0.3] }]).point).toEqual([
    0.5, 0.5,
  ])
  expect(build([]).point).toBeNull()
})

test('Four Little Dragons enters through the source inventory and retains its curation', () => {
  const id = '15062812-a4d2-4d4a-b589-2f50bc31943f'
  expect(
    buildCurationInventory([], context, false).divisions.some(row => row.id === id),
  ).toBe(false)
  const source = {
    id,
    subtype: 'neighborhood',
    names: { primary: '四小龍' },
    geometry: { type: 'Point', coordinates: [114.150384, 22.334585] },
    hierarchies: [],
  }
  const inventory = buildCurationInventory(
    [source],
    { ...context, cohort: '2026-09-23.0' },
    false,
  )
  expect(inventory.divisions.filter(row => row.id === id)).toHaveLength(1)
  expect(inventory.divisions.find(row => row.id === id)).toMatchObject({
    class: 'microhood',
    category: 'hood',
    level: 6,
    names: { en: 'West Kowloon Four Little Dragons', 'zh-hant': '四小龍' },
  })
})
