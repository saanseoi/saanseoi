import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parquetWriteFile } from 'hyparquet-writer'
import { LocalPipelineBucket } from '../localPipeline/localBucket.ts'
import { deliveryFileSha256 } from '../localPipeline/sqlDeliveryFiles.ts'
import { stagePlaces } from './processLocalPlaceSqlUploadPreparation.ts'

test('Place staging reuses real Parquet normalisation and review actions without rereading source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'staged-place-cache-'))
  try {
    const path = join(root, 'places.parquet')
    parquetWriteFile({
      filename: path,
      columnData: [
        { name: 'id', type: 'STRING', data: ['included', 'excluded'] },
        {
          name: 'geometry',
          type: 'JSON',
          data: [
            { type: 'Point', coordinates: [114, 22] },
            { type: 'Point', coordinates: [114, 22] },
          ],
        },
        {
          name: 'names',
          type: 'JSON',
          data: [{ primary: 'Sample shop' }, { primary: 'Excluded shop' }],
        },
        {
          name: 'addresses',
          type: 'JSON',
          data: [
            [{ country: 'HK', freeform: 'Publisher address' }],
            [{ country: 'CN', freeform: 'Publisher address' }],
          ],
        },
      ],
    })
    const bucket = new LocalPipelineBucket(root)
    await bucket.seedRawObject('places.parquet', path)
    const checksum = await deliveryFileSha256(path)
    const first = await stagePlaces(
      bucket,
      'places.parquet',
      '2026-01',
      root,
      undefined,
      checksum,
    )
    expect(first.processedRows).toBe(2)
    expect(first.includedRows).toBe(1)
    expect(first.actions.length).toBeGreaterThan(0)
    const stagedBytes = await readFile(first.path, 'utf8')
    expect(JSON.parse(stagedBytes.trim()).id).toBe('included')
    bucket.get = async () => {
      throw new Error('Must not read Parquet again')
    }
    const resumed = await stagePlaces(
      bucket,
      'places.parquet',
      '2026-01',
      root,
      () => {
        throw new Error('Must not normalise again')
      },
      checksum,
    )
    expect(resumed).toEqual(first)
    expect(await readFile(first.path, 'utf8')).toBe(stagedBytes)
    const manifestPath = `${first.path}.manifest.json`
    const originalManifest = await readFile(manifestPath, 'utf8')
    const changedManifest = JSON.parse(originalManifest)
    changedManifest.result.actions = []
    await writeFile(manifestPath, JSON.stringify(changedManifest))
    await expect(
      stagePlaces(bucket, 'places.parquet', '2026-01', root, undefined, checksum),
    ).rejects.toThrow('manifest is invalid')
    await writeFile(manifestPath, originalManifest)
    await expect(
      stagePlaces(
        bucket,
        'places.parquet',
        '2026-01',
        root,
        undefined,
        'changed-source',
      ),
    ).rejects.toThrow('preparation changed')
    await writeFile(first.path, '{}\n')
    await expect(
      stagePlaces(bucket, 'places.parquet', '2026-01', root, undefined, checksum),
    ).rejects.toThrow('checksum differs')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
