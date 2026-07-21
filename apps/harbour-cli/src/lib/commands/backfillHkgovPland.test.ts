import { describe, expect, mock, test } from 'bun:test'

const preparedTypes: Array<{ sourceVersion: string; type: string }> = []
const uploadedTypes: Array<{
  skipSnapshotCleanup: boolean
  sourceVersion: string
  type: string
}> = []
let divisionPublishComplete = false

const prepareHkgovPlandTpuParquetMock = mock(
  async (options: { sourceVersion: string; type: string }) => {
    preparedTypes.push({ sourceVersion: options.sourceVersion, type: options.type })
  },
)

const runUploadCommandMock = mock(
  async (
    _args: { options: { 'source-version'?: unknown; type?: unknown } },
    _target: unknown,
    options: { skipSnapshotCleanup: boolean },
  ) => {
    const sourceVersion = String(_args.options['source-version'])
    const type = String(_args.options.type)
    uploadedTypes.push({
      skipSnapshotCleanup: options.skipSnapshotCleanup,
      sourceVersion,
      type,
    })

    if (type === 'division') {
      await Promise.resolve()
      divisionPublishComplete = true
      return
    }

    expect(divisionPublishComplete).toBe(true)
    divisionPublishComplete = false
  },
)

mock.module('../hkgovPland.ts', () => ({
  prepareHkgovPlandTpuParquet: prepareHkgovPlandTpuParquetMock,
}))

mock.module('../hkgovPlandNewTown.ts', () => ({
  prepareHkgovPlandNewTownParquet: mock(async () => undefined),
}))

mock.module('./upload.ts', () => ({
  runUploadCommand: runUploadCommandMock,
}))

const { runHkgovPlandBackfillCommand } = await import('./backfillHkgovPland.ts')

describe('Planning Department backfills', () => {
  test('publishes each division before attaching its division area', async () => {
    await runHkgovPlandBackfillCommand(
      {
        command: 'backfill:hkgov-pland-pu',
        positionals: [],
        options: { target: 'preview' },
      },
      { environment: 'preview', remote: true },
      'pu',
      () => undefined,
    )

    expect(preparedTypes).toHaveLength(10)
    expect(uploadedTypes).toEqual([
      { skipSnapshotCleanup: true, sourceVersion: '2001', type: 'division' },
      { skipSnapshotCleanup: false, sourceVersion: '2001', type: 'divisionArea' },
      { skipSnapshotCleanup: true, sourceVersion: '2006', type: 'division' },
      { skipSnapshotCleanup: false, sourceVersion: '2006', type: 'divisionArea' },
      { skipSnapshotCleanup: true, sourceVersion: '2011', type: 'division' },
      { skipSnapshotCleanup: false, sourceVersion: '2011', type: 'divisionArea' },
      { skipSnapshotCleanup: true, sourceVersion: '2016', type: 'division' },
      { skipSnapshotCleanup: false, sourceVersion: '2016', type: 'divisionArea' },
      { skipSnapshotCleanup: true, sourceVersion: '2021', type: 'division' },
      { skipSnapshotCleanup: false, sourceVersion: '2021', type: 'divisionArea' },
    ])
  })
})
