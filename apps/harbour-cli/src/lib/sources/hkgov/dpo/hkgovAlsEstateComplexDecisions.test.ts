import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import {
  reconstructReviewedEstateComplexes,
  applyReviewedEstateComplexes,
} from './hkgovAlsEstateComplexDecisions'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

const root = 'data/hkgov/dpo/ALS'
const maps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  ambiguousAreaEn: new Set<string>(),
  ambiguousAreaZh: new Set<string>(),
  countryId: null,
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousDistrictEn: new Set<string>(),
  ambiguousDistrictZh: new Set<string>(),
  snapshotId: 'test',
}
const csus = ['4129321323T20050430', '4139021210T20050430', '3720625766T20071129']
async function load(release: string) {
  const source: HkgovAlsSourceFeature[] = []
  for (const district of ['kwun_tong', 'sha_tin']) {
    const sourceFile = `als_addresses_(${district}_district).geojson`
    const features = (await Bun.file(`${root}/${release}/${sourceFile}`).json())
      .features
    for (const [i, feature] of features.entries())
      if (
        ['SHUN LEE ESTATE', 'SUN TIN WAI ESTATE'].includes(
          feature.properties.Address.PremisesAddress.EngPremisesAddress?.EngEstate
            ?.EstateName,
        )
      )
        source.push({ feature, sourceFile, featureIndexOneBased: i + 1 })
  }
  return source
}
test('all retained releases preserve distinct estate and centre points, raw names and stable granularity', async () => {
  const ids = new Map<string, string>()
  for (const release of (await readdir(root))
    .filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r))
    .sort()) {
    const version = `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}.0`
    const source = await load(release),
      raw = JSON.stringify(source)
    const originals = source.slice()
    reconstructReviewedEstateComplexes(source, version)
    expect(JSON.stringify(originals)).toBe(raw)
    const rows = source.map(s =>
      normaliseHkgovAlsFeature(
        s.feature,
        s.sourceFile,
        s.featureIndexOneBased,
        'test',
        version,
        maps,
        true,
        new Map(),
        new Map(),
        new Map(),
      ),
    )
    applyReviewedEstateComplexes(rows, version)
    const [estate, centre, sun] = csus.map(csu =>
      requireDefined(rows.find(r => r.hkgovCsuId === csu)),
    )
    expect(requireDefined(estate).curatedGranularity).toBe('complex')
    expect(requireDefined(estate).enBuildingName).toBeNull()
    expect(requireDefined(estate).enStreetNumberFrom).toBe('15')
    expect(requireDefined(centre).enBuildingName).toBe(
      'SHUN LEE COMMERCIAL CENTRE (PHASE II)',
    )
    expect(requireDefined(centre).enStreetNumberFrom).toBe('6')
    expect(requireDefined(centre).parentAddressId).toBe(requireDefined(estate).id)
    expect(requireDefined(centre).geometry).not.toBe(requireDefined(estate).geometry)
    const sunWasMissing = !originals.some(
      s =>
        s.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
          ?.CsuId === csus[2],
    )
    if (sunWasMissing) expect(requireDefined(sun).curatedGranularity).toBe('complex')
    expect(requireDefined(sun).enFormattedAddress).toContain('SUN TIN WAI ESTATE')
    expect(
      rows.filter(
        r =>
          r.enEstateName === 'SUN TIN WAI ESTATE' && r.curatedGranularity === 'complex',
      ),
    ).toHaveLength(sunWasMissing ? 1 : 0)
    expect(rows.some(r => r.enBuildingName === 'SUN TIN WAI SHOPPING CENTRE')).toBe(
      true,
    )
    for (const row of [
      requireDefined(estate),
      requireDefined(centre),
      ...(sunWasMissing ? [requireDefined(sun)] : []),
    ]) {
      if (ids.has(requireDefined(row.hkgovCsuId)))
        expect(row.id).toBe(requireDefined(ids.get(requireDefined(row.hkgovCsuId))))
      ids.set(requireDefined(row.hkgovCsuId), row.id)
      const original = originals.find(
        s =>
          s.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
            ?.CsuId === row.hkgovCsuId,
      )
      if (original) {
        expect(row.geometry).toBe(JSON.stringify(original.feature.geometry))
        expect(JSON.parse(requireDefined(row.engPremisesAddressJson))).toEqual(
          requireDefined(
            requireDefined(requireDefined(original.feature.properties).Address)
              .PremisesAddress,
          ).EngPremisesAddress,
        )
      }
    }
  }
})
test('returning estate premises bypass the fallback even with changed source details', async () => {
  const source = await load('20260819-1047-ALS-GeoJSON')
  const replacement = structuredClone(
    requireDefined(
      source.find(
        s =>
          requireDefined(
            requireDefined(
              requireDefined(
                requireDefined(requireDefined(s.feature.properties).Address)
                  .PremisesAddress,
              ).EngPremisesAddress,
            ).EngEstate,
          ).EstateName === 'SUN TIN WAI ESTATE',
      ),
    ),
  )
  delete requireDefined(
    requireDefined(
      requireDefined(requireDefined(replacement.feature.properties).Address)
        .PremisesAddress,
    ).EngPremisesAddress,
  ).BuildingName
  source.push(replacement)
  const original = structuredClone(source)
  reconstructReviewedEstateComplexes(source, '2026-08-19.0')
  expect(source).toEqual(original)
  const clean = await load('20240725-1048-ALS-GeoJSON')
  requireDefined(
    requireDefined(
      clean.find(
        s =>
          requireDefined(
            requireDefined(
              requireDefined(requireDefined(s.feature.properties).Address)
                .PremisesAddress,
            ).BuildingCsuInformation,
          ).CsuId === csus[2],
      ),
    ).feature.geometry,
  ).coordinates = [0, 0]
  const changedOriginal = structuredClone(clean)
  reconstructReviewedEstateComplexes(clean, '2024-07-25.0')
  expect(clean).toEqual(changedOriginal)
})

