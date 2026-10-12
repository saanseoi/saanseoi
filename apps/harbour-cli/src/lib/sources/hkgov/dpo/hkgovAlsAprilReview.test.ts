import { applyReviewedAlsFrontages as applyAprilReviewedAlsReconciliationsSpecialised } from './hkgovAlsReviewFrontages'
import { applyReviewedAlsParents } from './hkgovAlsReviewProgram'
import { expect, test } from 'bun:test'

import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

function row(options: {
  id: string
  csu: string
  building?: string
  estate?: string
  blockNumber?: string
  street: string
  streetNumber: string
}): PreparedHkgovAlsRow {
  const en = {
    BuildingName: options.building,
    EngEstate: options.estate ? { EstateName: options.estate } : undefined,
    EngBlock: options.blockNumber
      ? { BlockDescriptor: 'TOWER', BlockNo: options.blockNumber }
      : undefined,
    EngStreet: { StreetName: options.street, BuildingNoFrom: options.streetNumber },
    EngDistrict: options.csu.startsWith('4037')
      ? 'KWUN TONG DISTRICT'
      : 'SHAM SHUI PO DISTRICT',
    Region: 'KLN',
  }
  const zh = {
    BuildingName: options.building ? '兆景樓' : undefined,
    ChiEstate: options.estate ? { EstateName: '愛海頌' } : undefined,
    ChiBlock: options.blockNumber
      ? { BlockDescriptor: '座', BlockNo: options.blockNumber }
      : undefined,
    ChiStreet: {
      StreetName: options.street === 'HAI TAN STREET' ? '海壇街' : '安華街',
      BuildingNoFrom: options.streetNumber,
    },
    ChiDistrict: options.csu.startsWith('4037') ? '觀塘區' : '深水埗區',
    Region: '九龍',
  }
  return {
    id: options.id,
    canonicalId: options.id,
    theme: 'addresses',
    type: 'address',
    country: 'HK',
    region: 'HK',
    cohortKey: '2025-04-26.0',
    sourceVersion: '2025-04-26.0',
    sourceFile: 'als_addresses_(test).geojson',
    sourceFeatureIndexOneBased: 1,
    geometry: JSON.stringify({ type: 'Point', coordinates: [114, 22] }),
    identifiers: null,
    sources: '{}',
    divisionSnapshotId: 'test',
    areaId: null,
    areaMatchStatus: 'unmatched',
    districtId: null,
    districtMatchStatus: 'unmatched',
    countryId: null,
    areaNameEn: null,
    areaNameZhHant: null,
    districtNameEn: null,
    districtNameZhHant: null,
    geoAddress: options.csu,
    hkgovCsuId: options.csu,
    identityAlias: null,
    identityBuildingId: options.csu,
    identityContinuityKey: options.id,
    identityKey: options.id,
    identityMatchMethod: 'als-premise',
    blockDescriptorPrecedenceIndicator: null,
    identityNumberFrom: options.streetNumber,
    identityNumberTo: null,
    identityRouteNames: JSON.stringify([options.street]),
    identitySummary: {},
    chiPremisesAddressJson: JSON.stringify(zh),
    engPremisesAddressJson: JSON.stringify(en),
    zhHantFormattedAddress: '',
    zhHantRegion: '九龍',
    zhHantDistrict: null,
    zhHantEstateName: options.estate ? '愛海頌' : null,
    zhHantBuildingName: options.building ? '兆景樓' : null,
    zhHantBlockDescriptor: options.blockNumber ? '座' : null,
    zhHantBlockNumber: options.blockNumber ?? null,
    zhHantPhaseName: null,
    zhHantPhaseRef: null,
    zhHantStreetName: options.street === 'HAI TAN STREET' ? '海壇街' : '安華街',
    zhHantStreetNumberFrom: options.streetNumber,
    zhHantStreetNumberTo: null,
    zhHantVillageName: null,
    zhHantVillageNumberFrom: null,
    zhHantVillageNumberTo: null,
    enFormattedAddress: '',
    enRegion: 'KLN',
    enDistrict: null,
    enEstateName: options.estate ?? null,
    enBuildingName: options.building ?? null,
    enBuildingNameRomanNumeralNormalisation: null,
    enBlockDescriptor: options.blockNumber ? 'TOWER' : null,
    enBlockNumber: options.blockNumber ?? null,
    enBlockNumberRomanNumeralNormalisation: null,
    enStreetName: options.street,
    enStreetNumberFrom: options.streetNumber,
    enStreetNumberTo: null,
    enVillageName: null,
    enVillageNumberFrom: null,
    enVillageNumberTo: null,
    enPhaseName: null,
    enPhaseRef: null,
    enPhaseRomanNumeralNormalisation: null,
    easting: 0,
    northing: 0,
  }
}

