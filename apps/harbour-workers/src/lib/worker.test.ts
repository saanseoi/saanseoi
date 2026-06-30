import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { ProcessDatasetResult } from './services/division'
import { createProcessDatasetMessage } from './worker'

const originalConsoleInfo = console.info
const originalConsoleError = console.error

beforeEach(() => {
  console.info = mock(() => undefined) as typeof console.info
  console.error = mock(() => undefined) as typeof console.error
})

afterEach(() => {
  console.info = originalConsoleInfo
  console.error = originalConsoleError
})

describe('processDatasetMessage', () => {
  test('processes division datasets and reports stage state through the control API', async () => {
    const processDivisionDataset = mock(
      async () =>
        ({
          deletedRows: 1,
          insertedVersions: 2,
          localizedRows: 4,
          processedRows: 2,
          statsRows: 12,
          unchangedRows: 0,
        }) satisfies ProcessDatasetResult,
    )
    const stageRunning = mock(async () => undefined)
    const stageCompleted = mock(async () => undefined)
    const stageFailed = mock(async () => undefined)
    const publishDataset = mock(async () => undefined)
    const processDatasetMessage = createProcessDatasetMessage(
      mock(async () => {
        throw new Error('address processor should not be called')
      }) as never,
      processDivisionDataset as never,
    )

    const result = await processDatasetMessage(
      {
        publishDataset,
        stageCompleted,
        stageFailed,
        stageRunning,
      },
      {} as never,
      {} as never,
      {} as never,
      {
        async head() {
          return { size: 1 }
        },
        async get() {
          return {
            async arrayBuffer() {
              return new ArrayBuffer(0)
            },
          }
        },
      },
      {
        datasetId: 'overture-hk-2026-05-24.0-division',
        releaseCode: 'overture-hk-2026-05-24.0-division',
        releaseId: 'release-overture-hk-2026-05-24.0-division',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        regionCode: 'hk',
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        theme: 'divisions',
        type: 'division',
      },
    )

    expect(result).toEqual({
      deletedRows: 1,
      insertedVersions: 2,
      localizedRows: 4,
      processedRows: 2,
      statsRows: 12,
      unchangedRows: 0,
    })
    expect(processDivisionDataset).toHaveBeenCalledTimes(1)
    expect(
      stageRunning.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['release-overture-hk-2026-05-24.0-division', 'processDataset'],
      ['release-overture-hk-2026-05-24.0-division', 'extractDivisions'],
      ['release-overture-hk-2026-05-24.0-division', 'extractDivisionsI18n'],
      ['release-overture-hk-2026-05-24.0-division', 'publishDataset'],
    ])
    expect(
      stageCompleted.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['release-overture-hk-2026-05-24.0-division', 'extractDivisions'],
      ['release-overture-hk-2026-05-24.0-division', 'extractDivisionsI18n'],
      ['release-overture-hk-2026-05-24.0-division', 'publishDataset'],
      ['release-overture-hk-2026-05-24.0-division', 'processDataset'],
    ])
    expect(publishDataset).toHaveBeenCalledWith(
      'release-overture-hk-2026-05-24.0-division',
      'overture-hk-2026-05-24.0-division',
    )
    expect(stageFailed).toHaveBeenCalledTimes(0)
  })

  test('processes address datasets and reports address-specific stage state', async () => {
    const processAddressDataset = mock(async () => ({
      deletedRows: 0,
      insertedVersions: 3,
      localizedRows: 3,
      processedRows: 3,
      statsRows: 0,
      unchangedRows: 0,
    }))
    const stageRunning = mock(async () => undefined)
    const stageCompleted = mock(async () => undefined)
    const stageFailed = mock(async () => undefined)
    const publishDataset = mock(async () => undefined)
    const processDatasetMessage = createProcessDatasetMessage(
      processAddressDataset as never,
      mock(async () => {
        throw new Error('division processor should not be called')
      }) as never,
    )

    const result = await processDatasetMessage(
      {
        publishDataset,
        stageCompleted,
        stageFailed,
        stageRunning,
      },
      {} as never,
      {} as never,
      {} as never,
      {
        async head() {
          return { size: 1 }
        },
        async get() {
          return {
            async arrayBuffer() {
              return new ArrayBuffer(0)
            },
          }
        },
      },
      {
        datasetId: 'overture-hk-2025-10-22.0-address',
        releaseCode: 'overture-hk-2025-10-22.0-address',
        releaseId: 'release-overture-hk-2025-10-22.0-address',
        rawObjectKey: 'hk/overture/2025-10-22.0/address.parquet',
        regionCode: 'hk',
        cohortKey: '2025-10',
        source: 'overture',
        sourceVersion: '2025-10-22.0',
        theme: 'addresses',
        type: 'address',
      },
    )

    expect(result).toEqual({
      deletedRows: 0,
      insertedVersions: 3,
      localizedRows: 3,
      processedRows: 3,
      statsRows: 0,
      unchangedRows: 0,
    })
    expect(
      stageRunning.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['release-overture-hk-2025-10-22.0-address', 'processDataset'],
      ['release-overture-hk-2025-10-22.0-address', 'extractAddresses'],
      ['release-overture-hk-2025-10-22.0-address', 'extractAddressesI18n'],
      ['release-overture-hk-2025-10-22.0-address', 'publishDataset'],
    ])
    expect(
      stageCompleted.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['release-overture-hk-2025-10-22.0-address', 'extractAddresses'],
      ['release-overture-hk-2025-10-22.0-address', 'extractAddressesI18n'],
      ['release-overture-hk-2025-10-22.0-address', 'publishDataset'],
      ['release-overture-hk-2025-10-22.0-address', 'processDataset'],
    ])
    expect(publishDataset).toHaveBeenCalledWith(
      'release-overture-hk-2025-10-22.0-address',
      'overture-hk-2025-10-22.0-address',
    )
    expect(stageFailed).toHaveBeenCalledTimes(0)
  })

  test('reports running extract progress back through repeated stageRunning calls', async () => {
    const processDivisionDataset = mock(async (...args: unknown[]) => {
      const reportProgress = args[6] as
        | ((stats: { localizedRows: number; processedRows: number }) => Promise<void>)
        | undefined

      await reportProgress?.({
        localizedRows: 2,
        processedRows: 1,
      })

      return {
        deletedRows: 0,
        insertedVersions: 1,
        localizedRows: 2,
        processedRows: 1,
        statsRows: 0,
        unchangedRows: 0,
      } satisfies ProcessDatasetResult
    })
    const stageRunning = mock(async () => undefined)
    const stageCompleted = mock(async () => undefined)
    const stageFailed = mock(async () => undefined)
    const publishDataset = mock(async () => undefined)
    const processDatasetMessage = createProcessDatasetMessage(
      mock(async () => {
        throw new Error('address processor should not be called')
      }) as never,
      processDivisionDataset as never,
    )

    await processDatasetMessage(
      {
        publishDataset,
        stageCompleted,
        stageFailed,
        stageRunning,
      },
      {} as never,
      {} as never,
      {} as never,
      {
        async head() {
          return { size: 1 }
        },
        async get() {
          return {
            async arrayBuffer() {
              return new ArrayBuffer(0)
            },
          }
        },
      },
      {
        datasetId: 'overture-hk-2026-05-24.0-division',
        releaseCode: 'overture-hk-2026-05-24.0-division',
        releaseId: 'release-overture-hk-2026-05-24.0-division',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        regionCode: 'hk',
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        theme: 'divisions',
        type: 'division',
      },
    )

    expect(stageRunning).toHaveBeenCalledWith(
      'release-overture-hk-2026-05-24.0-division',
      'extractDivisions',
      {
        processedRows: 1,
      },
      'overture-hk-2026-05-24.0-division',
    )
  })

  test('attempts to mark every active phase failed even if one cleanup callback throws', async () => {
    const processDivisionDataset = mock(async () => {
      throw new Error('Division processing blew up.')
    })
    const stageRunning = mock(async () => undefined)
    const stageCompleted = mock(async () => undefined)
    const stageFailed = mock(async (_releaseId: string, phase: string) => {
      if (phase === 'extractDivisions') {
        throw new Error('Control API temporarily unavailable.')
      }
    })
    const publishDataset = mock(async () => undefined)
    const processDatasetMessage = createProcessDatasetMessage(
      mock(async () => {
        throw new Error('address processor should not be called')
      }) as never,
      processDivisionDataset as never,
    )

    await expect(
      processDatasetMessage(
        {
          publishDataset,
          stageCompleted,
          stageFailed,
          stageRunning,
        },
        {} as never,
        {} as never,
        {} as never,
        {
          async head() {
            return { size: 1 }
          },
          async get() {
            return {
              async arrayBuffer() {
                return new ArrayBuffer(0)
              },
            }
          },
        },
        {
          datasetId: 'overture-hk-2026-05-24.0-division',
          releaseCode: 'overture-hk-2026-05-24.0-division',
          releaseId: 'release-overture-hk-2026-05-24.0-division',
          rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
          regionCode: 'hk',
          cohortKey: '2026-05',
          source: 'overture',
          sourceVersion: '2026-05-24.0',
          theme: 'divisions',
          type: 'division',
        },
      ),
    ).rejects.toThrow('cleanup was incomplete')

    expect(
      stageFailed.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['release-overture-hk-2026-05-24.0-division', 'extractDivisions'],
      ['release-overture-hk-2026-05-24.0-division', 'extractDivisionsI18n'],
      ['release-overture-hk-2026-05-24.0-division', 'processDataset'],
    ])
  })

  test('marks processDataset failed when the initial running callback throws', async () => {
    const stageRunning = mock(async (_releaseId: string, phase: string) => {
      if (phase === 'processDataset') {
        throw new Error('Control API temporarily unavailable.')
      }
    })
    const stageCompleted = mock(async () => undefined)
    const stageFailed = mock(async () => undefined)
    const publishDataset = mock(async () => undefined)
    const processDatasetMessage = createProcessDatasetMessage(
      mock(async () => {
        throw new Error('address processor should not be called')
      }) as never,
      mock(async () => {
        throw new Error('division processor should not be called')
      }) as never,
    )

    await expect(
      processDatasetMessage(
        {
          publishDataset,
          stageCompleted,
          stageFailed,
          stageRunning,
        },
        {} as never,
        {} as never,
        {} as never,
        {
          async head() {
            return { size: 1 }
          },
          async get() {
            return {
              async arrayBuffer() {
                return new ArrayBuffer(0)
              },
            }
          },
        },
        {
          datasetId: 'overture-hk-2026-05-24.0-division',
          releaseCode: 'overture-hk-2026-05-24.0-division',
          releaseId: 'release-overture-hk-2026-05-24.0-division',
          rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
          regionCode: 'hk',
          cohortKey: '2026-05',
          source: 'overture',
          sourceVersion: '2026-05-24.0',
          theme: 'divisions',
          type: 'division',
        },
      ),
    ).rejects.toThrow('Control API temporarily unavailable.')

    expect(stageFailed).toHaveBeenCalledWith(
      'release-overture-hk-2026-05-24.0-division',
      'processDataset',
      'Control API temporarily unavailable.',
      undefined,
      'overture-hk-2026-05-24.0-division',
    )
    expect(stageCompleted).toHaveBeenCalledTimes(0)
    expect(publishDataset).toHaveBeenCalledTimes(0)
  })
})
