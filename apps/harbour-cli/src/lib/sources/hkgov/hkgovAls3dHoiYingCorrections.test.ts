import { readFile } from 'node:fs/promises'
import { expect, test } from 'bun:test'
import type { Als3dFeature } from './hkgovAls3d'
import { applyAls3dCorrections, publisherInventoryHash } from './hkgovAls3dCorrections'

async function readYingFai(release: string) {
  const source = JSON.parse(
    await readFile(
      `data/hkgov/dpo/ALS/${release}/als_addresses_3d_(public_rental_housing).geojson`,
      'utf8',
    ),
  ) as { features: Als3dFeature[] }
  const feature = source.features.find(
    candidate =>
      candidate.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ===
      '3329521060T20171025',
  )
  if (!feature) throw new Error('Missing Ying Fai House source feature')
  return feature
}

test('backfills Ying Fai flat 108 to the retained start without changing raw evidence', async () => {
  const feature = await readYingFai('20240725-1048-ALS-GeoJSON')
  const original = JSON.stringify(feature)
  const result = applyAls3dCorrections(feature, '2024-07-25.0')
  const premises = result.feature.properties.Address.PremisesAddress
  expect(result.corrections.map(correction => correction.id)).toEqual([
    'hoi-ying-ying-fai-house-missing-first-floor-unit',
  ])
  expect(premises.EngPremisesAddress?.Eng3dAddress).toHaveLength(560)
  expect(premises.ChiPremisesAddress?.Chi3dAddress).toHaveLength(560)
  expect(publisherInventoryHash(result.feature)).toBe(
    'c55816f24d48941fe70578e13d79e0f44190f225c3983323a266aeaf9805b90e',
  )
  expect(JSON.stringify(feature)).toBe(original)
  expect(() => applyAls3dCorrections(result.feature, '2024-07-25.0')).toThrow(
    'source changed; review required',
  )
  const changed = structuredClone(feature)
  const changedEnglish = changed.properties.Address.PremisesAddress.EngPremisesAddress
  if (!changedEnglish) throw new Error('Missing Ying Fai English source address')
  changedEnglish.BuildingName = 'ANOTHER HOUSE'
  expect(() => applyAls3dCorrections(changed, '2024-07-25.0')).toThrow(
    'source changed; review required',
  )
})

test('leaves the publisher-repaired Ying Fai inventory unchanged', async () => {
  const feature = await readYingFai('20250123-1031-ALS-GeoJSON')
  const result = applyAls3dCorrections(feature, '2025-01-23.0')
  expect(result.corrections).toEqual([])
  expect(result.feature).toBe(feature)
  expect(publisherInventoryHash(feature)).toBe(
    'c55816f24d48941fe70578e13d79e0f44190f225c3983323a266aeaf9805b90e',
  )
})
