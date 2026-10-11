import { describe, expect, test } from 'bun:test'

import { metaSchema } from '@repo/db'

import {
  getRegistrySourceRelease,
  listCurrentSnapshotCleanupCandidates,
  listRegistrySourcesPage,
} from './metaRegistry'

describe('listRegistrySourcesPage', () => {
  test('batches source-release lookups for the maximum directory page', async () => {
    const sources = Array.from({ length: 200 }, (_, index) => ({
      id: `dataset-${index}`,
      publisherId: 'publisher-1',
      i18n: [],
      publisherI18n: [],
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
    expect(allCalls).toBe(4)
  })

  test('batches explicit snapshot cleanup candidates within D1 limits', async () => {
    const snapshotIds = Array.from({ length: 200 }, (_, index) => `snapshot-${index}`)
    let allCalls = 0

    const db = {
      select() {
        let table: unknown
        const query = {
          all: async () => {
            if (table === metaSchema.metaSnapshots) {
              const offset = allCalls * 99
              allCalls += 1
              return snapshotIds.slice(offset, offset + 99).map(snapshotId => ({
                snapshotId,
                resourceType: 'division',
              }))
            }

            allCalls += 1
            return []
          },
          from(nextTable: unknown) {
            table = nextTable
            return query
          },
          innerJoin() {
            return query
          },
          where() {
            return query
          },
        }

        return query
      },
    }

    const result = await listCurrentSnapshotCleanupCandidates(db as never, {
      snapshotIds,
    })

    expect(allCalls).toBe(4)
    expect(result).toHaveLength(200)
    expect(result[199]?.snapshotId).toBe('snapshot-199')
  })
})

describe('getRegistrySourceRelease resources content', () => {
  test('loads selectable resources without loading statistics or API releases', async () => {
    const queriedTables: unknown[] = []
    const resources = (['division', 'divisionArea', 'divisionBoundary'] as const).map(
      resourceType => ({
        id: `resource-${resourceType}`,
        sourceReleaseId: 'release-1',
        resourceType,
        status: 'current' as const,
      }),
    )
    const db = {
      select() {
        let table: unknown
        const query = {
          from(value: unknown) {
            table = value
            queriedTables.push(value)
            return query
          },
          innerJoin() {
            return query
          },
          leftJoin() {
            return query
          },
          where() {
            return query
          },
          limit() {
            return query
          },
          orderBy() {
            return query
          },
          async get() {
            if (table === metaSchema.metaDatasets)
              return { id: 'dataset-1', publisherId: 'publisher-1', i18n: {} }
            if (table === metaSchema.metaPublishers)
              return { id: 'publisher-1', i18n: {} }
            return null
          },
          async all() {
            if (table === metaSchema.metaSourceReleases)
              return [{ id: 'release-1', datasetId: 'dataset-1' }]
            if (table === metaSchema.metaResourceReleases) return resources
            return []
          },
        }
        return query
      },
    }
    const result = await getRegistrySourceRelease(
      db as never,
      'dataset-1',
      'release-1',
      { content: 'resources' },
    )
    expect(result?.sourceVersions[0]?.resources).toEqual(
      resources.map(({ sourceReleaseId, ...resource }) => ({ ...resource, stats: [] })),
    )
    expect(queriedTables).toContain(metaSchema.metaResourceReleases)
    expect(queriedTables).not.toContain(metaSchema.stats)
    expect(queriedTables).not.toContain(metaSchema.metaApiReleaseSets)
  })
})
