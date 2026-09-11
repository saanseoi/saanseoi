import { describe, expect, mock, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { runReconcileDraftReleaseSetsCommand } from '../../../harbour-cli/src/lib/commands/reconcile.ts'

const preparedTypes: Array<{ sourceVersion: string; resourceType: string }> = []
const preparedInputs: string[] = []
const uploadedTypes: Array<{
  deferApiReleaseSet: boolean
  reuseExistingRelease: boolean
  skipSnapshotCleanup: boolean
  sourceVersion: string
  resourceType: string
}> = []
let divisionPublishComplete = false
const reconciledTargets: unknown[] = []

const prepareHkgovPlandTpuNativeShpZipMock = mock(
  async (options: {
    inputFile: string
    outputFile: string
    sourceVersion: string
    resourceType: string
  }) => {
    preparedInputs.push(options.inputFile)
    preparedTypes.push({
      sourceVersion: options.sourceVersion,
      resourceType: options.resourceType,
    })
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
    _args: { options: { 'source-version'?: unknown; 'resource-type'?: unknown } },
    _target: unknown,
    options: {
      deferApiReleaseSet?: boolean
      reuseExistingRelease?: boolean
      skipSnapshotCleanup: boolean
    },
  ) => {
    const sourceVersion = String(_args.options['source-version'])
    const resourceType = String(_args.options['resource-type'])
    uploadedTypes.push({
      deferApiReleaseSet: options.deferApiReleaseSet === true,
      reuseExistingRelease: options.reuseExistingRelease === true,
      skipSnapshotCleanup: options.skipSnapshotCleanup,
      sourceVersion,
      resourceType,
    })

    if (resourceType === 'division') {
      await Promise.resolve()
      divisionPublishComplete = true
      return
    }

    expect(divisionPublishComplete).toBe(true)
    divisionPublishComplete = false
  },
)

const runReconcileDraftReleaseSetsCommandMock = mock(
  async (
    _args: Parameters<typeof runReconcileDraftReleaseSetsCommand>[0],
    target: Parameters<typeof runReconcileDraftReleaseSetsCommand>[1],
    _printUsage: Parameters<typeof runReconcileDraftReleaseSetsCommand>[2],
  ) => {
    reconciledTargets.push(target)
  },
)

import {
  runHkgovPlandBackfillCommand,
  runHkgovPlandNativeArchiveIngestCommand,
} from './backfillHkgovPland.ts'

describe('Planning Department backfills', () => {
  test('init skips completed Planning domains without continue or preparing uploads', async () => {
    const previous = process.env.SAANSEOI_INIT_COMMAND
    const prepareCalls = prepareHkgovPlandTpuNativeShpZipMock.mock.calls.length
    const uploadCalls = runUploadCommandMock.mock.calls.length
    try {
      for (const kind of ['pu', 'new-town'] as const) {
        process.env.SAANSEOI_INIT_COMMAND = `init:divisions:hkgov-pland-${kind}`
        let inspected = false
        await runHkgovPlandBackfillCommand(
          {
            command: 'hkgov-pland:backfill',
            positionals: [],
            options: { target: 'local' },
          },
          { environment: 'dev', remote: false },
          kind,
          () => undefined,
          {
            getCompletedReleaseCodes: async () => {
              inspected = true
              return new Set(
                ['2001', '2006', '2011', '2016', '2021'].flatMap(year =>
                  ['division', 'division-area'].map(
                    resourceType => `dr-hk-hkgov-pland-${resourceType}-${kind}-${year}`,
                  ),
                ),
              )
            },
            prepareHkgovPlandTpuNativeShpZip: prepareHkgovPlandTpuNativeShpZipMock,
            runReconcileDraftReleaseSetsCommand:
              runReconcileDraftReleaseSetsCommandMock,
            runUploadCommand: runUploadCommandMock,
          },
        )
        expect(inspected).toBe(true)
      }
      expect(prepareHkgovPlandTpuNativeShpZipMock.mock.calls.length).toBe(prepareCalls)
      expect(runUploadCommandMock.mock.calls.length).toBe(uploadCalls)
    } finally {
      if (previous === undefined) delete process.env.SAANSEOI_INIT_COMMAND
      else process.env.SAANSEOI_INIT_COMMAND = previous
    }
  })

  test('stages each cohort before reconciling its complete division and area release set', async () => {
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
          runReconcileDraftReleaseSetsCommand: runReconcileDraftReleaseSetsCommandMock,
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
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: true,
        reuseExistingRelease: false,
        sourceVersion: '2001',
        resourceType: 'division',
      },
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: false,
        reuseExistingRelease: true,
        sourceVersion: '2001',
        resourceType: 'divisionArea',
      },
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: true,
        reuseExistingRelease: false,
        sourceVersion: '2006',
        resourceType: 'division',
      },
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: false,
        reuseExistingRelease: true,
        sourceVersion: '2006',
        resourceType: 'divisionArea',
      },
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: true,
        reuseExistingRelease: false,
        sourceVersion: '2011',
        resourceType: 'division',
      },
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: false,
        reuseExistingRelease: true,
        sourceVersion: '2011',
        resourceType: 'divisionArea',
      },
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: true,
        reuseExistingRelease: false,
        sourceVersion: '2016',
        resourceType: 'division',
      },
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: false,
        reuseExistingRelease: true,
        sourceVersion: '2016',
        resourceType: 'divisionArea',
      },
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: true,
        reuseExistingRelease: false,
        sourceVersion: '2021',
        resourceType: 'division',
      },
      {
        deferApiReleaseSet: true,
        skipSnapshotCleanup: false,
        reuseExistingRelease: true,
        sourceVersion: '2021',
        resourceType: 'divisionArea',
      },
    ])
    expect(reconciledTargets).toContainEqual({ environment: 'preview', remote: true })
  })

  test('reuses verified prepared artefacts on a backfill retry', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'hkgov-pland-cache-test-'))
    const prepareCalls = prepareHkgovPlandTpuNativeShpZipMock.mock.calls.length
    try {
      const dependencies = {
        prepareHkgovPlandTpuNativeShpZip: prepareHkgovPlandTpuNativeShpZipMock,
        preparedArtefactCacheRoot: cacheRoot,
        runReconcileDraftReleaseSetsCommand: runReconcileDraftReleaseSetsCommandMock,
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

  test.each(['1', '2'])(
    'rebuilds version %s cached artefacts when the preparation contract changes',
    async previousContractVersion => {
      const cacheRoot = await mkdtemp(join(tmpdir(), 'hkgov-pland-cache-test-'))
      const previousMinimal = process.env.SAANSEOI_INIT_MINIMAL
      const prepareCalls = prepareHkgovPlandTpuNativeShpZipMock.mock.calls.length
      const output = Buffer.from('prepared parquet')
      try {
        process.env.SAANSEOI_INIT_MINIMAL = '1'
        const archive = await readFile(
          resolve(
            import.meta.dir,
            '../../../../data/hkgov/csdi/archive/pland_rcd_1636535158118_80594/2023-Q4/source.zip',
          ),
        )
        const archiveHash = createHash('sha256').update(archive).digest('hex')
        const cacheDirectory = join(
          cacheRoot,
          'hkgov-pland-pu',
          `v${previousContractVersion}`,
          archiveHash,
          '2001',
        )
        await mkdir(cacheDirectory, { recursive: true })
        for (const resourceType of ['division', 'divisionArea'] as const) {
          await writeFile(join(cacheDirectory, `${resourceType}.parquet`), output)
          await writeFile(
            join(cacheDirectory, `${resourceType}.manifest.json`),
            JSON.stringify({
              schemaVersion: 1,
              sourceArchiveSha256: archiveHash,
              sourceVersion: '2001',
              parserContractVersion: previousContractVersion,
              resourceType,
              outputByteLength: output.byteLength,
              outputSha256: createHash('sha256').update(output).digest('hex'),
            }),
          )
        }

        const dependencies = {
          prepareHkgovPlandTpuNativeShpZip: prepareHkgovPlandTpuNativeShpZipMock,
          preparedArtefactCacheRoot: cacheRoot,
          runReconcileDraftReleaseSetsCommand: runReconcileDraftReleaseSetsCommandMock,
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
          prepareCalls + 4,
        )
        await runHkgovPlandBackfillCommand(
          args,
          target,
          'pu',
          () => undefined,
          dependencies,
        )
        expect(prepareHkgovPlandTpuNativeShpZipMock.mock.calls.length).toBe(
          prepareCalls + 4,
        )
      } finally {
        if (previousMinimal === undefined) delete process.env.SAANSEOI_INIT_MINIMAL
        else process.env.SAANSEOI_INIT_MINIMAL = previousMinimal
        await rm(cacheRoot, { force: true, recursive: true })
      }
    },
  )

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
        runReconcileDraftReleaseSetsCommand: runReconcileDraftReleaseSetsCommandMock,
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
