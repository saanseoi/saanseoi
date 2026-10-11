import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SOURCE_ASSET_PART_SIZE } from '../../../../../libs/core/src/lib/services/sourceAssetTransfer'
import {
  createSourceAssetTestStore,
  hash,
} from '../../../../../libs/core/src/testing/sourceAssetStore'
import { retryRemoteR2 } from './remoteR2Retry'
import { retainSourceFileInBucket } from './remoteR2SourceFile'

test('source retention resumes verified chunks after the reported R2 PUT failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'r2-retry-'))
  try {
    const bytes = new Uint8Array(SOURCE_ASSET_PART_SIZE + 123).fill(7)
    const path = join(directory, 'source.bin')
    await writeFile(path, bytes)
    const key = `by-source/hk/test/${hash(bytes)}-source.bin`
    const fixture = createSourceAssetTestStore()
    const originalPut = fixture.store.put
    let puts = 0
    fixture.store.put = async (...args) => {
      if (++puts === 2) throw new Error('put: Unspecified error (0)')
      return originalPut(...args)
    }
    const waits: number[] = []
    await retryRemoteR2(
      () =>
        retainSourceFileInBucket(fixture.store, key, path, {
          contentType: 'application/octet-stream',
        }),
      () => {},
      async delay => {
        waits.push(delay)
      },
    )
    expect(waits).toEqual([1000])
    expect(fixture.objects.get(key)?.bytes).toEqual(bytes)
    expect(
      fixture.writes.filter(key => key.startsWith('source-transfers/')),
    ).toHaveLength(2)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('persistent transport failure stops after four attempts with the original error', async () => {
  const error = new Error('HTTP 503')
  let attempts = 0
  const waits: number[] = []
  await expect(
    retryRemoteR2(
      async () => {
        attempts++
        throw error
      },
      () => {},
      async delay => {
        waits.push(delay)
      },
    ),
  ).rejects.toBe(error)
  expect(attempts).toBe(4)
  expect(waits).toEqual([1000, 2000, 4000])
})

test('integrity and authorisation failures do not retry', async () => {
  for (const message of [
    'Immutable source asset conflict for by-source/500/file.',
    'Source transfer chunk SHA-256 mismatch.',
    'HTTP 403',
  ]) {
    let attempts = 0
    await expect(
      retryRemoteR2(
        async () => {
          attempts++
          throw new Error(message)
        },
        () => {},
        async () => {
          throw new Error('Unexpected retry')
        },
      ),
    ).rejects.toThrow(message)
    expect(attempts).toBe(1)
  }
})
