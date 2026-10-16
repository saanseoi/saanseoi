import { expect, test } from 'bun:test'
import { normaliseAddressRowForPipeline } from '@repo/core/pipeline/services/addresses/normalisation'
import examples from './fixtures/structured-component-premises.json'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { applyReviewedStructuredComponents } from './hkgovAlsStructuredComponents'
import type { DivisionLookupMaps, HkgovAlsFeature } from './hkgovAlsTypes'
const maps: DivisionLookupMaps = {
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
}
function rows(features = examples) {
  return features.map((feature, index) =>
    normaliseHkgovAlsFeature(
      {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: [
            feature.geometry.coordinates[0]!,
            feature.geometry.coordinates[1]!,
          ],
        },
      } satisfies HkgovAlsFeature,
      'test.geojson',
      index + 1,
      'test',
      '2025-02-25.0',
      maps,
      true,
      new Map(),
      new Map(),
      new Map(),
    ),
  )
}
test('Royal Dragon Villa remains the estate with separate Block 9 fields and an unchanged identity', () => {
  const input = rows()
  const row = input.find(row => row.hkgovCsuId === '2640325602T20050430')!
  row.id = row.canonicalId = 'ss-e39dba05-bf20-505f-acb4-de310a20ba93'
  const before = structuredClone(row)
  applyReviewedStructuredComponents(input, '2025-08-13.0')
  const normalised = normaliseAddressRowForPipeline({ ...row })
  const en = normalised.i18n.find(value => value.locale === 'en')!
  expect(en.estateName).toBe('Royal Dragon Villa')
  expect(en.buildingName).toBeNull()
  expect(en.blockType).toBe('block')
  expect(en.blockRef).toBe('9')
  expect(row.enFormattedAddress).toBe(
    'Block 9, Royal Dragon Villa, 85, TING KAU, TSUEN WAN DISTRICT, NT',
  )
  expect(row.zhHantEstateName).toBe('嘉御龍庭')
  expect(row.zhHantBlockNumber).toBe('9')
  expect([
    row.id,
    row.canonicalId,
    row.identityKey,
    row.geometry,
    row.engPremisesAddressJson,
    row.chiPremisesAddressJson,
  ]).toEqual([
    before.id,
    before.canonicalId,
    before.identityKey,
    before.geometry,
    before.engPremisesAddressJson,
    before.chiPremisesAddressJson,
  ])
})
test('curates three houses and five Tam blocks through the ingestion normaliser without identity or source changes', () => {
  const input = rows(
      examples.filter(
        feature =>
          feature.properties.Address.PremisesAddress.BuildingCsuInformation.CsuId !==
          '2640325602T20050430',
      ),
    ),
    before = structuredClone(input)
  applyReviewedStructuredComponents(input, '2025-02-25.0')
  for (const [index, row] of input.entries()) {
    const previous = before[index]!
    expect([
      row.id,
      row.identityKey,
      row.identityContinuityKey,
      row.engPremisesAddressJson,
      row.chiPremisesAddressJson,
      row.geometry,
    ]).toEqual([
      previous.id,
      previous.identityKey,
      previous.identityContinuityKey,
      previous.engPremisesAddressJson,
      previous.chiPremisesAddressJson,
      previous.geometry,
    ])
    const normalised = normaliseAddressRowForPipeline({ ...row })
    const en = normalised.i18n.find(value => value.locale === 'en')!
    expect(en.blockRef).toBe(String(index < 3 ? index + 1 : index - 2))
    expect(en.blockType).toBe(index < 3 ? 'house' : 'block')
    expect(en.buildingName).toBe(
      index < 3 ? null : index < 6 ? 'Tam Towers' : 'Tam Gardens',
    )
    expect(row.enStreetNumberFrom).toBe(index < 3 ? '8' : '25')
    expect(row.enFormattedAddress).not.toContain('ROAD HOUSE')
    if (index < 3)
      expect(row.enFormattedAddress).toContain(
        `House ${index + 1}, 8 HANG HAU WING LUNG ROAD`,
      )
    if (index >= 6)
      expect(row.enFormattedAddress!.toUpperCase().match(/TAM GARDENS/g)).toHaveLength(
        1,
      )
  }
})
test('guards changed evidence, duplicate named premises and unreviewed releases; leaves earlier releases unchanged', () => {
  const original = rows(),
    before = structuredClone(original)
  applyReviewedStructuredComponents(original, '2025-01-23.0')
  expect(original).toEqual(before)
  const changed = rows()
  changed[0]!.geometry = JSON.stringify({ type: 'Point', coordinates: [114, 22] })
  expect(() => applyReviewedStructuredComponents(changed, '2025-02-25.0')).toThrow(
    'publisher evidence changed',
  )
  const duplicate = rows()
  duplicate.push(structuredClone(duplicate[0]!))
  expect(() => applyReviewedStructuredComponents(duplicate, '2025-02-25.0')).toThrow(
    'unique named premise required',
  )
  expect(() => applyReviewedStructuredComponents(rows(), '2026-10-01.0')).toThrow(
    'release requires review',
  )
})
