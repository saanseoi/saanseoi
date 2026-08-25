import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { unzipSync } from 'fflate'

import {
  buildSourceArchiveObjectKey,
  buildSourceArchivePrefix,
  ensurePreparedCsdiSourceArchive,
  mirrorCsdiSourceArchive,
  prepareCsdiSourceArchive,
} from './sourceArchives.ts'

describe('CSDI source archives', () => {
  test('wraps non-archive publisher files without changing their original bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-archive-'))
    const inputPath = join(root, 'Street Name Plates.geojson')
    const outputPath = join(root, 'source.zip')
    const retryOutputPath = join(root, 'source-retry.zip')
    const publisherBytes = '{"type":"FeatureCollection","features":[]}'
    await writeFile(inputPath, publisherBytes, 'utf8')

    try {
      const prepared = await prepareCsdiSourceArchive({
        archive: {
          datasetCode: 'ds-hk-hkgov-hyd-street',
          datasetId: 'hyd_rcd_1632211119955_31211',
          releaseSlot: '2025-Q1',
          sourceUrl: 'https://publisher.example/archive',
        },
        inputPath,
        outputPath,
      })

      expect(prepared.manifest.archive.packaging).toBe('saanseoi-lossless-zip')
      expect(prepared.manifest).not.toHaveProperty('downloadedAt')
      expect(prepared.manifest.original.fileName).toBe('Street Name Plates.geojson')
      expect(prepared.manifest.contents.files).toEqual(['Street_Name_Plates.geojson'])
      expect(
        new TextDecoder().decode(
          unzipSync(await readFile(outputPath))['Street_Name_Plates.geojson'],
        ),
      ).toBe(publisherBytes)

      const retry = await prepareCsdiSourceArchive({
        archive: {
          datasetCode: 'ds-hk-hkgov-hyd-street',
          datasetId: 'hyd_rcd_1632211119955_31211',
          releaseSlot: '2025-Q1',
          sourceUrl: 'https://publisher.example/archive',
        },
        inputPath,
        outputPath: retryOutputPath,
      })
      expect(retry.manifest.archive.sha256).toBe(prepared.manifest.archive.sha256)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test('uses the shared immutable source-object convention', () => {
    const input = {
      datasetId: 'hyd_rcd_1632211119955_31211',
      releaseSlot: '2025-Q1',
      sha256: 'a'.repeat(64),
    }

    expect(buildSourceArchivePrefix(input)).toBe(
      `by-source/hk/hkgov-csdi/${input.datasetId}`,
    )
    expect(buildSourceArchiveObjectKey(input, 'source.zip')).toBe(
      `by-source/hk/hkgov-csdi/${input.datasetId}/${input.sha256}-source.zip`,
    )
    const sameContentInAnotherSlot = { ...input, releaseSlot: '2026-Q2' }
    expect(buildSourceArchiveObjectKey(sameContentInAnotherSlot, 'source.zip')).toBe(
      buildSourceArchiveObjectKey(input, 'source.zip'),
    )
  })

  test('mirrors source archives into the local managed asset store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-archive-'))
    const inputPath = join(root, 'Street Name Plates.geojson')
    const outputPath = join(root, 'source.zip')
    const archive = {
      datasetCode: 'ds-hk-hkgov-hyd-pedestrian-street',
      datasetId: 'td_rcd_1697081765097_37742',
      releaseSlot: '2025-Q1',
      sourceUrl: 'https://publisher.example/archive',
    }
    await writeFile(inputPath, '{"type":"FeatureCollection","features":[]}', 'utf8')
    const uploads: Array<{ assetKey: string; role: string }> = []

    try {
      const prepared = await prepareCsdiSourceArchive({
        archive,
        inputPath,
        outputPath,
      })
      const mirrored = await mirrorCsdiSourceArchive(
        { environment: 'dev', remote: false },
        archive,
        prepared,
        {
          upload: async (_target, input) => {
            uploads.push({
              assetKey: input.metadata.assetKey,
              role: input.metadata.role,
            })
            const assetId = `00000000-0000-4000-8000-00000000000${uploads.length}`
            return { assetId, url: `https://assets.example/${assetId}` }
          },
        },
      )

      expect(uploads).toHaveLength(2)
      expect(uploads.map(upload => upload.role).sort()).toEqual([
        'manifest',
        'sourceArchive',
      ])
      expect(mirrored).toEqual({
        manifestUrl:
          'http://localhost:8787/v0/assets/00000000-0000-4000-8000-000000000002',
        sourceUrl:
          'http://localhost:8787/v0/assets/00000000-0000-4000-8000-000000000001',
      })
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test('requires a prepared archive to match the requested source provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-archive-'))
    const inputPath = join(root, 'source.zip')
    const outputPath = join(root, 'prepared-source.zip')
    const archive = {
      datasetCode:
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type',
      datasetId: 'censtatd_rcd_1635933883228_46491',
      releaseSlot: '2023-Q4',
      sourceUrl: 'https://publisher.example/archive',
    }
    await writeFile(inputPath, 'not a ZIP', 'utf8')

    try {
      const prepared = await prepareCsdiSourceArchive({
        archive,
        inputPath,
        outputPath,
      })
      await expect(
        ensurePreparedCsdiSourceArchive(
          { environment: 'dev', remote: false },
          {
            expected: {
              datasetCode: archive.datasetCode,
              objectKey: prepared.manifest.archive.objectKey,
              sha256: 'a'.repeat(64),
            },
            sourcePath: outputPath,
          },
        ),
      ).rejects.toThrow('SHA-256 does not match the requested provenance')
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
