import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-commercial-retentions.json'
import {
  retainAlsCommercialPremises,
  labelAlsCommercialRetentions,
} from './hkgovAlsCommercialRetentions'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'
const normalise = (s: HkgovAlsSourceFeature, v: string) =>
  normaliseHkgovAlsFeature(
    s.feature,
    s.sourceFile,
    s.featureIndexOneBased,
    'test',
    v,
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
  )
const latest = () => [
  {
    feature: structuredClone(
      requireDefined(requireDefined(fixture.retentions[0]).evidence.at(-1)).feature,
    ) as unknown as HkgovAlsSourceFeature['feature'],
    sourceFile: 'als_addresses_(kwai_tsing_district).geojson',
    featureIndexOneBased: 1,
  },
]
test('future retention restores centre2, keeps separate names and points, and preserves raw evidence', () => {
  const source = latest(),
    raw = structuredClone(source),
    version = '2030-01-01.0'
  const provenance = retainAlsCommercialPremises(source, version)
  const rows = source.map(s => normalise(s, version))
  labelAlsCommercialRetentions(rows, provenance)
  expect(rows.map(r => r.enBuildingName)).toEqual([
    'TAI WO HAU SHOPPING CENTRE',
    'TAI WO HAU SHOPPING CENTRE (2)',
  ])
  expect(rows.map(r => r.hkgovCsuId)).toEqual([
    '3079225467T20050430',
    '3071925270P20050725',
  ])
  expect(new Set(rows.map(r => r.id)).size).toBe(2)
  expect(new Set(rows.map(r => r.geometry)).size).toBe(2)
  expect(source[0]).toEqual(raw[0])
  expect(
    JSON.parse(requireDefined(rows[0]).sources).hkgovAlsCommercialRetention,
  ).toBeUndefined()
  const second = JSON.parse(requireDefined(rows[1]).sources).hkgovAlsCommercialRetention
  expect(
    second.evidenceAssertion.properties.Address.PremisesAddress.EngPremisesAddress
      .BuildingName,
  ).toBe('TAI WO HAU SHOPPING CENTRE 2')
  expect(second.curation.verificationStatus).toBe('unverified')
  expect(second.originalAssertions).toEqual([])
})
test('changed returning premises bypass the retention unchanged', () => {
  const source = latest()
  requireDefined(requireDefined(source[0]).feature.geometry).coordinates = [0, 0]
  const original = structuredClone(source[0])
  const provenance = retainAlsCommercialPremises(source, '2030-01-01.0')
  expect(source[0]).toEqual(original)
  expect(provenance.has('3079225467T20050430')).toBe(false)
})
test('revocation stops future retention without changing publisher assertions', () => {
  const states = fixture.retentions.map(r => r.application.state)
  try {
    for (const rule of fixture.retentions) rule.application.state = 'revoked'
    const source = latest(),
      original = structuredClone(source)
    expect(retainAlsCommercialPremises(source, '2030-01-01.0').size).toBe(0)
    expect(source).toEqual(original)
  } finally {
    fixture.retentions.forEach((r, i) => {
      r.application.state = requireDefined(states[i])
    })
  }
})

test('all retained commercial assertions pass through unchanged', () => {
  for (const version of fixture.retentions[0]!.sourceVersions) {
    const source = fixture.retentions.flatMap(r =>
      r.evidence
        .filter(e => e.sourceVersions.includes(version))
        .map(e => ({
          feature: structuredClone(e.feature),
          sourceFile: 'publisher.geojson',
          featureIndexOneBased: 1,
        })),
    ) as unknown as HkgovAlsSourceFeature[]
    const original = structuredClone(source)
    retainAlsCommercialPremises(source, version)
    for (const record of original) expect(source).toContainEqual(record)
    for (const record of source.filter(s => s.sourceFile !== 'publisher.geojson')) {
      const csu =
        record.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
          ?.CsuId
      const rule = fixture.retentions.find(r => r.csu === csu)!
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
