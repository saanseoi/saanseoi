import { expect, test } from 'bun:test'
import {
  enrichAls3dParentBlock,
  suppressAls3dParentBlockDuplicate,
} from './hkgovAls3dBlockEnrichment.ts'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes.ts'

function owner() {
  return {
    canonicalId: 'als-example',
    chiPremisesAddressJson: JSON.stringify({
      BuildingName: '示例樓',
      ChiEstate: { EstateName: '示例邨' },
      ChiStreet: { BuildingNoFrom: '1', StreetName: '示例道' },
    }),
    enBlockDescriptor: null,
    enBlockNumber: null,
    enFormattedAddress: 'EXAMPLE HOUSE, 1 EXAMPLE ROAD, EXAMPLE ESTATE',
    engPremisesAddressJson: JSON.stringify({
      BuildingName: 'EXAMPLE HOUSE',
      EngEstate: { EstateName: 'EXAMPLE ESTATE' },
      EngStreet: { BuildingNoFrom: '1', StreetName: 'EXAMPLE ROAD' },
    }),
    hkgovCsuId: '123',
    sources: '{}',
    zhHantBlockDescriptor: null,
    zhHantBlockNumber: null,
    zhHantFormattedAddress: '示例邨示例樓示例道1號',
  } as PreparedHkgovAlsRow
}

test('enriches one exact bilingual 2D parent from its 3D block components', () => {
  const row = owner()
  const enrichment = enrichAls3dParentBlock({
    en: {
      BuildingName: 'EXAMPLE HOUSE',
      EngBlock: {
        BlockDescriptor: 'BLK',
        BlockDescriptorPrecedenceIndicator: 'Y',
        BlockNo: '6',
      },
      EngEstate: { EstateName: 'EXAMPLE ESTATE' },
      EngStreet: { BuildingNoFrom: '1', StreetName: 'EXAMPLE ROAD' },
    },
    hkgovCsuId: '123',
    owner: row,
    sourceFeatureIndexOneBased: 7,
    sourceFile: 'als_addresses_3d.geojson',
    sourceVersion: '2026-08-19.0',
    zh: {
      BuildingName: '示例樓',
      ChiBlock: { BlockDescriptor: '座', BlockNo: '6' },
      ChiEstate: { EstateName: '示例邨' },
      ChiStreet: { BuildingNoFrom: '1', StreetName: '示例道' },
    },
  })

  expect(enrichment).toMatchObject({
    enBlock: { descriptor: 'BLK', ref: '6' },
    sourceFeatureIndexOneBased: 7,
    zhHantBlock: { descriptor: '座', ref: '6' },
  })
  expect(row.enBlockNumber).toBe('6')
  expect(row.zhHantBlockNumber).toBe('6')
  expect(JSON.parse(row.engPremisesAddressJson ?? '{}').EngBlock).toMatchObject({
    BlockDescriptor: 'BLK',
    BlockNo: '6',
  })
  expect(JSON.parse(row.sources).hkgovAls3dParentBlockEnrichment).toEqual(enrichment)
})

test('rejects a mismatched bilingual block reference', () => {
  expect(() =>
    enrichAls3dParentBlock({
      en: {
        BuildingName: 'EXAMPLE HOUSE',
        EngBlock: { BlockDescriptor: 'BLK', BlockNo: '6' },
        EngEstate: { EstateName: 'EXAMPLE ESTATE' },
        EngStreet: { BuildingNoFrom: '1', StreetName: 'EXAMPLE ROAD' },
      },
      hkgovCsuId: '123',
      owner: owner(),
      sourceFeatureIndexOneBased: 7,
      sourceFile: 'als_addresses_3d.geojson',
      sourceVersion: '2026-08-19.0',
      zh: {
        BuildingName: '示例樓',
        ChiBlock: { BlockDescriptor: '座', BlockNo: '7' },
        ChiEstate: { EstateName: '示例邨' },
        ChiStreet: { BuildingNoFrom: '1', StreetName: '示例道' },
      },
    }),
  ).toThrow('matching BLK/座 references')
})

test('retains a matching block-labelled 2D assertion as provenance, not another address', () => {
  const canonical = owner()
  enrichAls3dParentBlock({
    en: {
      BuildingName: 'EXAMPLE HOUSE',
      EngBlock: { BlockDescriptor: 'BLK', BlockNo: '6' },
      EngEstate: { EstateName: 'EXAMPLE ESTATE' },
      EngStreet: { BuildingNoFrom: '1', StreetName: 'EXAMPLE ROAD' },
    },
    hkgovCsuId: '123',
    owner: canonical,
    sourceFeatureIndexOneBased: 7,
    sourceFile: 'als_addresses_3d.geojson',
    sourceVersion: '2026-08-19.0',
    zh: {
      BuildingName: '示例樓',
      ChiBlock: { BlockDescriptor: '座', BlockNo: '6' },
      ChiEstate: { EstateName: '示例邨' },
      ChiStreet: { BuildingNoFrom: '1', StreetName: '示例道' },
    },
  })
  const duplicate = {
    ...owner(),
    chiPremisesAddressJson: JSON.stringify({
      BuildingName: '示例樓(6座)',
      ChiBlock: { BlockDescriptor: '座', BlockNo: '6' },
      ChiEstate: { EstateName: '示例邨' },
      ChiStreet: { BuildingNoFrom: '1', StreetName: '示例道' },
    }),
    enBlockDescriptor: 'BLK',
    enBlockNumber: '6',
    engPremisesAddressJson: JSON.stringify({
      BuildingName: 'EXAMPLE HOUSE (BLK 6)',
      EngBlock: { BlockDescriptor: 'BLK', BlockNo: '6' },
      EngEstate: { EstateName: 'EXAMPLE ESTATE' },
      EngStreet: { BuildingNoFrom: '1', StreetName: 'EXAMPLE ROAD' },
    }),
    id: 'duplicate',
    sourceFeatureIndexOneBased: 8,
    sourceFile: 'als_addresses.geojson',
    zhHantBlockDescriptor: '座',
    zhHantBlockNumber: '6',
  }
  suppressAls3dParentBlockDuplicate(canonical, duplicate)
  expect(canonical.als3dParentBlockEnrichment?.suppressed2dSources).toEqual([
    expect.objectContaining({ addressId: 'duplicate' }),
  ])
})
