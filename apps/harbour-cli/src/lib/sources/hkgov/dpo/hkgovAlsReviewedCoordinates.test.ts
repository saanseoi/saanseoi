import { requireDefined } from '@repo/core/requireDefined'
import { test, expect } from 'bun:test'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-coordinate-backfills.json'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { backfillAlsCoordinates } from './hkgovAlsCoordinateBackfills'
const maps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  ambiguousAreaEn: new Set<string>(),
  ambiguousAreaZh: new Set<string>(),
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousDistrictEn: new Set<string>(),
  ambiguousDistrictZh: new Set<string>(),
  countryId: null,
  snapshotId: 'test',
}
const rules = fixture.backfills.filter(
  d =>
    'expectedPremises' in d && d.expectedPremises && /^(hing-wai|fook-wo)-/.test(d.id),
)
function rowFor(d: (typeof rules)[number]) {
  return normaliseHkgovAlsFeature(
    {
      geometry: {
        type: 'Point',
        coordinates: d.previousCoordinates as [number, number],
      },
      properties: { Address: { PremisesAddress: requireDefined(d.expectedPremises) } },
    },
    'source',
    1,
    'test',
    d.sourceVersionFrom,
    maps,
    true,
    new Map(),
    new Map(),
    new Map(),
  )
}
test('all thirty releases keep reviewed Hing Wai and Fook Wo points with raw assertions and Block 11', () => {
  expect(rules).toHaveLength(60)
  for (const d of rules) {
    const row = rowFor(d),
      raw = row.engPremisesAddressJson,
      original = JSON.parse(requireDefined(row.geometry))
    backfillAlsCoordinates([row], d.sourceVersionFrom, true)
    expect(JSON.parse(requireDefined(row.geometry)).coordinates).toEqual(
      d.currentCoordinates,
    )
    expect(row.engPremisesAddressJson).toBe(raw)
    expect(
      JSON.parse(row.sources).hkgovAlsCoordinateBackfill.publisherGeometry,
    ).toEqual(original)
    if ('blockNumber' in d && d.blockNumber) {
      expect(d.currentCoordinates).toEqual([114.16085, 22.45234])
      expect(row.enBlockNumber).toBe('11')
      expect(row.zhHantBlockNumber).toBe('11')
      expect(row.identitySummary.blockNumber).toBe('11')
      expect(row.enFormattedAddress).toContain('BLOCK 11')
      expect(row.zhHantFormattedAddress).toContain('第11座')
    }
  }
})
test('Sun Yee uses the exact earlier review-map point throughout all thirty releases', () => {
  const sun = fixture.backfills.filter(d =>
    d.id.startsWith('sun-yee-reviewed-earlier-point-'),
  )
  expect(sun).toHaveLength(30)
  for (const d of sun) {
    const row = rowFor(d)
    const raw = row.engPremisesAddressJson
    backfillAlsCoordinates([row], d.sourceVersionFrom, true)
    expect(JSON.parse(requireDefined(row.geometry)).coordinates).toEqual([
      114.18144, 22.36961,
    ])
    expect(row.engPremisesAddressJson).toBe(raw)
  }
})
test('changed bilingual identity or conflicting block cannot inherit the reviewed point', () => {
  const d = requireDefined(rules.find(d => 'blockNumber' in d && d.blockNumber))
  for (const mutate of [
    (r: ReturnType<typeof rowFor>) => {
      r.engPremisesAddressJson = '{}'
    },
    (r: ReturnType<typeof rowFor>) => {
      r.enBlockNumber = '12'
    },
  ]) {
    const row = rowFor(d)
    mutate(row)
    backfillAlsCoordinates([row], d.sourceVersionFrom, true)
    expect(JSON.parse(row.sources).hkgovAlsCoordinateBackfill).toBeUndefined()
  }
})
