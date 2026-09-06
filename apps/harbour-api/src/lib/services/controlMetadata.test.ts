import { describe, expect, test } from 'bun:test'

import { resolvePublishedSnapshotMetadataDeltas } from './controlMetadata'

describe('resolvePublishedSnapshotMetadataDeltas', () => {
  test('batches large snapshot metadata lookups within D1 limits', async () => {
    const snapshotIds = Array.from({ length: 200 }, (_, index) => `snapshot-${index}`)
    let allCalls = 0

    const db = {
      select() {
        const query = {
          all: async () => {
            const offset = allCalls * 99
            allCalls += 1
            return snapshotIds.slice(offset, offset + 99).map(id => ({
              id,
              publishedAt: '2026-09-07T00:00:00.000Z',
              status: 'published',
              validFrom: '2026-09-07T00:00:00.000Z',
              validTo: null,
            }))
          },
          from() {
            return query
          },
          where() {
            return query
          },
        }

        return query
      },
    }

    const result = await resolvePublishedSnapshotMetadataDeltas(
      db as never,
      snapshotIds,
    )

    expect(allCalls).toBe(3)
    expect(result).toHaveLength(200)
    expect(result[199]?.id).toBe('snapshot-199')
  })
})
