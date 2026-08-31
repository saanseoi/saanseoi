import { describe, expect, mock, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const preparedTypes: Array<{ sourceVersion: string; type: string }> = []
const preparedInputs: string[] = []
const uploadedTypes: Array<{
  skipSnapshotCleanup: boolean
  sourceVersion: string
  type: string
}> = []
let divisionPublishComplete = false

const prepareHkgovPlandTpuNativeShpZipMock = mock(
  async (options: {
    inputFile: string
    outputFile: string
    sourceVersion: string
    type: string
  }) => {
    preparedInputs.push(options.inputFile)
    preparedTypes.push({ sourceVersion: options.sourceVersion, type: options.type })
    await mkdir(dirname(options.outputFile), { recursive: true })
    await writeFile(options.outputFile, 'prepared parquet')
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

import {
  runHkgovPlandBackfillCommand,
  runHkgovPlandNativeArchiveIngestCommand,
} from './backfillHkgovPland.ts'

describe('Planning Department backfills', () => {
  test('publishes each division before attaching its division area', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'hkgov-pland-cache-test-'))
    try {
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
          preparedArtefactCacheRoot: cacheRoot,
          runUploadCommand: runUploadCommandMock,
        },
      )
    } finally {
      await rm(cacheRoot, { force: true, recursive: true })
    }

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

  test('reuses verified prepared artefacts on a backfill retry', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'hkgov-pland-cache-test-'))
    const prepareCalls = prepareHkgovPlandTpuNativeShpZipMock.mock.calls.length
    try {
      const dependencies = {
        prepareHkgovPlandTpuNativeShpZip: prepareHkgovPlandTpuNativeShpZipMock,
        preparedArtefactCacheRoot: cacheRoot,
        runUploadCommand: runUploadCommandMock,
      }
      const args = {
        command: 'hkgov-pland:backfill' as const,
        positionals: [],
        options: { target: 'preview' },
      }
      const target = { environment: 'preview' as const, remote: true }

      await runHkgovPlandBackfillCommand(
        args,
        target,
        'pu',
        () => undefined,
        dependencies,
      )
      expect(prepareHkgovPlandTpuNativeShpZipMock.mock.calls.length).toBe(
        prepareCalls + 10,
      )
      await runHkgovPlandBackfillCommand(
        args,
        target,
        'pu',
        () => undefined,
        dependencies,
      )
      expect(prepareHkgovPlandTpuNativeShpZipMock.mock.calls.length).toBe(
        prepareCalls + 10,
      )
    } finally {
      await rm(cacheRoot, { force: true, recursive: true })
    }
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

  test('rejects an empty managed archive key before preparing or uploading', async () => {
    const prepareCalls = prepareHkgovPlandTpuNativeShpZipMock.mock.calls.length
    const uploadCalls = runUploadCommandMock.mock.calls.length

    await expect(
      runHkgovPlandNativeArchiveIngestCommand(
        {
          command: 'hkgov-pland:ingest',
          positionals: ['source.zip'],
          options: {
            'release-notes-url': 'https://example.com/catalogue',
            'source-archive-key': '',
            'source-archive-sha256': 'a'.repeat(64),
            'source-version': '2021',
          },
        },
        { environment: 'preview', remote: true },
        'pu',
        () => undefined,
        {
          prepareHkgovPlandTpuNativeShpZip: prepareHkgovPlandTpuNativeShpZipMock,
          runUploadCommand: runUploadCommandMock,
        },
      ),
    ).rejects.toThrow('requires <source.zip>')
    expect(prepareHkgovPlandTpuNativeShpZipMock).toHaveBeenCalledTimes(prepareCalls)
    expect(runUploadCommandMock).toHaveBeenCalledTimes(uploadCalls)
  })

  test('validates and preserves both managed archive provenance values', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'hkgov-pland-ingest-test-'))
    const archivePath = join(workDir, 'source.zip')
    const archive = new TextEncoder().encode('test archive')
    const sourceArchiveSha256 = createHash('sha256').update(archive).digest('hex')
    const uploads: Array<Record<string, unknown>> = []
    await writeFile(archivePath, archive)

    try {
      await runHkgovPlandNativeArchiveIngestCommand(
        {
          command: 'hkgov-pland:ingest',
          positionals: [archivePath],
          options: {
            'release-notes-url': 'https://example.com/catalogue',
            'source-archive-key': 'hkgov/csdi/source.zip',
            'source-archive-sha256': sourceArchiveSha256,
            'source-version': '2021',
          },
        },
        { environment: 'preview', remote: true },
        'pu',
        () => undefined,
        {
          prepareHkgovPlandTpuNativeShpZip: prepareHkgovPlandTpuNativeShpZipMock,
          runUploadCommand: mock(async args => {
            uploads.push(args.options)
          }) as typeof runUploadCommandMock,
        },
      )
    } finally {
      await rm(workDir, { force: true, recursive: true })
    }

    expect(uploads).toHaveLength(2)
    for (const options of uploads) {
      expect(options['source-archive-key']).toBe('hkgov/csdi/source.zip')
      expect(options['source-archive-sha256']).toBe(sourceArchiveSha256)
    }
  })
})
