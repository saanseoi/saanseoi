import { describe, expect, test } from 'bun:test'

import {
  resolveOwnedMaterialisedDivisionSnapshotIds,
  selectOwnedOfficialAddressApiReleaseSetIds,
  selectOwnedOfficialAddressSnapshotIds,
} from './resetAddresses.ts'

describe('official address reset ownership', () => {
  test('includes division projections created after the address baseline', () => {
    expect(
      resolveOwnedMaterialisedDivisionSnapshotIds(
        ['baseline', 'created-by-address-init-1', 'created-by-address-init-2'],
        ['baseline'],
      ),
    ).toEqual(['created-by-address-init-1', 'created-by-address-init-2'])
  })

  test('does not claim division projections that predate the address baseline', () => {
    expect(
      resolveOwnedMaterialisedDivisionSnapshotIds(
        ['baseline', 'unrelated-current-projection'],
        ['baseline', 'unrelated-current-projection'],
      ),
    ).toEqual([])
  })

  test('owns only snapshots that use an ALS release as their primary source', () => {
    expect(
      selectOwnedOfficialAddressSnapshotIds([
        { id: 'official-address', role: 'primary' },
        { id: 'derived-address', role: 'lookup' },
        { id: 'derived-place', role: 'lookup' },
        { id: 'official-address', role: 'primary' },
      ]),
    ).toEqual(['official-address'])
  })

  test('owns only Address API release sets', () => {
    expect(
      selectOwnedOfficialAddressApiReleaseSetIds([
        { id: 'addresses', familyType: 'addresses' },
        { id: 'places', familyType: 'places' },
        { id: 'addresses', familyType: 'addresses' },
      ]),
    ).toEqual(['addresses'])
  })
})
