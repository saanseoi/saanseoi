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
  })

  test('resolves the mapped HAD source schema version by source release', async () => {
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-had',
        sourceVersion: '2022',
      }),
    ).resolves.toBe('1.2')
  })

  test('resolves C&SD source and display-derivative schema versions', async () => {
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-censtatd',
        sourceVersion: '2016',
      }),
    ).resolves.toBe('1.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-censtatd',
        sourceVersion: '2016-simplified-v1',
      }),
    ).resolves.toBe('1.0')
    await expect(
      resolveSourceSchemaVersion({
        source: 'hkgov-censtatd',
        sourceVersion: '2021-simplified-v1',
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

  test('rejects unknown newer Overture releases as not known safe', async () => {
    const latestKnownSafe = getLatestKnownSafeOvertureRelease()

    await expect(
      assertKnownSafeSourceRelease({
        source: 'overture',
        sourceVersion: '2026-06-24.0',
      }),
    ).rejects.toThrow(
      `Overture sourceVersion 2026-06-24.0 is not marked as a known safe release.`,
    )

    expect(latestKnownSafe?.version).toBe('2026-06-17.0')
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
