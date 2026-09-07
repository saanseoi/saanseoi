import { test, expect } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-premise-consolidations.json'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { applyAlsPremiseConsolidations } from './hkgovAlsPremiseConsolidations'

function rowsFor(release: (typeof fixture.decisions)[number]['releases'][number]) {
  return release.expected.map((e, index) =>
    normaliseHkgovAlsFeature(
      {
        geometry: {
          type: e.geometry.type,
          coordinates: [e.geometry.coordinates[0]!, e.geometry.coordinates[1]!],
        },
        properties: {
          Address: {
            PremisesAddress: {
              BuildingCsuInformation: { CsuId: e.csu },
              GeoAddress: e.geoAddress,
              EngPremisesAddress: e.en,
              ChiPremisesAddress: e.zh,
            },
          },
        },
      },
      'test.geojson',
      index + 1,
      'test',
      release.version,
      {
        areaByEn: new Map(),
        areaByZh: new Map(),
        ambiguousAreaEn: new Set(),
        ambiguousAreaZh: new Set(),
        countryId: null,
        districtByEn: new Map(),
        districtByZh: new Map(),
        ambiguousDistrictEn: new Set(),
        ambiguousDistrictZh: new Set(),
        snapshotId: 'test',
      },
      true,
      new Map(),
      new Map(),
      new Map(),
    ),
  )
}
test('all thirty reviewed releases retain one named centre, stable identity and original assertions', () => {
  let id: string | undefined
  let removed = 0,
    renamed = 0
  for (const release of fixture.decisions[0]!.releases) {
    const rows = rowsFor(release),
      before = structuredClone(rows)
    applyAlsPremiseConsolidations(rows, release.version)
    expect(rows).toHaveLength(1)
    const owner = rows[0]!
    id ??= owner.id
    expect(owner.id).toBe(id)
    expect(owner.id).toMatch(/^ss-[0-9a-f-]{36}$/)
    expect(owner.canonicalId).toBe(owner.id)
    expect(owner.identityBuildingId).toBe(owner.id)
    expect(owner.zhHantBuildingName).toBe('彩盈坊')
    expect(owner.enBuildingName).toBe('CHOI YING PLACE')
    expect(owner.zhHantFormattedAddress).toContain('彩盈坊')
    const evidence = JSON.parse(owner.sources).hkgovAlsPremiseConsolidation
      .sourceEvidence
    expect(evidence).toHaveLength(before.length)
    expect(
      evidence.map((e: { chiPremisesAddress: unknown }) => e.chiPremisesAddress),
    ).toEqual(before.map(r => JSON.parse(r.chiPremisesAddressJson!)))
    removed += before.length - rows.length
    renamed += Number(before.some(r => r.zhHantBuildingName === '彩盈商場'))
  }
  expect(removed).toBe(28)
  expect(renamed).toBe(10)
})
test('rejects altered or incomplete assertions and leaves out-of-bounds sources alone', () => {
  const release = fixture.decisions[0]!.releases[0]!
  const rows = rowsFor(release),
    before = JSON.stringify(rows)
  applyAlsPremiseConsolidations(rows, '2024-07-24.0')
  expect(JSON.stringify(rows)).toBe(before)
  expect(() => applyAlsPremiseConsolidations(rows.slice(1), release.version)).toThrow(
    'source changed',
  )
  rows[0]!.engPremisesAddressJson = '{}'
  expect(() => applyAlsPremiseConsolidations(rows, release.version)).toThrow(
    'source changed',
  )
})
