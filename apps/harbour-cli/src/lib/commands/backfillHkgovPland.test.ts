import { describe, expect, mock, test } from 'bun:test'

const preparedTypes: Array<{ sourceVersion: string; type: string }> = []
const uploadedTypes: Array<{ sourceVersion: string; type: string }> = []
let divisionPublishComplete = false

const prepareHkgovPlandTpuParquetMock = mock(
  async (options: { sourceVersion: string; type: string }) => {
    preparedTypes.push({ sourceVersion: options.sourceVersion, type: options.type })
  },
)

const runUploadCommandMock = mock(
  async (args: { options: { 'source-version'?: unknown; type?: unknown } }) => {
    const sourceVersion = String(args.options['source-version'])
    const type = String(args.options.type)
    uploadedTypes.push({ sourceVersion, type })

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
      { sourceVersion: '2001', type: 'division' },
      { sourceVersion: '2001', type: 'divisionArea' },
      { sourceVersion: '2006', type: 'division' },
      { sourceVersion: '2006', type: 'divisionArea' },
      { sourceVersion: '2011', type: 'division' },
      { sourceVersion: '2011', type: 'divisionArea' },
      { sourceVersion: '2016', type: 'division' },
      { sourceVersion: '2016', type: 'divisionArea' },
      { sourceVersion: '2021', type: 'division' },
      { sourceVersion: '2021', type: 'divisionArea' },
    ])
  })
})
