import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-unnamed-premise-suppressions.json'
import { suppressAlsUnnamedPremises } from './hkgovAlsUnnamedPremiseSuppressions'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const decision = fixture.suppressions[0]
if (!decision) throw new Error('Missing unnamed-premise suppression fixture')

const owner = {
  id: 'owner',
  canonicalId: 'owner',
  hkgovCsuId: decision.owner.csu,
  enEstateName: decision.estate,
  zhHantEstateName: decision.zhHantEstateName,
  enBuildingName: decision.owner.enBuildingName,
  zhHantBuildingName: decision.owner.zhHantBuildingName,
  sources: '{}',
} as PreparedHkgovAlsRow

const duplicate = {
  id: 'duplicate',
  canonicalId: 'duplicate',
  hkgovCsuId: decision.duplicate.csu,
  enEstateName: decision.estate,
  zhHantEstateName: decision.zhHantEstateName,
  enBuildingName: null,
  zhHantBuildingName: null,
  enBlockNumber: null,
  zhHantBlockNumber: null,
  enStreetNumberFrom: decision.duplicate.streetNumber,
  zhHantStreetNumberFrom: decision.duplicate.streetNumber,
  enStreetName: decision.duplicate.enStreetNames[0],
  zhHantStreetName: decision.duplicate.zhHantStreetNames[0],
  geometry: JSON.stringify({
    type: 'Point',
    coordinates: decision.duplicate.coordinates[0],
  }),
  sources: '{}',
  engPremisesAddressJson: null,
  chiPremisesAddressJson: null,
} as PreparedHkgovAlsRow

test('suppresses only the reviewed unnamed Lei Moon duplicate and retains it as evidence', () => {
  const rows = [structuredClone(owner), structuredClone(duplicate)]
  expect(suppressAlsUnnamedPremises(rows, '2025-02-25.0')).toEqual({ suppressed: 1 })
  expect(rows).toHaveLength(1)
  const retained = rows[0]
  if (!retained) throw new Error('Missing retained Lei Moon House row')
  expect(
    JSON.parse(retained.sources).hkgovAlsUnnamedPremiseSuppression.suppressedAddress,
  ).toMatchObject({ addressId: 'duplicate', canonicalId: 'duplicate' })
})

test('does not suppress outside its dates and fails closed when the source point changes', () => {
  const rows = [structuredClone(owner), structuredClone(duplicate)]
  expect(suppressAlsUnnamedPremises(rows, '2025-02-24.0')).toEqual({ suppressed: 0 })
  const changed = [structuredClone(owner), structuredClone(duplicate)]
  const changedDuplicate = changed[1]
  if (!changedDuplicate) throw new Error('Missing duplicate test row')
  changedDuplicate.geometry = JSON.stringify({ type: 'Point', coordinates: [0, 0] })
  expect(() => suppressAlsUnnamedPremises(changed, '2025-02-25.0')).toThrow(
    'source point changed',
  )
})