test('Lingnan campus is a complex separate from the retained named building across all releases', async () => {
  const { buildAls2dBackfillFeatures } = await import('./hkgovAls2dBackfills')
  let complexes = 0
  for (const release of (await readdir(root))
    .filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r))
    .sort()) {
    const version = `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}.0`
    const sourceFile = 'als_addresses_(tuen_mun_district).geojson'
    const raw = (await Bun.file(`${root}/${release}/${sourceFile}`).json()).features
    const source: HkgovAlsSourceFeature[] = raw.flatMap(
      (feature: HkgovAlsSourceFeature['feature'], i: number) =>
        feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        '1638830000T20050430'
          ? [{ feature, sourceFile, featureIndexOneBased: i + 1 }]
          : [],
    )
    const all = [
      ...source,
      ...buildAls2dBackfillFeatures(source, version).filter(
        f =>
          f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
            ?.CsuId === '1638830000T20050430',
      ),
    ]
    const rows = all.map(s =>
      normaliseHkgovAlsFeature(
        s.feature,
        s.sourceFile,
        s.featureIndexOneBased,
        'test',
        version,
        maps,
        true,
        new Map(),
        new Map(),
        new Map(),
      ),
    )
    applyReviewedEstateComplexes(rows, version)
    const building = rows.find(r => r.enBuildingName === 'HO SIN HANG BUILDING')!
    expect(building).toBeDefined()
    expect(building.curatedGranularity).not.toBe('complex')
    const campus = rows.find(r => r.hierarchyCuration === 'lingnan-university-campus')
    if (
      source.some(
        s =>
          s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress?.EngBlock
            ?.BlockNo === 'CAMPUS',
      )
    ) {
      complexes++
      expect(campus!.curatedGranularity).toBe('complex')
      expect(campus!.enEstateName).toBe('LINGNAN UNIVERSITY')
      expect(campus!.enBlockNumber).toBeNull()
      expect(campus!.enFormattedAddress).not.toContain('CAMPUS')
      expect(JSON.parse(campus!.engPremisesAddressJson!).EngBlock.BlockNo).toBe(
        'CAMPUS',
      )
      expect(campus!.id).not.toBe(building.id)
    } else expect(campus).toBeUndefined()
  }
  expect(complexes).toBe(26)
})
