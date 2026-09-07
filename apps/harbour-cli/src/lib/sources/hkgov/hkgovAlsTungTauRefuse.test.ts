import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-house-retentions.json'
import { retainAlsHouses } from './hkgovAlsHouseRetentions'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

test('Tung Tau refuse point is retained across reviewed releases and until revoked with raw evidence', () => {
  const rule = fixture.retentions.find(
    r => r.id === 'tung-tau-ii-refuse-collection-point',
  )!
  expect(rule).toBeDefined()
  for (const version of [...rule.sourceVersions, '2030-01-01.0']) {
    const evidence = rule.evidence2d.filter(e => e.sourceVersions.includes(version))
    const marker = structuredClone(rule.evidence2d[0]!.feature)
    marker.properties.Address.PremisesAddress.BuildingCsuInformation.CsuId = 'unrelated'
    marker.properties.Address.PremisesAddress.EngPremisesAddress.BuildingName =
      'UNRELATED'
    const source = [marker, ...evidence.map(e => structuredClone(e.feature))].map(
      feature => ({ feature, sourceFile: 'test', featureIndexOneBased: 1 }),
    ) as unknown as HkgovAlsSourceFeature[]
    const provenance = retainAlsHouses(source, version)
    expect(source).toHaveLength(2)
    const retained = source[1]!.feature.properties!.Address!.PremisesAddress!
    expect(retained.EngPremisesAddress?.BuildingName).toBe(
      'TUNG TAU (II) ESTATE REFUSE COLLECTION POINT',
    )
    expect(retained.ChiPremisesAddress?.BuildingName).toBe('東頭（二）邨垃圾站')
    expect(retained.EngPremisesAddress?.EngStreet?.BuildingNoFrom).toBe('183')
    expect(provenance.has(rule.csus[0]!)).toBe(true)
  }
  const changed = structuredClone(rule.evidence2d[0]!.feature)
  changed.geometry.coordinates = [114, 22]
  expect(() =>
    retainAlsHouses(
      [
        { feature: changed, sourceFile: 'test', featureIndexOneBased: 1 },
      ] as unknown as HkgovAlsSourceFeature[],
      rule.sourceVersions[0]!,
    ),
  ).toThrow('publisher assertions changed')
})
