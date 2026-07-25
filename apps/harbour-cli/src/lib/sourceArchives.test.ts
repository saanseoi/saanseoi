import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { unzipSync } from 'fflate'

import {
  buildSourceArchiveObjectKey,
  buildSourceArchivePrefix,
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
      `by-source/hk/hkgov-csdi/${input.datasetId}/2025-Q1`,
    )
    expect(buildSourceArchiveObjectKey(input, 'source.zip')).toBe(
      `by-source/hk/hkgov-csdi/${input.datasetId}/2025-Q1/${input.sha256}-source.zip`,
    )
  })
})
