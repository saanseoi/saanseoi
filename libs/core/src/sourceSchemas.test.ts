import { describe, expect, test } from 'bun:test'

import {
  assertKnownSafeSourceRelease,
  getLatestKnownSafeOvertureRelease,
  resolveSourceSchemaVersion,
} from './sourceSchemas'

describe('sourceSchemas', () => {
  test('resolves the mapped Overture source schema version', async () => {
    await expect(
      resolveSourceSchemaVersion({
        source: 'overture',
        sourceVersion: '2025-09-24.0',
      }),
    ).resolves.toBe('1.12.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'overture',
        sourceVersion: '2026-07-22.0',
      }),
    ).resolves.toBe('1.18.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'overture',
        sourceVersion: '2026-08-19.0',
      }),
    ).resolves.toBe('1.18.0')
  })

  test('resolves the mapped HAD source schema version by source release', async () => {
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-had',
        sourceVersion: '2022',
      }),
    ).resolves.toBe('1.2')
  })

  test('uses the stable LandsD Place Name schema profile for dated releases', async () => {
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-landsd',
        sourceVersion: '2026-06-10.0',
      }),
    ).resolves.toBe('1.0')
  })

  test('resolves C&SD source schema versions', async () => {
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-censtatd',
        sourceVersion: '2016',
      }),
    ).resolves.toBe('1.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-censtatd',
        sourceVersion: '2021',
      }),
    ).resolves.toBe('1.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-censtatd',
        sourceVersion: '2022',
      }),
    ).resolves.toBe('1.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-censtatd',
        sourceVersion: '2023-H2',
      }),
    ).resolves.toBe('1.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-censtatd',
        sourceVersion: '2024',
      }),
    ).resolves.toBe('1.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-censtatd',
        sourceVersion: '2026-Q2',
      }),
    ).resolves.toBe('1.0')
  })

  test('resolves observed Planning Department TPU and New Town profiles', async () => {
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-pland-pu',
        sourceVersion: '2021',
      }),
    ).resolves.toBe('2.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-pland-new-town',
        sourceVersion: '2021',
      }),
    ).resolves.toBe('1.0')
  })

  test('rejects an unmapped HAD source release', async () => {
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-had',
        sourceVersion: '2026',
      }),
    ).rejects.toThrow('No hkgov-had source schema mapping found')
  })

  test('accepts the mapped latest Overture release as known safe', async () => {
    const latestKnownSafe = getLatestKnownSafeOvertureRelease()

    await expect(
      assertKnownSafeSourceRelease({
        source: 'overture',
        sourceVersion: '2026-08-19.0',
      }),
    ).resolves.toBeUndefined()

    expect(latestKnownSafe?.version).toBe('2026-08-19.0')
  })

  test('rejects unmapped older Overture releases as not known safe', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = Object.assign(async () => new Response(null, { status: 404 }), {
      preconnect: originalFetch.preconnect,
    })

    try {
      await expect(
        assertKnownSafeSourceRelease({
          source: 'overture',
          sourceVersion: '2025-07-30.0',
        }),
      ).rejects.toThrow(
        `Overture sourceVersion 2025-07-30.0 is not marked as a known safe release.`,
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
