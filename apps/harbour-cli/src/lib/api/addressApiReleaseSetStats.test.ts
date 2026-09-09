import { expect, test } from 'bun:test'
import {
  buildAddressStatsChurn,
  previousAddressStatsRelease,
  type AddressStatsRelease,
  type AddressStatsSnapshot,
} from './addressApiReleaseSetStats'

const snapshot = (
  address2d: Array<[string, string]>,
  address3d: Array<[string, string]> = [],
) =>
  ({
    address2d: new Map(
      address2d.map(([id, churnHash]) => [
        id,
        {
          churnHash,
          id,
          localisedRows: [],
          parentId: null,
          geometry: null,
          type: 'address2d',
        },
      ]),
    ),
    address3d: new Map(
      address3d.map(([id, churnHash]) => [
        id,
        {
          churnHash,
          id,
          localisedRows: [],
          parentId: null,
          geometry: null,
          type: 'address3d',
        },
      ]),
    ),
  }) satisfies AddressStatsSnapshot

test('reports address churn against the preceding immutable snapshot', () => {
  const churn = buildAddressStatsChurn(
    snapshot(
      [
        ['kept', 'v1'],
        ['changed', 'v2'],
        ['added', 'v1'],
      ],
      [
        ['collection-kept', 'v1'],
        ['collection-added', 'v1'],
      ],
    ),
    snapshot(
      [
        ['kept', 'v1'],
        ['changed', 'v1'],
        ['removed', 'v1'],
      ],
      [
        ['collection-kept', 'v1'],
        ['collection-removed', 'v1'],
      ],
    ),
  )

  expect(churn.totals).toEqual({
    count: 3,
    added_count: 1,
    changed_count: 1,
    removed_count: 1,
    unchanged_count: 1,
  })
  expect(churn.address2d).toEqual(churn.totals)
  expect(churn.address3d).toEqual({
    count: 2,
    added_count: 1,
    changed_count: 0,
    removed_count: 1,
    unchanged_count: 1,
  })
})

test('uses only the preceding release in the same API, domain and region', () => {
  const release = (id: string, extra: Partial<AddressStatsRelease> = {}) =>
    ({
      apiVersionId: 'address-v1',
      code: id,
      domainCode: 'saanseoi',
      id,
      regionCode: 'hk',
      revision: 0,
      snapshotId: `${id}-snapshot`,
      ...extra,
    }) satisfies AddressStatsRelease
  const releases = [
    release('first'),
    release('other-domain', { domainCode: 'other' }),
    release('second'),
  ]

  expect(previousAddressStatsRelease(releases, 'first')).toBeUndefined()
  expect(previousAddressStatsRelease(releases, 'second')?.id).toBe('first')
})
