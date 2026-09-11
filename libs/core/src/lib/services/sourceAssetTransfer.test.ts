import { expect, test } from 'bun:test'
import { createSourceAssetTestStore, hash } from '../../testing/sourceAssetStore'
import {
  SOURCE_ASSET_PART_SIZE,
  completeSourceAssetTransfer,
  hasVerifiedSourceObject,
  putSourceAssetPart,
  sourceAssetPartKey,
  sourceAssetScope,
  readBoundedSourceBody,
} from './sourceAssetTransfer'

const a = new Uint8Array(SOURCE_ASSET_PART_SIZE).fill(11)
const b = new Uint8Array(123).fill(27)
const all = new Uint8Array(Buffer.concat([a, b]))
const input = {
  assetKey: `by-source/hk/test/${hash(all)}-source.zip`,
  contentHash: hash(all),
  byteLength: all.length,
  parts: [a, b].map(bytes => ({ sha256: hash(bytes), byteLength: bytes.length })),
  mediaType: 'application/zip',
  fileName: 'source.zip',
  role: 'sourceArchive',
}
async function staged() {
  const f = createSourceAssetTestStore()
  const scope = sourceAssetScope(input.assetKey)
  for (const bytes of [a, b])
    await putSourceAssetPart(f.store, scope, hash(bytes), new Response(bytes).body)
  return f
}

test('interrupted assembly retains verified chunks and retries without source retransmission', async () => {
  const f = await staged()
  f.failures.uploadPart = 2
  await expect(completeSourceAssetTransfer(f.store, input)).rejects.toThrow(
    'interrupted assembly',
  )
  expect(f.objects.has(input.assetKey)).toBe(false)
  expect(f.objects.size).toBe(2)
  expect(await completeSourceAssetTransfer(f.store, input)).toBe('uploaded')
  expect(f.objects.get(input.assetKey)?.bytes).toEqual(all)
  expect(f.writes.filter(key => key.startsWith('source-transfers/'))).toHaveLength(2)
  expect(await completeSourceAssetTransfer(f.store, input)).toBe('existing')
  expect(f.multipartStarts).toBe(2)
})

test('a lost multipart completion response is reconciled against verified persisted bytes', async () => {
  const f = await staged()
  f.failures.lostCompletion = true
  expect(await completeSourceAssetTransfer(f.store, input)).toBe('uploaded')
  expect(
    await hasVerifiedSourceObject(
      f.store,
      input.assetKey,
      input.contentHash,
      input.byteLength,
    ),
  ).toBe(true)
  expect(f.writes.filter(key => key === input.assetKey)).toHaveLength(1)
})

test('declared hashes do not certify unverified existing objects', async () => {
  const f = createSourceAssetTestStore()
  f.objects.set(input.assetKey, {
    bytes: new Uint8Array(all.length),
    customMetadata: { sha256: input.contentHash },
  })
  await expect(
    hasVerifiedSourceObject(
      f.store,
      input.assetKey,
      input.contentHash,
      input.byteLength,
    ),
  ).rejects.toThrow('SHA-256 differs')
  expect(f.writes).toEqual([])
})

test('missing or corrupt staged chunks cannot create a final object', async () => {
  const f = await staged()
  const key = sourceAssetPartKey(sourceAssetScope(input.assetKey), hash(b))
  const original = f.objects.get(key)!
  f.objects.delete(key)
  await expect(completeSourceAssetTransfer(f.store, input)).rejects.toThrow(
    'chunk is missing',
  )
  f.objects.set(key, { ...original, bytes: new Uint8Array(b.length) })
  await expect(completeSourceAssetTransfer(f.store, input)).rejects.toThrow(
    'chunk failed SHA-256',
  )
  expect(f.multipartStarts).toBe(0)
  expect(f.objects.has(input.assetKey)).toBe(false)
})

test('valid per-chunk hashes do not replace the full-file integrity check', async () => {
  const f = createSourceAssetTestStore()
  const wrong = {
    ...input,
    contentHash: 'f'.repeat(64),
    assetKey: `by-source/hk/test/${'f'.repeat(64)}-source.zip`,
  }
  for (const bytes of [a, b])
    await putSourceAssetPart(
      f.store,
      sourceAssetScope(wrong.assetKey),
      hash(bytes),
      new Response(bytes).body,
    )
  await expect(completeSourceAssetTransfer(f.store, wrong)).rejects.toThrow(
    'Assembled source asset SHA-256 mismatch',
  )
  expect(f.multipartStarts).toBe(0)
  expect(f.objects.has(wrong.assetKey)).toBe(false)
})

test('chunk size is bounded while streaming and incorrect checksums are rejected', async () => {
  let cancelled = false
  let chunks = 0
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      chunks++
      c.enqueue(new Uint8Array(1024))
    },
    cancel() {
      cancelled = true
    },
  })
  await expect(readBoundedSourceBody(body, 4096)).rejects.toThrow('exceeds')
  expect(cancelled).toBe(true)
  expect(chunks).toBeLessThanOrEqual(6)
  const f = createSourceAssetTestStore()
  await expect(
    putSourceAssetPart(
      f.store,
      sourceAssetScope(input.assetKey),
      hash(a),
      new Response(b).body,
    ),
  ).rejects.toThrow('SHA-256 mismatch')
  expect(f.writes).toEqual([])
})

test('part layout and file/key mismatches fail without writing objects', async () => {
  const f = createSourceAssetTestStore()
  await expect(
    completeSourceAssetTransfer(f.store, {
      ...input,
      parts: [...input.parts].reverse(),
    }),
  ).rejects.toThrow('uniform size')
  await expect(
    completeSourceAssetTransfer(f.store, { ...input, byteLength: 1 }),
  ).rejects.toThrow('file size')
  await expect(
    completeSourceAssetTransfer(f.store, {
      ...input,
      assetKey: `by-source/hk/test/${'0'.repeat(64)}-source.zip`,
    }),
  ).rejects.toThrow('full SHA-256')
  expect(f.writes).toEqual([])
})

test('empty and small files use a conditional checksum-verified write', async () => {
  for (const bytes of [new Uint8Array(), b]) {
    const f = createSourceAssetTestStore()
    const key = `by-source/hk/test/${hash(bytes)}-small.bin`
    await putSourceAssetPart(
      f.store,
      sourceAssetScope(key),
      hash(bytes),
      new Response(bytes).body,
    )
    await completeSourceAssetTransfer(f.store, {
      ...input,
      assetKey: key,
      contentHash: hash(bytes),
      byteLength: bytes.length,
      parts: [{ sha256: hash(bytes), byteLength: bytes.length }],
    })
    expect(f.objects.get(key)?.bytes).toEqual(bytes)
    expect(f.multipartStarts).toBe(0)
  }
})
