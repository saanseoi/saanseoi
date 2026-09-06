import { describe, expect, test } from 'bun:test'

import { metaSchema } from '@repo/db'

import { listRegistrySourcesPage } from './metaRegistry'

describe('listRegistrySourcesPage', () => {
  test('batches source-release lookups for the maximum directory page', async () => {
    const sources = Array.from({ length: 200 }, (_, index) => ({
      id: `dataset-${index}`,
      publisherId: 'publisher-1',
    }))
    let allCalls = 0

    const db = {
      select() {
        let table: unknown
        const query = {
          all: async () => {
            allCalls += 1

            if (table === metaSchema.metaDatasets) return sources

            return []
          },
          from(nextTable: unknown) {
            table = nextTable
            return query
          },
          innerJoin() {
            return query
          },
          leftJoin() {
            return query
          },
          limit() {
            return query
          },
          orderBy() {
            return query
          },
          where() {
            return query
          },
        }

        return query
      },
    }

    const result = await listRegistrySourcesPage(db as never)

    expect(result).toHaveLength(200)
    expect(allCalls).toBe(11)
  })
})
