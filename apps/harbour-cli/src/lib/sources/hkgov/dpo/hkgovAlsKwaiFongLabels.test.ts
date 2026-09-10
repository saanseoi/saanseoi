import { expect, test } from 'bun:test'
import { readAls3dFeatures } from './hkgovAls3d'
import { applyAls3dCorrections, publisherInventoryHash } from './hkgovAls3dCorrections'

test('Kwai Fong corrects only reviewed F-suffixed labels and retains raw evidence', async () => {
  const expected = new Map([
    [
      '3136024324T20050430',
      '56c3bcb3e4ab76158879668957d92011f63840d32d78966ea13bde2ecd642265',
    ],
    [
      '3139624361T20050430',
      '2dc9f609b368adbb540e1f23d46d9ce60e0bb059e66a9c40007c58b52dfa5ae6',
    ],
  ])
  let checked = 0
  for await (const { feature } of readAls3dFeatures(
    'data/hkgov/dpo/ALS/20240725-1048-ALS-GeoJSON/als_addresses_3d_(public_rental_housing).geojson',
  )) {
    const hash = expected.get(
      feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ?? '',
    )
    if (!hash) continue
    const original = JSON.stringify(feature)
    const result = applyAls3dCorrections(feature, '2024-07-25.0')
    expect(publisherInventoryHash(result.feature)).toBe(hash)
    expect(JSON.stringify(feature)).toBe(original)
    checked++
  }
  expect(checked).toBe(2)
})
