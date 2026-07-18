import { describe, expect, test } from 'bun:test'

import {
  bridgeMapFromFile,
  buildHkgovAlsIdentityKey,
  buildHkgovAlsProvisionalId,
  mergePersistedHkgovAlsAliases,
  normalizeHkgovAlsMatchNumber,
  resolveHkgovAlsIdentities,
} from './hkgovAlsIdentity.ts'

const als = {
  buildingIdentity: '3350116067T20050430',
  districtId: 'district-cw',
  latitude: 22.28348,
  longitude: 114.15002,
  numberFrom: '58',
  numberTo: null,
  routeNames: ['BRIDGES STREET', '必列者士街'],
}

describe('HKGov ALS identity resolution', () => {
  test('builds stable ss-prefixed UUIDv5 identities', () => {
    const key = buildHkgovAlsIdentityKey(als)

    expect(buildHkgovAlsProvisionalId(key)).toBe(
      buildHkgovAlsProvisionalId(buildHkgovAlsIdentityKey({ ...als })),
    )
    expect(buildHkgovAlsProvisionalId(key)).toMatch(
      /^ss-[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(
      buildHkgovAlsProvisionalId(
        buildHkgovAlsIdentityKey({
          ...als,
          districtId: 'renamed-district',
          routeNames: ['RENAMED STREET', '重新命名街道'],
        }),
      ),
    ).toBe(buildHkgovAlsProvisionalId(key))
  })

  test('prefers a unique address and coordinate GERS match', () => {
    const result = resolveHkgovAlsIdentities(
      [als],
      [
        {
          canonicalId: '04bb2336-9590-449b-b6dd-57e22a0462f1',
          districtId: 'district-cw',
          latitude: 22.28348,
          longitude: 114.15002,
          streetName: 'Bridges Street',
          streetNumber: '58',
        },
      ],
    )

    expect(result.resolutions[0]).toMatchObject({
      canonicalId: '04bb2336-9590-449b-b6dd-57e22a0462f1',
      matchMethod: 'overture-address-coordinate',
    })
    expect(result.resolutions[0]?.identityAlias).toMatch(/^ss-/)
  })

  test('matches an ALS range by its first number while retaining range identity', () => {
    const rangedAls = { ...als, numberFrom: '23', numberTo: '25' }
    const result = resolveHkgovAlsIdentities(
      [rangedAls],
      [
        {
          canonicalId: 'gers-23',
          districtId: 'district-cw',
          latitude: 22.28348,
          longitude: 114.15002,
          streetName: 'Bridges Street',
          streetNumber: '23',
        },
      ],
    )

    expect(result.resolutions[0]).toMatchObject({
      canonicalId: 'gers-23',
      matchMethod: 'overture-address-coordinate',
    })
    expect(buildHkgovAlsIdentityKey(rangedAls)).not.toBe(
      buildHkgovAlsIdentityKey({ ...rangedAls, numberTo: null }),
    )
  })

  test('uses the first component of slash and dash number forms', () => {
    expect(normalizeHkgovAlsMatchNumber('23/24')).toBe('23')
    expect(normalizeHkgovAlsMatchNumber('23-25')).toBe('23')
    expect(normalizeHkgovAlsMatchNumber('152A–152D')).toBe('152A')
  })

  test('keeps ambiguous matches provisional', () => {
    const overtureBase = {
      districtId: 'district-cw',
      latitude: 22.28348,
      longitude: 114.15002,
      streetName: 'Bridges Street',
      streetNumber: '58',
    }
    const result = resolveHkgovAlsIdentities(
      [als],
      [
        { ...overtureBase, canonicalId: 'gers-1' },
        { ...overtureBase, canonicalId: 'gers-2' },
      ],
    )

    expect(result.resolutions[0]?.matchMethod).toBe('provisional')
    expect(result.stats.ambiguous).toBe(1)
    expect(result.diagnostics[0]).toMatchObject({
      candidateCount: 2,
      kind: 'near-match',
      reasons: ['multiple-address-coordinate-candidates'],
    })
  })

  test('reports a true no-match separately from rejected candidates', () => {
    const result = resolveHkgovAlsIdentities([{ ...als, routeNames: [] }], [])

    expect(result.diagnostics[0]).toMatchObject({
      candidateCount: 0,
      kind: 'no-match',
      reasons: ['missing-route', 'no-overture-candidate'],
    })
  })

  test('reuses a future reviewed bridge for historical ALS rows', () => {
    const identityKey = buildHkgovAlsIdentityKey(als)
    const bridge = bridgeMapFromFile({
      authority: 'hkgov-dpo',
      generatedAt: '2026-07-18T00:00:00.000Z',
      mappings: [
        {
          canonicalId: 'gers-from-future-release',
          identityKey,
          matchMethod: 'overture-address-coordinate',
        },
      ],
      overtureRelease: '2025-09-24.0',
      version: 1,
    })
    const result = resolveHkgovAlsIdentities([als], [], bridge)

    expect(result.resolutions[0]).toMatchObject({
      canonicalId: 'gers-from-future-release',
      matchMethod: 'bridge',
    })
  })

  test('reuses a permanent registry alias on a later release', () => {
    const identityKey = buildHkgovAlsIdentityKey(als)
    const bridge = mergePersistedHkgovAlsAliases([als], new Map(), [
      {
        aliasValue: buildHkgovAlsProvisionalId(identityKey),
        canonicalId: 'gers-from-registry',
      },
    ])

    expect(resolveHkgovAlsIdentities([als], [], bridge).resolutions[0]).toMatchObject({
      canonicalId: 'gers-from-registry',
      matchMethod: 'bridge',
    })
  })
})
