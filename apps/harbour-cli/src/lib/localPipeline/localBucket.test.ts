import { expect, test } from 'bun:test'
import { resolve } from 'node:path'

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
