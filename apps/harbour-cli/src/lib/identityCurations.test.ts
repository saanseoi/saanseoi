import { expect, test } from 'bun:test'
import { readIdentityCurations, resolveIdentityCuration } from './identityCurations'
import {
  resolveHkgovCenstatdDistrictBridge,
  resolveHkgovCenstatdNewTownBridge,
} from './statisticsSql/censtatdDistrictBridge'

test('reviewed identity curations retain all 85 mappings without a database', async () => {
  const fixtures = readIdentityCurations()
  expect(fixtures).toHaveLength(5)
  expect(fixtures.reduce((total, fixture) => total + fixture.mappings.length, 0)).toBe(
    85,
  )
  for (const year of ['2016', '2021'] as const) {
    expect((await resolveHkgovCenstatdDistrictBridge(year)).size).toBe(18)
  }
  expect((await resolveHkgovCenstatdNewTownBridge('2021')).size).toBe(13)
  expect(() =>
    resolveIdentityCuration('hkgov-censtatd', '2099', 'administrative'),
  ).toThrow('Expected one reviewed identity curation')
})
