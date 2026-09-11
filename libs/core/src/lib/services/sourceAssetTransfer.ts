import { createHash } from 'node:crypto'

export const SOURCE_ASSET_PART_SIZE = 8 * 1024 * 1024
export const SOURCE_ASSET_MAX_PARTS = 10_000
export const SOURCE_ASSET_VERIFIED = 'source-sha256-v1'
export type SourceAssetPart = { sha256: string; byteLength: number }
type ObjectHead = {
  size: number
  checksums?: { sha256?: ArrayBuffer }
  customMetadata?: Record<string, string>
}
type ObjectBody = ObjectHead & { body: ReadableStream<Uint8Array> }
type UploadedPart = { partNumber: number; etag: string }
type ObjectOptions = {
  sha256?: string
  onlyIf?: { etagDoesNotMatch: string }
  customMetadata?: Record<string, string>
  httpMetadata?: { contentType?: string; contentDisposition?: string }
}
/** The storage operations needed by both the Worker and the R2-only Node proxy. */
export type SourceAssetStore = {
  head(key: string): Promise<ObjectHead | null>
  get(key: string): Promise<ObjectBody | null>
  put(key: string, body: Uint8Array, options: ObjectOptions): Promise<unknown>
  delete(keys: string | string[]): Promise<void>
  createMultipartUpload(
    key: string,
    options: ObjectOptions,
  ): Promise<{
    uploadPart(partNumber: number, body: Uint8Array): Promise<UploadedPart>
    complete(parts: UploadedPart[]): Promise<unknown>
    abort(): Promise<void>
  }>
}

export function sourceAssetScope(assetKey: string) {
  return createHash('sha256').update(assetKey).digest('hex')
}
export function sourceAssetPartKey(scope: string, hash: string) {
  if (!/^[a-f0-9]{64}$/.test(scope) || !/^[a-f0-9]{64}$/.test(hash))
    throw new Error('Invalid source transfer scope or SHA-256 digest.')
  return `source-transfers/${scope}/${hash}`
}
function objectHash(object: ObjectHead) {
  if (object.checksums?.sha256)
    return Buffer.from(object.checksums.sha256).toString('hex')
  if (object.customMetadata?.verification === SOURCE_ASSET_VERIFIED)
    return object.customMetadata.sha256
  return undefined
}
export async function hasSourceAssetPart(
  store: Pick<SourceAssetStore, 'head'>,
  scope: string,
  part: SourceAssetPart,
) {
  assertPart(part)
  const object = await store.head(sourceAssetPartKey(scope, part.sha256))
  if (!object) return false
  if (object.size !== part.byteLength || objectHash(object) !== part.sha256)
    throw new Error('Immutable source transfer chunk conflict.')
  return true
}

