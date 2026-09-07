import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-commercial-retentions.json'
import {
  retainAlsCommercialPremises,
  labelAlsCommercialRetentions,
  assertAlsCommercialInventoryAbsent,
} from './hkgovAlsCommercialRetentions'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'
import type { Als3dFeature } from './hkgovAls3d'
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
      fixture.retentions[0]!.evidence.at(-1)!.feature,
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
  expect(
    JSON.parse(rows[0]!.sources).hkgovAlsCommercialRetention.originalAssertions,
  ).toEqual(raw)
  const second = JSON.parse(rows[1]!.sources).hkgovAlsCommercialRetention
  expect(
    second.evidenceAssertion.properties.Address.PremisesAddress.EngPremisesAddress
      .BuildingName,
  ).toBe('TAI WO HAU SHOPPING CENTRE 2')
  expect(second.curation.verificationStatus).toBe('unverified')
  expect(second.originalAssertions).toEqual([])
})
test('changed source coordinates and new English or Chinese inventories require review', () => {
  const source = latest()
  source[0]!.feature.geometry!.coordinates = [0, 0]
  expect(() => retainAlsCommercialPremises(source, '2030-01-01.0')).toThrow(
    'publisher assertions changed',
  )
  for (const [locale, key] of [
    ['EngPremisesAddress', 'Eng3dAddress'],
    ['ChiPremisesAddress', 'Chi3dAddress'],
  ] as const) {
    const feature = latest()[0]!.feature as Als3dFeature
    Object.assign(feature.properties.Address.PremisesAddress[locale]!, { [key]: [{}] })
    expect(() => assertAlsCommercialInventoryAbsent(feature, '2030-01-01.0')).toThrow(
      'unexpected',
    )
  }
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
      r.application.state = states[i]!
    })
  }
})

test.skipIf(!process.env.ALS_RETAINED_RELEASE_TEST)(
  'all30 retained deliveries materialise both separately named centres under stable latest CSUs',
  async () => {
    const root = 'data/hkgov/dpo/ALS',
      releases = (await readdir(root))
        .filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r))
        .sort()
    const ids = new Map<string, string>()
    for (const release of releases) {
      const v = `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}.0`
      const sourceFile = 'als_addresses_(kwai_tsing_district).geojson'
      const fs = (await Bun.file(`${root}/${release}/${sourceFile}`).json())
        .features as HkgovAlsSourceFeature['feature'][]
      const sources: HkgovAlsSourceFeature[] = fs
        .filter(f => {
          const csu =
            f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId
          return csu ? fixture.retentions.some(r => r.csus.includes(csu)) : false
        })
        .map((feature, i) => ({
          feature,
          sourceFile,
          featureIndexOneBased: i + 1,
        }))
      const raw = structuredClone(sources),
        provenance = retainAlsCommercialPremises(sources, v)
      const rows = sources.map(s => normalise(s, v))
      labelAlsCommercialRetentions(rows, provenance)
      expect(rows).toHaveLength(2)
      expect(new Set(rows.map(r => r.geometry)).size).toBe(2)
      for (const [i, rule] of fixture.retentions.entries()) {
        const row = rows.find(r => r.hkgovCsuId === rule.csu)!
        expect(row.enBuildingName).toBe(rule.name)
        if (ids.has(rule.csu)) expect(row.id).toBe(ids.get(rule.csu)!)
        else ids.set(rule.csu, row.id!)
        const p = JSON.parse(row.sources).hkgovAlsCommercialRetention
        expect(p.originalAssertions).toEqual(
          raw.filter(s =>
            rule.csus.includes(
              s.feature.properties!.Address!.PremisesAddress!.BuildingCsuInformation!
                .CsuId!,
            ),
          ),
        )
        expect(p.curation.verificationStatus).toBe('verified')
        const original = raw.find(
          s =>
            rule.csus.includes(
              s.feature.properties!.Address!.PremisesAddress!.BuildingCsuInformation!
                .CsuId!,
            ) &&
            s.feature.properties!.Address!.PremisesAddress!.EngPremisesAddress!
              .BuildingName,
        )
        if (original)
          expect(JSON.parse(row.geometry!)).toEqual(original.feature.geometry)
      }
    }
    expect(ids.size).toBe(2)
  },
)
