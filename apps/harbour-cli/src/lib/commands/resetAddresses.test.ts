import { describe, expect, test } from 'bun:test'

import { resolveOwnedMaterialisedDivisionSnapshotIds } from './resetAddresses.ts'

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
})
