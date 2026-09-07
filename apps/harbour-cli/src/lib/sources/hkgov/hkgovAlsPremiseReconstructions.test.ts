import { test, expect } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-premise-reconstructions.json'
import { reconstructAlsPremises } from './hkgovAlsPremiseReconstructions'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

const d = fixture.reconstructions.find(
  d => d.id === 'choi-yuen-food-court-corrected-location',
)!
const plaza: HkgovAlsSourceFeature = {
  sourceFile: 'original.geojson',
  featureIndexOneBased: 1,
  feature: {
    properties: {
      Address: {
        PremisesAddress: { BuildingCsuInformation: { CsuId: d.scopePremiseCsu } },
      },
    },
  },
}
function originals(release: (typeof d.releases)[number]): HkgovAlsSourceFeature[] {
  return release.expected.map((f, i) => ({
    sourceFile: 'original.geojson',
    featureIndexOneBased: i + 2,
    feature: {
      ...structuredClone(f),
      geometry: {
        ...f.geometry,
        coordinates: [f.geometry.coordinates[0]!, f.geometry.coordinates[1]!],
      },
    },
  }))
}
test('backfills all twenty-eight earlier releases and retains original assertions', () => {
  let replacements = 0,
    gaps = 0
  for (const release of d.releases) {
    const old = originals(release),
      before = structuredClone(old)
    const blank: HkgovAlsSourceFeature = {
      sourceFile: 'original.geojson',
      featureIndexOneBased: 9,
      feature: {
        properties: {
          Address: { PremisesAddress: { BuildingCsuInformation: { CsuId: d.newCsu } } },
        },
      },
    }
    const features = [plaza, ...old, blank]
    const provenance = reconstructAlsPremises(features, release.version)
    expect(features).toHaveLength(3)
    expect(features).toContain(blank)
    expect(JSON.stringify(features.at(-1)!.feature)).toBe(
      JSON.stringify(d.evidence.feature),
    )
    expect(old).toEqual(before)
    const record = provenance.get(d.newCsu)
    expect(record?.originalAssertions).toEqual(before)
    expect(record?.evidence.sourceVersion).toBe('2026-07-22.0')
    old.length ? replacements++ : gaps++
  }
  expect(replacements).toBe(26)
  expect(gaps).toBe(2)
})
test('rejects altered or missing original records and leaves evidence-era sources alone', () => {
  const release = d.releases[0]!,
    features = [plaza, ...originals(release)]
  const before = structuredClone(features)
  reconstructAlsPremises(features, '2026-07-22.0')
  expect(features).toEqual(before)
  expect(() => reconstructAlsPremises([plaza], release.version)).toThrow(
    'publisher source changed',
  )
  features[1]!.feature.properties!.Address!.PremisesAddress!
    .EngPremisesAddress!.BuildingName = 'CHANGED'
  expect(() => reconstructAlsPremises(features, release.version)).toThrow(
    'publisher source changed',
  )
})

test('restores the separate car park only in the seven reviewed omissions', () => {
  const carPark = fixture.reconstructions.find(
    d => d.id === 'chun-shek-car-park-publisher-omission',
  )!
  const anchor: HkgovAlsSourceFeature = {
    sourceFile: 'original.geojson',
    featureIndexOneBased: 1,
    feature: {
      properties: {
        Address: {
          PremisesAddress: {
            BuildingCsuInformation: { CsuId: carPark.scopePremiseCsu },
          },
        },
      },
    },
  }
  expect(carPark.releases).toHaveLength(7)
  for (const release of carPark.releases) {
    const features = [anchor]
    const result = reconstructAlsPremises(features, release.version)
    expect(features).toHaveLength(2)
    expect(features[0]).toBe(anchor)
    expect(JSON.stringify(features[1]!.feature)).toBe(
      JSON.stringify(carPark.evidence.feature),
    )
    const record = result.get(carPark.newCsu)
    expect(record?.originalAssertions).toEqual([])
    expect(record?.evidence.sourceVersion).toBe('2026-02-04.0')
    expect(() => reconstructAlsPremises(features, release.version)).toThrow(
      'publisher source changed',
    )
  }
  const features = [anchor]
  reconstructAlsPremises(features, '2026-02-04.0')
  expect(features).toHaveLength(1)
  expect(reconstructAlsPremises([], '2026-04-03.0').size).toBe(0)
})
