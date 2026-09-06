import { test, expect } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-premise-reconstructions.json'
import { reconstructAlsPremises } from './hkgovAlsPremiseReconstructions'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

const d = fixture.reconstructions[0]!
const plaza: HkgovAlsSourceFeature = {
  sourceFile: 'original.geojson',
  featureIndexOneBased: 1,
  feature: {
    properties: {
      Address: { PremisesAddress: { BuildingCsuInformation: { CsuId: d.plazaCsu } } },
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
    expect((provenance.get(d.newCsu) as any).originalAssertions).toEqual(before)
    expect((provenance.get(d.newCsu) as any).evidence.sourceVersion).toBe(
      '2026-07-22.0',
    )
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
