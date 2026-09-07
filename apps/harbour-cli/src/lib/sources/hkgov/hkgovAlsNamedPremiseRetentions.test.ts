import { expect, test } from 'bun:test'
import { retainNamedPremises } from './hkgovAlsNamedPremiseRetentions'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const named = () =>
  ({
    id: 'source-named',
    canonicalId: 'source-named',
    identityBuildingId: '2819523425T20050430',
    identityKey: 'source-key',
    identityContinuityKey: 'source-key',
    identityMatchMethod: 'source',
    hkgovCsuId: '2819523425T20050430',
    geometry: JSON.stringify({ type: 'Point', coordinates: [114.09857, 22.3498] }),
    engPremisesAddressJson: JSON.stringify({
      BuildingName: 'CHEUNG HONG ESTATE COMMERCIAL CENTRE NO.2',
      EngEstate: { EstateName: 'CHEUNG HONG ESTATE' },
      EngStreet: { BuildingNoFrom: '12', StreetName: 'CHING HONG ROAD' },
      EngDistrict: 'KWAI TSING DISTRICT',
      Region: 'NT',
    }),
    chiPremisesAddressJson: JSON.stringify({
      Region: '新界',
      ChiDistrict: '葵青區',
      ChiStreet: { StreetName: '青康路', BuildingNoFrom: '12' },
      ChiEstate: { EstateName: '長康邨' },
      BuildingName: '長康邨第二商場',
    }),
    sources: '{}',
  }) as PreparedHkgovAlsRow

const duplicate = () =>
  ({
    ...named(),
    id: 'source-duplicate',
    canonicalId: 'source-duplicate',
    hkgovCsuId: '2820723422P20060103',
    geoAddress: '2819523425T20050430',
    geometry: JSON.stringify({ type: 'Point', coordinates: [114.09846, 22.34982] }),
    engPremisesAddressJson: JSON.stringify({
      EngBlock: { BlockDescriptor: 'COMMERCIAL COMPLEX' },
      EngEstate: { EstateName: 'CHEUNG HONG ESTATE' },
      EngStreet: {
        BuildingNoFrom: '12',
        StreetName: 'CHING HONG ROAD',
        LocationName: 'TSING YI',
      },
      EngDistrict: 'KWAI TSING DISTRICT',
      Region: 'NT',
    }),
    chiPremisesAddressJson: JSON.stringify({
      Region: '新界',
      ChiDistrict: '葵青區',
      ChiStreet: { LocationName: '青衣', StreetName: '青康路', BuildingNoFrom: '12' },
      ChiEstate: { EstateName: '長康邨' },
      ChiBlock: { BlockDescriptor: '商場' },
    }),
  }) as PreparedHkgovAlsRow

test('keeps the reviewed named premise and preserves the duplicate as provenance', () => {
  const owner = named(),
    duplicateRow = duplicate(),
    rows = [owner, duplicateRow]
  expect(retainNamedPremises(rows, '2025-04-26.0').suppressed).toBe(1)
  expect(rows).toEqual([owner])
  expect(owner.id).not.toBe('source-named')
  expect(owner.id).toMatch(/^ss-[0-9a-f-]{36}$/)
  expect(owner.canonicalId).toBe(owner.id)
  expect(owner.identityBuildingId).toBe(owner.id)
  expect(owner.identityAlias).toBe('source-named')
  const provenance = JSON.parse(owner.sources).hkgovAlsNamedPremiseRetention
  expect(provenance.suppressedAddress.addressId).toBe('source-duplicate')
  expect(provenance.suppressedAddress.engPremisesAddress.EngBlock.BlockDescriptor).toBe(
    'COMMERCIAL COMPLEX',
  )
})
test('refuses changed components or an unexpected duplicate multiplicity', () => {
  const owner = named()
  expect(() => retainNamedPremises([owner], '2025-04-26.0')).toThrow(
    'duplicate occurrence changed',
  )
  const changed = named()
  changed.geometry = JSON.stringify({ type: 'Point', coordinates: [0, 0] })
  expect(() => retainNamedPremises([changed], '2024-07-25.0')).toThrow(
    'components changed',
  )
})
