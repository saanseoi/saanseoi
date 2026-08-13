import { describe, expect, mock, test } from 'bun:test'
import { resolve } from 'node:path'

const preparedTypes: Array<{ sourceVersion: string; type: string }> = []
const preparedInputs: string[] = []
const uploadedTypes: Array<{
  skipSnapshotCleanup: boolean
  sourceVersion: string
  type: string
}> = []
let divisionPublishComplete = false

const prepareHkgovPlandTpuNativeShpZipMock = mock(
  async (options: { inputFile: string; sourceVersion: string; type: string }) => {
    preparedInputs.push(options.inputFile)
    preparedTypes.push({ sourceVersion: options.sourceVersion, type: options.type })
    return {
      divisionCount: 0,
      invalidSourceFeatureCount: 0,
      outputFile: '',
      sourceFeatureCount: 0,
    }
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

import { runHkgovPlandBackfillCommand } from './backfillHkgovPland.ts'

describe('Planning Department backfills', () => {
  test('publishes each division before attaching its division area', async () => {
    await runHkgovPlandBackfillCommand(
      {
        command: 'hkgov-pland:backfill',
        positionals: [],
        options: { target: 'preview' },
      },
      { environment: 'preview', remote: true },
      'pu',
      () => undefined,
      {
        prepareHkgovPlandTpuNativeShpZip: prepareHkgovPlandTpuNativeShpZipMock,
        runUploadCommand: runUploadCommandMock,
      },
    )

    expect(preparedTypes).toHaveLength(10)
    expect(preparedInputs[0]).toBe(
      resolve(
        import.meta.dir,
        '../../../../data/hkgov/csdi/archive/pland_rcd_1636535158118_80594/2023-Q4/source.zip',
      ),
    )
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

  test('continues a remote backfill from that target’s completed releases', async () => {
    const target = { environment: 'production' as const, remote: true }
    let completedTarget: unknown

    await runHkgovPlandBackfillCommand(
      {
        command: 'hkgov-pland:backfill',
        positionals: [],
        options: { continue: true, target: 'production' },
      },
      target,
      'pu',
      () => undefined,
      {
        getCompletedReleaseCodes: async receivedTarget => {
          completedTarget = receivedTarget
          return new Set([
            'dr-hk-hkgov-pland-division-pu-2001',
            'dr-hk-hkgov-pland-division-area-pu-2001',
            'dr-hk-hkgov-pland-division-pu-2006',
            'dr-hk-hkgov-pland-division-area-pu-2006',
            'dr-hk-hkgov-pland-division-pu-2011',
            'dr-hk-hkgov-pland-division-area-pu-2011',
            'dr-hk-hkgov-pland-division-pu-2016',
            'dr-hk-hkgov-pland-division-area-pu-2016',
            'dr-hk-hkgov-pland-division-pu-2021',
            'dr-hk-hkgov-pland-division-area-pu-2021',
          ])
        },
      },
    )

    expect(completedTarget).toEqual(target)
  })
})
