import { expect, test } from 'bun:test'
import { applyAlsAddressHierarchies } from './hkgovAlsHierarchies'
import { suppressAlsUnnamedPremises } from './hkgovAlsUnnamedPremiseSuppressions'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { normaliseAls3dInventory } from './hkgovAls3d'
import { resolveAddress3dCoverage } from '@repo/db/address3d'
import type { HkgovAlsFeature } from './hkgovAlsTypes'

function normaliseTestFeature(feature: HkgovAlsFeature) {
  return normaliseHkgovAlsFeature(
    feature,
    'test.geojson',
    1,
    '2024-07',
    '2024-07-25.0',
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
}

function premises() {
  return [
    ['LEI FOOK', '利福', '3364711676T20141201'],
    ['LEI MOON', '利滿', '3372511726T20141201'],
  ].map(([en, zh, csu]) =>
    normaliseTestFeature({
      geometry: { type: 'Point', coordinates: [114.15, 22.24] },
      properties: {
        Address: {
          PremisesAddress: {
            BuildingCsuInformation: { CsuId: csu },
            EngPremisesAddress: {
              BuildingName: `${en} HSE HIGH BLK & LOW BLK`,
              EngEstate: { EstateName: 'AP LEI CHAU ESTATE' },
              EngStreet: {
                StreetName: 'AP LEI CHAU BRIDGE ROAD',
                BuildingNoFrom: '322',
              },
            },
            ChiPremisesAddress: {
              BuildingName: `${zh}樓高座及低座`,
              ChiEstate: { EstateName: '鴨脷洲邨' },
              ChiStreet: { StreetName: '鴨脷洲橋道', BuildingNoFrom: '322' },
            },
          },
        },
      },
    }),
  )
}

test('High Prosperity structured towers link to their publisher estate without curation', () => {
  const rows = [undefined, '1', '2'].map((block, index) =>
    normaliseTestFeature({
      geometry: { type: 'Point', coordinates: [114.12, 22.36] },
      properties: {
        Address: {
          PremisesAddress: {
            BuildingCsuInformation: {
              CsuId: [
                '3069325029T20050430',
                '3067325047T20050430',
                '3070325094T20050430',
              ][index],
            },
            EngPremisesAddress: {
              EngEstate: { EstateName: 'HIGH PROSPERITY TERRACE' },
              EngStreet: { StreetName: 'KWAI SHING CIRCUIT', BuildingNoFrom: '188' },
              ...(block
                ? { EngBlock: { BlockNo: block, BlockDescriptor: 'TOWER' } }
                : {}),
            },
            ChiPremisesAddress: {
              ChiEstate: { EstateName: '高盛臺' },
              ChiStreet: { StreetName: '葵盛圍', BuildingNoFrom: '188' },
              ...(block ? { ChiBlock: { BlockNo: block, BlockDescriptor: '座' } } : {}),
            },
          },
        },
      },
    }),
  )
  applyAlsAddressHierarchies(rows, '2026-08-19.0')
  expect(rows).toHaveLength(3)
  expect(rows.slice(1).map(row => row.parentAddressId)).toEqual([
    rows[0]!.id,
    rows[0]!.id,
  ])
  expect(rows[0]!.parentAddressId).toBeUndefined()
  expect(rows.slice(1).map(row => row.enBlockNumber)).toEqual(['1', '2'])
})

test('identical designs retain distinct building inventories and unresolved High/Low sections', () => {
  const rows = premises()
  const original = rows.map(row => ({ ...row }))
  const owners = applyAlsAddressHierarchies(rows, '2024-07-25.0')
  expect(rows).toHaveLength(7)
  const inventoryFeature = {
    geometry: {
      type: 'Point' as const,
      coordinates: [114.15, 22.24] as [number, number],
    },
    properties: {
      Address: {
        PremisesAddress: {
          EngPremisesAddress: {
            Eng3dAddress: [
              {
                EngFloor: { FloorDescription: '1/F' },
                EngUnit: { UnitDescriptor: 'FLAT', UnitNo: '01' },
              },
            ],
          },
          ChiPremisesAddress: {
            Chi3dAddress: [
              {
                ChiFloor: { FloorDescription: '1樓' },
                ChiUnit: { UnitDescriptor: '室', UnitNo: '01' },
              },
            ],
          },
        },
      },
    },
  }
  const unitIds = []
  for (const source of original) {
    const owner = owners.get(source.id)!
    expect(owner.ownerId).toBe(source.id)
    expect(owner.unresolvedSectionIds).toHaveLength(2)
    const units = normaliseAls3dInventory(
      inventoryFeature,
      owner.physicalBuildingId,
    ).units
    unitIds.push(units[0]!.id)
    const collection = {
      id: source.id,
      address2dId: owner.ownerId,
      unresolvedSectionIds: owner.unresolvedSectionIds,
      units,
    }
    for (const id of owner.unresolvedSectionIds) {
      const section = rows.find(row => row.id === id)!
      expect(section.curatedGranularity).toBe('section')
      expect(section.id).toMatch(/^ss-[0-9a-f-]{36}$/)
      expect(section.canonicalId).toBe(section.id)
      expect(section.hkgovCsuId).toBeNull()
      expect(section.engPremisesAddressJson).toBeNull()
      expect(
        resolveAddress3dCoverage(
          { id: section.id, parentAddressId: section.parentAddressId ?? null },
          [collection],
        ),
      ).toMatchObject({
        kind: 'ancestor',
        membership: 'unresolved',
        ownerAddress2dId: source.id,
      })
    }
  }
  expect(new Set(unitIds).size).toBe(2)
})

test('unnamed Lei Moon duplicate is not reused as a Low Block section', () => {
  const rows = premises()
  const moon = rows[1]!
  const low = {
    ...moon,
    id: 'publisher-low',
    canonicalId: 'publisher-low',
    hkgovCsuId: '3370111759T20150127',
    enBuildingName: null,
    zhHantBuildingName: null,
    geometry: JSON.stringify({
      type: 'Point',
      coordinates: [114.15197, 22.24457],
    }),
  }
  rows.push(low)
  const ownership = applyAlsAddressHierarchies(rows, '2025-02-25.0')
  expect(rows).toHaveLength(8)
  expect(low.parentAddressId).not.toBe(moon.id)
  expect(low.curatedGranularity).toBeUndefined()
  expect(low.enBuildingName).toBeNull()
  const derivedLow = rows.find(
    row => row.hkgovCsuId === null && row.enBuildingName === 'LEI MOON HSE LOW BLK',
  )
  expect(derivedLow?.parentAddressId).toBe(moon.id)
  expect(ownership.get(moon.id)?.unresolvedSectionIds).toContain(derivedLow?.id)
  expect(ownership.get(moon.id)?.unresolvedSectionIds).not.toContain(low.id)
  expect(suppressAlsUnnamedPremises(rows, '2025-02-25.0')).toEqual({ suppressed: 1 })
  expect(rows).toHaveLength(7)
  expect(JSON.parse(moon.sources).hkgovAlsUnnamedPremiseSuppression).toMatchObject({
    decision: expect.stringContaining('not expose it as a Low Block'),
  })
  expect(applyAlsAddressHierarchies(premises(), '2025-02-25.0').size).toBe(2)
})

test('changed street components, repeated same-CSU assertions and out-of-bounds releases are not silently accepted', () => {
  const changed = premises()
  changed[0]!.enStreetNumberFrom = '324'
  expect(() => applyAlsAddressHierarchies(changed, '2024-07-25.0')).toThrow(
    'review required',
  )
  const duplicate = premises()
  duplicate.push({ ...duplicate[0]!, id: 'alternative-address' })
  expect(() => applyAlsAddressHierarchies(duplicate, '2024-07-25.0')).toThrow(
    'ambiguous',
  )
  const future = premises()
  expect(applyAlsAddressHierarchies(future, '2026-09-01.0').size).toBe(0)
  expect(future).toHaveLength(2)
})
