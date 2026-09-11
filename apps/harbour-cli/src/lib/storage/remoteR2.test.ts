import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { remoteR2Config, retainRemoteR2Object, type RemoteR2Bucket } from './remoteR2'

test('remote proxy exposes only the selected R2 bucket', () => {
  expect(remoteR2Config('ss-assets-prod')).toEqual({
    name: 'saanseoi-local-r2-upload',
    compatibility_date: '2026-05-01',
    r2_buckets: [{ binding: 'R2_ASSETS', bucket_name: 'ss-assets-prod', remote: true }],
  })
})

test('immutable uploads verify bytes and avoid duplicate writes', async () => {
  let stored: Uint8Array | undefined
  let writes = 0
  const bucket: RemoteR2Bucket = {
    async head() {
      return stored ? { size: stored.byteLength } : null
    },
    async get() {
      const value = stored
      return value ? { arrayBuffer: async () => value.slice().buffer } : null
    },
    async put(_key, bytes, options) {
      expect(options.onlyIf).toEqual({ etagDoesNotMatch: '*' })
      expect(options.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
      stored = bytes
      writes++
    },
  }
  const bytes = new TextEncoder().encode('retained evidence')
  await retainRemoteR2Object(
    'production',
    'asset',
    bytes,
    { contentType: 'text/plain' },
    bucket,
  )
  await retainRemoteR2Object(
    'production',
    'asset',
    bytes,
    { contentType: 'text/plain' },
    bucket,
  )
  expect(writes).toBe(1)
  await expect(
    retainRemoteR2Object(
      'production',
      'asset',
      new Uint8Array([0]),
      { contentType: 'text/plain' },
      bucket,
    ),
  ).rejects.toThrow('conflict')
  expect(writes).toBe(1)
})

test('a competing writer cannot silently replace the requested bytes', async () => {
  let exists = false
  const bucket: RemoteR2Bucket = {
    async head() {
      return exists ? { size: 1 } : null
    },
    async get() {
      return { arrayBuffer: async () => new Uint8Array([9]).buffer }
    },
    async put() {
      exists = true
      return null
    },
  }
  await expect(
    retainRemoteR2Object(
      'production',
      'asset',
      new Uint8Array([1]),
      { contentType: 'text/plain' },
      bucket,
    ),
  ).rejects.toThrow('conflict')
})

import { checkLocalR2Mode } from './localR2Mode'

test('continuation cannot change storage beneath retained releases', () => {
  expect(() => checkLocalR2Mode(undefined, 'production', true)).toThrow(
    'already contains local',
  )
  expect(() => checkLocalR2Mode('production', 'local', true)).toThrow(
    'already contains production',
  )
  expect(() => checkLocalR2Mode('production', 'production', true)).not.toThrow()
  expect(() => checkLocalR2Mode(undefined, 'production', false)).not.toThrow()
})
