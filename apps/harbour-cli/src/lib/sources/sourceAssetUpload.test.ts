import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createSourceAssetTestStore,
  hash,
} from '../../../../../libs/core/src/testing/sourceAssetStore'
import {
  SOURCE_ASSET_PART_SIZE,
  completeSourceAssetTransfer,
  hasSourceAssetPart,
  hasVerifiedSourceObject,
  putSourceAssetPart,
} from '../../../../../libs/core/src/lib/services/sourceAssetTransfer'
import { uploadManagedSourceAsset, type ManagedSourceAssetUpload } from './sourceAssets'
import { retainSourceFileInBucket } from '../storage/remoteR2SourceFile'

const originalFetch = globalThis.fetch
const apiKey = process.env.HARBOUR_API_KEY
afterEach(() => {
  globalThis.fetch = originalFetch
  if (apiKey === undefined) delete process.env.HARBOUR_API_KEY
  else process.env.HARBOUR_API_KEY = apiKey
})
const prefix = new Uint8Array(SOURCE_ASSET_PART_SIZE).fill(19)
const tail = new Uint8Array(321).fill(23)
const bytes = new Uint8Array(Buffer.concat([prefix, tail]))
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'source-transfer-client-'))
  const filePath = join(root, 'source.zip')
  await writeFile(filePath, bytes)
  const input: ManagedSourceAssetUpload = {
    filePath,
    fileName: 'source.zip',
    metadata: {
      assetKey: `by-source/hk/test/${hash(bytes)}-source.zip`,
      contentHash: hash(bytes),
      mediaType: 'application/zip',
      role: 'sourceArchive',
      retrievedAt: '2026-09-12T00:00:00Z',
    },
  }
  return { root, input, close: () => rm(root, { recursive: true, force: true }) }
}

test('resumes retained chunks across invocations and reconciles a lost completion response', async () => {
  const f = await fixture()
  const store = createSourceAssetTestStore()
  const transfers: string[] = []
  let interrupt = true
  let loseCompletion = true
  let registered = false
  process.env.HARBOUR_API_KEY = 'source-transfer-test-key'
  globalThis.fetch = (async (url, options) => {
    expect(new Headers(options?.headers).get('x-api-key')).toBe(
      'source-transfer-test-key',
    )
    const path = new URL(String(url))
    if (path.pathname.endsWith('/preflight')) {
      const exists = await hasVerifiedSourceObject(
        store.store,
        f.input.metadata.assetKey,
        hash(bytes),
        bytes.length,
      )
      return Response.json(
        exists ? { needsUpload: false, assetId: 'retained' } : { needsUpload: true },
      )
    }
    if (path.pathname.includes('/parts/')) {
      const [scope, sha256] = path.pathname.split('/').slice(-2) as [string, string]
      if (options?.method !== 'PUT')
        return Response.json({
          exists: await hasSourceAssetPart(store.store, scope, {
            sha256,
            byteLength: Number(path.searchParams.get('byteLength')),
          }),
        })
      if (interrupt && sha256 === hash(tail))
        return Response.json({ message: 'connection interrupted' }, { status: 503 })
      expect(options.body).toBeInstanceOf(Uint8Array)
      expect((options.body as Uint8Array).byteLength).toBeLessThanOrEqual(
        SOURCE_ASSET_PART_SIZE,
      )
      transfers.push(sha256)
      return Response.json(
        await putSourceAssetPart(
          store.store,
          scope,
          sha256,
          new Response(options.body).body,
        ),
      )
    }
    const request = JSON.parse(String(options?.body))
    const status = await completeSourceAssetTransfer(store.store, {
      ...request,
      ...request.metadata,
    })
    registered = true
    if (loseCompletion) {
      loseCompletion = false
      throw new Error('lost completion response')
    }
    return Response.json({ assetId: 'retained', status })
  }) as typeof fetch
  try {
    const target = { environment: 'preview' as const, remote: true }
    await expect(uploadManagedSourceAsset(target, f.input)).rejects.toThrow(
      'connection interrupted',
    )
    expect(registered).toBe(false)
    expect(transfers).toEqual([hash(prefix)])
    interrupt = false
    expect((await uploadManagedSourceAsset(target, f.input)).assetId).toBe('retained')
    expect(transfers).toEqual([hash(prefix), hash(tail)])
    expect(store.objects.get(f.input.metadata.assetKey)?.bytes).toEqual(bytes)
    await uploadManagedSourceAsset(target, f.input)
    expect(transfers).toHaveLength(2)
    expect(store.writes.filter(key => key === f.input.metadata.assetKey)).toHaveLength(
      1,
    )
  } finally {
    await f.close()
  }
})

test('changed local content is rejected before any remote request', async () => {
  const f = await fixture()
  let requests = 0
  globalThis.fetch = (async () => {
    requests++
    throw new Error('unexpected request')
  }) as unknown as typeof fetch
  try {
    await writeFile(f.input.filePath, tail)
    await expect(
      uploadManagedSourceAsset({ environment: 'preview', remote: true }, f.input),
    ).rejects.toThrow('SHA-256')
    expect(requests).toBe(0)
  } finally {
    await f.close()
  }
})

test('R2-only file transfers resume without a Harbour HTTP or metadata capability', async () => {
  const f = await fixture()
  const store = createSourceAssetTestStore()
  globalThis.fetch = (async () => {
    throw new Error('R2-only mode must not contact Harbour')
  }) as unknown as typeof fetch
  const progress: string[] = []
  try {
    store.failures.uploadPart = 2
    await expect(
      retainSourceFileInBucket(
        store.store,
        f.input.metadata.assetKey,
        f.input.filePath,
        { contentType: 'application/zip' },
      ),
    ).rejects.toThrow('interrupted assembly')
    await retainSourceFileInBucket(
      store.store,
      f.input.metadata.assetKey,
      f.input.filePath,
      { contentType: 'application/zip' },
      message => progress.push(message),
    )
    expect(store.objects.get(f.input.metadata.assetKey)?.bytes).toEqual(bytes)
    expect(
      store.writes.filter(key => key.startsWith('source-transfers/')),
    ).toHaveLength(2)
    expect(progress.some(message => message.startsWith('assembling chunk'))).toBe(true)
    expect(store.objects.size).toBe(1)
  } finally {
    await f.close()
  }
})
