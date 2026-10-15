import { expect, test } from 'bun:test'
import {
  addPlaceCoverage,
  buildPlaceCoverageStatsRows,
  createPlaceCoverageAccumulator,
  type PlaceCoverageInput,
} from './placeCoverageStats'

const empty: PlaceCoverageInput = {
  basicCategory: null,
  taxonomyPrimary: null,
  operatingStatus: null,
  websites: [],
  socials: [],
  emails: [],
  phones: [],
  addresses: [],
  identifiers: null,
  confidence: null,
  divisionLinked: false,
}

test('category partitions include missing values; district counts use resolved scalars once per place', () => {
  const accumulator = createPlaceCoverageAccumulator()
  addPlaceCoverage(accumulator, {
    ...empty,
    basicCategory: 'food_service',
    taxonomyPrimary: 'cafe',
    operatingStatus: 'open',
    districtId: 'district-a',
    areaId: 'area-a',
    websites: ['https://example.com', 'https://example.org'],
    phones: ['1234'],
    identifiers: { wikidata: { brandId: 'Q1' } },
    confidence: 0,
    addresses: ['1 Example Road'],
    address2dId: 'address-a',
    address3dId: 'unit-a',
    divisionLinked: true,
  })
  addPlaceCoverage(accumulator, {
    ...empty,
    basicCategory: 'food_service',
    districtId: 'district-a',
    websites: [' ', ''],
    phones: [{}],
  })
  addPlaceCoverage(accumulator, empty)
  const rows = buildPlaceCoverageStatsRows(accumulator)
  const value = (dimension: string, dimensionValue: string, measure = 'count') =>
    rows.find(
      row =>
        row.dimension === dimension &&
        row.dimensionValue === dimensionValue &&
        row.measure === measure,
    )?.value
  expect(value('basicCategory', 'food_service')).toBe(2)
  expect(value('basicCategory', 'unspecified')).toBe(1)
  expect(value('district', 'district-a')).toBe(2)
  expect(rows.filter(row => row.dimension === 'district')).toHaveLength(1)
  expect(value('placeField', 'district', 'missing_count')).toBe(1)
  expect(value('placeField', 'district', 'coverage')).toBe(66.67)
  // Several contacts and several websites still count the same place once.
  expect(value('placeField', 'website')).toBe(1)
  expect(value('placeField', 'anyContact')).toBe(1)
  expect(value('placeField', 'confidence')).toBe(1)
  expect(value('placeField', 'linkedAddress3d')).toBe(1)
  expect(value('placeField', 'brandIdentity')).toBe(1)
})

test('empty releases retain explicit zero coverage without inventing category or district rows', () => {
  const rows = buildPlaceCoverageStatsRows(createPlaceCoverageAccumulator())
  expect(rows.every(row => row.value === 0 && Number.isFinite(row.value))).toBe(true)
  expect(rows.some(row => row.category === 'records')).toBe(false)
})
