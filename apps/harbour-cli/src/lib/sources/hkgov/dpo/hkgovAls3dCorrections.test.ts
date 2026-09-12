import { requireDefined } from '@repo/core/requireDefined'
import { readFile } from 'node:fs/promises'
import { expect, test } from 'bun:test'

import { applyAls3dCorrections, publisherInventoryHash } from './hkgovAls3dCorrections'
import type { Als3dFeature } from './hkgovAls3d'

test('backfills Wing Ka House 8/F 817 and 819 from the reviewed July repair', async () => {
  const source = JSON.parse(
    await readFile(
      'data/hkgov/dpo/ALS/20260403-1056-ALS-GeoJSON/als_addresses_3d_(public_rental_housing).geojson',
      'utf8',
    ),
  ) as { features: Als3dFeature[] }
  const feature = source.features.find(
    candidate =>
      candidate.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ===
      '2963326076T20050430',
  )
  if (!feature) throw new Error('Missing Wing Ka House source feature')

  const result = applyAls3dCorrections(feature, '2026-04-03.0')
  const en = result.feature.properties.Address.PremisesAddress.EngPremisesAddress
  const zh = result.feature.properties.Address.PremisesAddress.ChiPremisesAddress

  expect(publisherInventoryHash(feature)).toBe(
    '3457c60f7a410f63325a198c82845ef0ca334937b19b6259431eda1e97cc8ab4',
  )
  expect(result.corrections.map(correction => correction.id)).toContain(
    'fuk-loi-wing-ka-house-missing-eighth-floor-units',
  )
  expect(en?.Eng3dAddress).toHaveLength(509)
  expect(zh?.Chi3dAddress).toHaveLength(509)
  expect(en?.Eng3dAddress).toEqual(
    expect.arrayContaining([
      {
        EngUnit: { UnitDescriptor: 'FLAT', UnitNo: '817' },
        EngFloor: { FloorNum: 8, FloorDescription: '8/F' },
      },
      {
        EngUnit: { UnitDescriptor: 'FLAT', UnitNo: '819' },
        EngFloor: { FloorNum: 8, FloorDescription: '8/F' },
      },
    ]),
  )
  expect(publisherInventoryHash(result.feature)).toBe(
    '9008b650bb3d791be1fc1e3aa51bba73d2878d26715fcea55ec8861abbc7a4e7',
  )
})

test('general omission policy backfills baseline inventories without backdating unrelated mergers', async () => {
  const source = JSON.parse(
    await readFile(
      'data/hkgov/dpo/ALS/20240725-1048-ALS-GeoJSON/als_addresses_3d_(public_rental_housing).geojson',
      'utf8',
    ),
  ) as { features: Als3dFeature[] }
  for (const [building, addedCount] of [
    ['KAI SHUN HOUSE', 1],
    ['KWONG YAN HOUSE', 14],
    ['LAI FU HOUSE', 11],
  ] as const) {
    const feature = source.features.find(
      f =>
        f.properties.Address.PremisesAddress.EngPremisesAddress?.BuildingName ===
        building,
    )
    if (!feature) throw new Error(`Missing ${building}`)
    const originalHash = publisherInventoryHash(feature)
    const before = requireDefined(
      requireDefined(feature.properties.Address.PremisesAddress.EngPremisesAddress)
        .Eng3dAddress,
    )
    const result = applyAls3dCorrections(feature, '2024-07-25.0')
    const after = requireDefined(
      requireDefined(
        result.feature.properties.Address.PremisesAddress.EngPremisesAddress,
      ).Eng3dAddress,
    )
    expect(after.length).toBe(before.length + addedCount)
    expect(after).toEqual(expect.arrayContaining(before))
    expect(publisherInventoryHash(feature)).toBe(originalHash)
    expect(result.corrections).toHaveLength(1)
    if (building === 'KAI SHUN HOUSE') {
      expect(
        after
          .filter(
            row =>
              row.EngFloor?.FloorNum === 2 &&
              String(row.EngUnit?.UnitNo).startsWith('218'),
          )
          .map(row => row.EngUnit?.UnitNo),
      ).toEqual(['218A', '218B', '218C'])
      expect(
        after.some(
          row => row.EngFloor?.FloorNum === 2 && row.EngUnit?.UnitNo === '219',
        ),
      ).toBe(true)
    }
  }
})
