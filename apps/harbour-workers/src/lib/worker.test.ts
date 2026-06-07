import { describe, expect, mock, test } from 'bun:test'

import type { ProcessDatasetResult } from './services/division'
import { createProcessDatasetMessage } from './worker'

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
    const stageStarted = mock(async () => undefined)
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
        stageStarted,
      },
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
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
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
      stageStarted.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['overture-hk-2026-05-24.0-division', 'processDataset'],
      ['overture-hk-2026-05-24.0-division', 'extractDivisions'],
      ['overture-hk-2026-05-24.0-division', 'extractDivisionsI18n'],
      ['overture-hk-2026-05-24.0-division', 'publishDataset'],
    ])
    expect(
      stageCompleted.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['overture-hk-2026-05-24.0-division', 'extractDivisions'],
      ['overture-hk-2026-05-24.0-division', 'extractDivisionsI18n'],
      ['overture-hk-2026-05-24.0-division', 'publishDataset'],
      ['overture-hk-2026-05-24.0-division', 'processDataset'],
    ])
    expect(publishDataset).toHaveBeenCalledWith('overture-hk-2026-05-24.0-division')
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
    const stageStarted = mock(async () => undefined)
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
        stageStarted,
      },
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
        rawObjectKey: 'hk/overture/2025-10-22.0/address.parquet',
        regionCode: 'hk',
        snapshotMonth: '2025-10',
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
      stageStarted.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['overture-hk-2025-10-22.0-address', 'processDataset'],
      ['overture-hk-2025-10-22.0-address', 'extractAddresses'],
      ['overture-hk-2025-10-22.0-address', 'extractAddressesI18n'],
      ['overture-hk-2025-10-22.0-address', 'publishDataset'],
    ])
    expect(
      stageCompleted.mock.calls.map(call => call.slice(0, 2)) as unknown as Array<
        [string, string]
      >,
    ).toEqual([
      ['overture-hk-2025-10-22.0-address', 'extractAddresses'],
      ['overture-hk-2025-10-22.0-address', 'extractAddressesI18n'],
      ['overture-hk-2025-10-22.0-address', 'publishDataset'],
      ['overture-hk-2025-10-22.0-address', 'processDataset'],
    ])
    expect(publishDataset).toHaveBeenCalledWith('overture-hk-2025-10-22.0-address')
    expect(stageFailed).toHaveBeenCalledTimes(0)
  })
})