test('April reconciliation keeps Seaside Sonata Towers 1, 2, 3 and 5 with the shared range', () => {
  const rows = [
    ...['1', '3', '5'].map(n =>
      row({
        id: `tower-${n}`,
        csu: `tower-csu-${n}`,
        estate: 'SEASIDE SONATA',
        blockNumber: n,
        street: 'HAI TAN STREET',
        streetNumber: '201',
      }),
    ),
    ...['201', '203', '218'].map(n =>
      row({
        id: `tower-2-${n}`,
        csu: 'tower-csu-2',
        estate: 'SEASIDE SONATA',
        blockNumber: '2',
        street: 'HAI TAN STREET',
        streetNumber: n,
      }),
    ),
  ]

  applyAprilReviewedAlsReconciliations(rows, '2025-04-26.0')

  expect(rows).toHaveLength(4)
  expect(rows.map(r => r.enBlockNumber).sort()).toEqual(['1', '2', '3', '5'])
  expect(
    rows.every(r => r.enStreetNumberFrom === '201' && r.enStreetNumberTo === '218'),
  ).toBe(true)
  const tower2Sources = rows.find(r => r.enBlockNumber === '2')?.sources ?? ''
  expect(tower2Sources).toContain('tower-2-201')
  expect(tower2Sources).toContain('tower-2-218')
  expect(tower2Sources).toContain('ss-27686a7f-a722-51a6-8afe-b00d61f44984')
  expect(tower2Sources).toContain('ss-65537b62-a551-5834-9c81-ea327319d269')
})

test('April reconciliation keeps 6 On Wah as a shop sub-premises under the building range', () => {
  const rows = [
    row({
      id: 'ss-c7c08354-46fb-51ff-9c97-7819d79568e6',
      csu: '4037420364T20241122',
      building: 'SIU KING BUILDING',
      street: 'ON WAH STREET',
      streetNumber: '6',
    }),
    row({
      id: 'ss-9f77c50f-9932-532a-89c3-47efffeba555',
      csu: '4036720375T20050430',
      building: 'SIU KING BUILDING',
      street: 'ON WAH STREET',
      streetNumber: '6',
    }),
  ]

  // Earlier retention may already resolve the predecessor to its canonical ID.
  rows[1]!.identityAlias = rows[1]!.id
  applyAprilReviewedAlsReconciliations(rows, '2025-05-22.0')

  expect(rows.map(r => r.id).sort()).toEqual([
    'ss-2350ce85-0f68-5839-89d5-94086500dbe6',
    'ss-33e5d265-1d22-52e6-9155-4e439e59558d',
    'ss-9f77c50f-9932-532a-89c3-47efffeba555',
    'ss-f5947d7b-082e-50cb-91da-dd6269799604',
  ])
  const shop = rows.find(r => r.curatedGranularity === 'unit')!
  expect(
    JSON.parse(shop.sources).hkgovAlsReviewedIdentityCoalescence?.aliasIds ?? [],
  ).not.toContain(shop.id)
  expect(JSON.parse(shop.sources).reviewedIdentityAliases ?? []).not.toContain(shop.id)
  expect(shop.identityAlias).not.toBe(shop.id)
  expect(shop.parentAddressId).toBe('ss-33e5d265-1d22-52e6-9155-4e439e59558d')
  expect(shop.enStreetNumberFrom).toBe('6')
  expect(shop.enBuildingName).toBeNull()
  expect(shop.enFormattedAddress?.startsWith('6 ON WAH STREET')).toBe(true)
  expect(shop.sources).toContain('4036720375T20050430')
  expect(
    rows.find(r => r.id === 'ss-33e5d265-1d22-52e6-9155-4e439e59558d'),
  ).toMatchObject({
    enStreetNumberFrom: '2',
    enStreetNumberTo: '8',
    curatedGranularity: 'building',
  })
})

const applyAprilReviewedAlsReconciliations = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) => {
  applyReviewedAlsParents(
    rows,
    version,
    'initial-hierarchy',
    'hkgov-dpo-address-april-deletion-retentions',
  )
  applyAprilReviewedAlsReconciliationsSpecialised(rows, version)
}
