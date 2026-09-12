import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { loadHouseRetentionFixture } from './hkgovAlsHouseRetentionEvidence'
import { retainAlsHouses } from './hkgovAlsHouseRetentions'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'
const fixture = loadHouseRetentionFixture()

test('all returned house assertions bypass retention without mutation', () => {
  const source = fixture.retentions.flatMap(r => {
    const evidence = requireDefined(r.evidence2d.at(-1))
    return [
      {
        feature: structuredClone(evidence.feature),
        sourceFile: 'publisher.geojson',
        featureIndexOneBased: 1,
      },
    ]
  }) as HkgovAlsSourceFeature[]
  requireDefined(requireDefined(source[0]).feature.geometry).coordinates = [114.2, 22.4]
  const original = structuredClone(source)
  expect(retainAlsHouses(source, '2030-01-01.0').size).toBe(0)
  expect(source).toEqual(original)
})

test('all retained historical house assertions are preserved; only absent houses are added', () => {
  for (const version of fixture.retentions[0]!.sourceVersions) {
    const source = fixture.retentions.flatMap(r =>
      r.evidence2d
        .filter(e => e.sourceVersions.includes(version))
        .map(e => ({
          feature: structuredClone(e.feature),
          sourceFile: 'publisher.geojson',
          featureIndexOneBased: 1,
        })),
    ) as HkgovAlsSourceFeature[]
    const original = structuredClone(source)
    const provenance = retainAlsHouses(source, version)
    for (const record of original) expect(source).toContainEqual(record)
    for (const csu of provenance.keys()) {
      const rule = fixture.retentions.find(r => r.csus[0] === csu)!
      expect(
        original.some(s =>
          rule.csus.includes(
            s.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
              ?.CsuId ?? '',
          ),
        ),
      ).toBe(false)
    }
  }
})
