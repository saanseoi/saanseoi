import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { booleanPointInPolygon } from '@turf/turf'
import { governmentDistrictCandidates } from './government-review'

test('all official alternatives resolve 18 unique districts and preserve official airport coverage', async () => {
  const result = await governmentDistrictCandidates(resolve(import.meta.dir, '../..'))
  expect(result.features).toHaveLength(54)
  for (const variant of new Set(result.features.map(f => f.properties.variant))) {
    const rows = result.features.filter(f => f.properties.variant === variant)
    expect(new Set(rows.map(f => f.properties.divisionId)).size).toBe(18)
    expect(rows.every(f => f.properties.reviewOnly)).toBe(true)
  }
  const tuenMun = result.features.filter(
    f => f.properties.divisionId === 'a55585af-2cb4-41a5-93a9-2e22568c9839',
  )
  const includesAirport = (variant: string) =>
    booleanPointInPolygon(
      [113.92, 22.33],
      tuenMun.find(f => f.properties.variant === variant) as any,
    )
  expect(includesAirport('hkgov-had')).toBe(true)
  expect(includesAirport('hkgov-censtatd-2024')).toBe(true)
})