/** Enforce the bound while reading, even when Content-Length is absent or false. */
export async function readBoundedSourceBody(
  body: ReadableStream<Uint8Array> | null,
  limit = SOURCE_ASSET_PART_SIZE,
) {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      length += item.value.byteLength
      if (length > limit)
        throw new Error(`Source transfer body exceeds ${limit} bytes.`)
      chunks.push(item.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export async function putSourceAssetPart(
  store: Pick<SourceAssetStore, 'head' | 'put'>,
  scope: string,
  hash: string,
  body: ReadableStream<Uint8Array> | null,
) {
  const key = sourceAssetPartKey(scope, hash)
  const bytes = await readBoundedSourceBody(body)
  const part = { byteLength: bytes.byteLength, sha256: hash }
  assertPart(part)
  if (createHash('sha256').update(bytes).digest('hex') !== hash)
    throw new Error('Source transfer chunk SHA-256 mismatch.')
  if (!(await hasSourceAssetPart(store, scope, part))) {
    await store.put(key, bytes, {
      sha256: hash,
      onlyIf: { etagDoesNotMatch: '*' },
      customMetadata: { sha256: hash, verification: SOURCE_ASSET_VERIFIED },
    })
    if (!(await hasSourceAssetPart(store, scope, part)))
      throw new Error('Source transfer chunk was not retained.')
  }
  return part
}

function assertPart(part: SourceAssetPart) {
  if (
    !/^[a-f0-9]{64}$/.test(part.sha256) ||
    !Number.isSafeInteger(part.byteLength) ||
    part.byteLength < 0 ||
    part.byteLength > SOURCE_ASSET_PART_SIZE
  )
    throw new Error('Invalid source transfer chunk size or hash.')
}
export function assertSourceAssetParts(
  byteLength: number,
  parts: SourceAssetPart[],
): asserts parts is [SourceAssetPart, ...SourceAssetPart[]] {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    parts.length < 1 ||
    parts.length > SOURCE_ASSET_MAX_PARTS
  )
    throw new Error('Invalid source transfer size or part count.')
  for (const [index, part] of parts.entries()) {
    assertPart(part)
    if (index < parts.length - 1 && part.byteLength !== SOURCE_ASSET_PART_SIZE)
      throw new Error(
        'Source transfer chunks must have uniform size except the final chunk.',
      )
    if (parts.length > 1 && part.byteLength === 0)
      throw new Error('Source transfer contains an empty chunk.')
  }
  if (parts.reduce((sum, part) => sum + part.byteLength, 0) !== byteLength)
    throw new Error('Source transfer chunk lengths do not match the file size.')
}

/** Checksums come from R2, or from our completed server-side verification, never a declared hash alone. */
export async function hasVerifiedSourceObject(
  store: Pick<SourceAssetStore, 'head' | 'get'>,
  key: string,
  sha256: string,
  byteLength: number,
) {
  const existing = await store.head(key)
  if (!existing) return false
  if (existing.size !== byteLength)
    throw new Error(`Immutable source asset conflict for ${key}.`)
  let actual = objectHash(existing)
  if (!actual) {
    const object = await store.get(key)
    if (!object) throw new Error('Source asset disappeared during verification.')
    const hash = createHash('sha256')
    let length = 0
    for await (const bytes of object.body) {
      hash.update(bytes)
      length += bytes.byteLength
    }
    if (length !== byteLength)
      throw new Error('Source asset size changed during verification.')
    actual = hash.digest('hex')
  }
  if (actual !== sha256)
    throw new Error(`Immutable source asset conflict for ${key}; SHA-256 differs.`)
  return true
}

/** All staged bytes are verified before the immutable destination is written. */
export async function completeSourceAssetTransfer(
  store: SourceAssetStore,
  input: {
    assetKey: string
    contentHash: string
    byteLength: number
    parts: SourceAssetPart[]
    mediaType: string
    fileName: string
    role: string
  },
  progress: (operation: string) => void = () => {},
) {
  assertSourceAssetParts(input.byteLength, input.parts)
  if (
    !input.assetKey.startsWith('by-source/') ||
    !input.assetKey.split('/').at(-1)?.startsWith(`${input.contentHash}-`) ||
    !/^[a-f0-9]{64}$/.test(input.contentHash)
  )
    throw new Error('Source asset key does not match the full SHA-256 digest.')
  const scope = sourceAssetScope(input.assetKey)
  const matches = () =>
    hasVerifiedSourceObject(store, input.assetKey, input.contentHash, input.byteLength)
  if (await matches()) return 'existing' as const
  const readPart = async (part: SourceAssetPart) => {
    const object = await store.get(sourceAssetPartKey(scope, part.sha256))
    if (!object)
      throw new Error('Source transfer chunk is missing; resume the source upload.')
    const bytes = await readBoundedSourceBody(object.body)
    if (
      bytes.byteLength !== part.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== part.sha256
    )
      throw new Error('Retained source transfer chunk failed SHA-256 verification.')
    return bytes
  }
  const hash = createHash('sha256')
  for (const [index, part] of input.parts.entries()) {
    progress(`verifying chunk ${index + 1}/${input.parts.length}`)
    hash.update(await readPart(part))
  }
  if (hash.digest('hex') !== input.contentHash)
    throw new Error('Assembled source asset SHA-256 mismatch.')
  const options = {
    customMetadata: {
      sha256: input.contentHash,
      role: input.role,
      verification: SOURCE_ASSET_VERIFIED,
    },
    httpMetadata: {
      contentType: input.mediaType,
      contentDisposition: `attachment; filename="${input.fileName.replaceAll(/[\\"\r\n]/g, '_')}"`,
    },
  }
  if (input.parts.length === 1) {
    await store.put(input.assetKey, await readPart(input.parts[0]), {
      ...options,
      sha256: input.contentHash,
      onlyIf: { etagDoesNotMatch: '*' },
    })
  } else {
    const upload = await store.createMultipartUpload(input.assetKey, options)
    try {
      const parts: UploadedPart[] = []
      for (const [index, part] of input.parts.entries()) {
        progress(`assembling chunk ${index + 1}/${input.parts.length}`)
        parts.push(await upload.uploadPart(index + 1, await readPart(part)))
      }
      // Concurrent completions can only contain the same verified bytes.
      if (await matches()) await upload.abort()
      else await upload.complete(parts)
    } catch (error) {
      await upload.abort().catch(() => {})
      if (!(await matches())) throw error
    }
  }
  if (!(await matches())) throw new Error('Source asset is missing after completion.')
  return 'uploaded' as const
}

/** Called only after metadata acknowledgement; retries never need to discard staged evidence. */
export async function cleanupSourceAssetTransfer(
  store: Pick<SourceAssetStore, 'delete'>,
  assetKey: string,
  parts: SourceAssetPart[],
) {
  const scope = sourceAssetScope(assetKey)
  const keys = [...new Set(parts.map(part => sourceAssetPartKey(scope, part.sha256)))]
  for (let i = 0; i < keys.length; i += 1000)
    await store.delete(keys.slice(i, i + 1000))
}
