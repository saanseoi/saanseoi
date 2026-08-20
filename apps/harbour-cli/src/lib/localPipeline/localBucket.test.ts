import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { LocalPipelineBucket } from './localBucket.ts'

test('keeps local pipeline object keys inside the objects directory', () => {
  const bucket = new LocalPipelineBucket('/tmp/saanseoi-local-bucket-test')

  expect(bucket.resolvePath('raw/source.parquet')).toBe(
    resolve('/tmp/saanseoi-local-bucket-test/objects/raw/source.parquet'),
  )
  expect(() => bucket.resolvePath('../outside')).toThrow(
    'Invalid local pipeline object key',
  )
  expect(() => bucket.resolvePath('/tmp/outside')).toThrow(
    'Invalid local pipeline object key',
  )
})

test('reads only the requested local object range', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-local-bucket-'))
  const bucket = new LocalPipelineBucket(root)
  const objectPath = bucket.resolvePath('raw/source.parquet')

  try {
    await bucket.put(
      'raw/source.parquet',
      new TextEncoder().encode('0123456789').buffer,
    )
    const object = await bucket.get('raw/source.parquet', {
      range: { length: 4, offset: 3 },
    })

    expect(object).not.toBeNull()
    if (!object) throw new Error('Expected the local object range to exist.')
    expect(new TextDecoder().decode(await object.arrayBuffer())).toBe('3456')
    await writeFile(objectPath, 'short')
    const beyondEnd = await bucket.get('raw/source.parquet', {
      range: { length: 10, offset: 99 },
    })
    expect(beyondEnd).not.toBeNull()
    if (!beyondEnd) throw new Error('Expected the local object to exist.')
    expect((await beyondEnd.arrayBuffer()).byteLength).toBe(0)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
