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
function rows() {
  return examples.map((feature, index) =>
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
test('curates three houses and five Tam blocks through the ingestion normaliser without identity or source changes', () => {
  const input = rows(),
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
