import { expect, test } from 'bun:test'
import {
  missingOvertureHongKongCityRows,
  overtureHongKongCities,
} from './overtureHongKongCities'
import {
  missingOvertureHongKongAreaRows,
  overtureHongKongAreas,
  overtureHongKongAreaDivisionId,
} from './overtureHongKongAreas'
import { normaliseDivisionRow } from './division'

const message = {
  source: 'overture',
  regionCode: 'hk',
  resourceType: 'division',
} as const
const districts = overtureHongKongAreas.flatMap(area =>
  area.districtNames.map((name, i) => ({
    id: `${area.code}-${i}`,
    subtype: 'region',
    names: { common: { en: name } },
  })),
)

test('Kowloon city retains its UUID while its administrative area has its own identity', () => {
  const city = overtureHongKongCities[0]
  expect(city.id).toBe('17009785-57fd-4e5b-af86-2d27352e4718')
  expect(overtureHongKongAreaDivisionId('kowloon')).not.toBe(city.id)
  const source = {
    id: city.id,
    subtype: 'locality',
    class: 'city',
    names: { common: { en: 'Kowloon', 'zh-hant': '九龍' } },
  }
  expect(normaliseDivisionRow(source).base).toMatchObject({
    id: city.id,
    category: 'locality',
    class: 'city',
    level: 1,
  })
  expect(
    missingOvertureHongKongCityRows(message, [...districts, source]).map(row => row.id),
  ).not.toContain(city.id)
  expect(
    missingOvertureHongKongAreaRows(message, [...districts, source]).map(row => row.id),
  ).toContain(overtureHongKongAreaDivisionId('kowloon'))
})

test('reconstructs two cities with independent district paths and the specified membership', () => {
  const rows = missingOvertureHongKongCityRows(message, districts)
  expect(rows).toHaveLength(2)
  const hongKong = rows.find(row => row.id === overtureHongKongCities[1].id)!
  const result = normaliseDivisionRow(hongKong)
  expect(result.base).toMatchObject({ category: 'locality', class: 'city', level: 1 })
  expect(result.base.hierarchies.administrative.map(path => path.at(-1)?.id)).toEqual([
    'hong-kong-island-0',
    'hong-kong-island-1',
    'hong-kong-island-2',
  ])
  expect(JSON.stringify(result.base.hierarchies)).not.toContain('hong-kong-island-3')
  expect(overtureHongKongAreas[0].districtNames).toContain('Southern District')
  expect(overtureHongKongCities[0].districtNames).toEqual(
    overtureHongKongAreas[1].districtNames,
  )
})

test('keeps an existing Hong Kong city UUID and rejects ambiguous or incomplete evidence', () => {
  const city = {
    id: 'source-hong-kong',
    subtype: 'locality',
    class: 'city',
    names: { primary: 'Hong Kong' },
  }
  expect(missingOvertureHongKongCityRows(message, [...districts, city])).toHaveLength(1)
  expect(() =>
    missingOvertureHongKongCityRows(message, [
      ...districts,
      city,
      { ...city, id: 'duplicate' },
    ]),
  ).toThrow('Ambiguous')
  expect(() => missingOvertureHongKongCityRows(message, [])).toThrow(
    'expected one district',
  )
})
