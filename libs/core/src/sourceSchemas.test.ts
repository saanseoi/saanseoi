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
