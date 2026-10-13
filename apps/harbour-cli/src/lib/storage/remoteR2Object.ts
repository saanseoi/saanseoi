import { createHash } from 'node:crypto'
import { retainMultipartEvidence, hashRemoteObject } from './remoteR2Multipart.ts'

export type RemoteR2Bucket = {
  get(
    key: string,
    options?: { range: { offset: number; length: number } },
  ): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  createMultipartUpload?(
    key: string,
    options: { httpMetadata: R2Metadata },
  ): Promise<{
    uploadPart(
      partNumber: number,
      bytes: Uint8Array,
    ): Promise<{ partNumber: number; etag: string }>
    complete(parts: { partNumber: number; etag: string }[]): Promise<unknown>
    abort(): Promise<void>
  }>
  head(
    key: string,
  ): Promise<{ size: number; checksums?: { sha256?: ArrayBuffer } } | null>
  put(
    key: string,
    bytes: Uint8Array,
    options: {
      sha256: string
      onlyIf: { etagDoesNotMatch: string }
      httpMetadata: { contentType: string; contentDisposition?: string }
    },
  ): Promise<unknown>
}
export type R2Metadata = { contentType: string; contentDisposition?: string }

/** Shared with Node: no Bun or application imports. */
export async function retainObjectInBucket(
  bucket: RemoteR2Bucket,
  key: string,
  bytes: Uint8Array,
  metadata: R2Metadata,
  progress: (operation: string) => void = () => {},
) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const matches = async () => {
    progress('checking')
    const existing = await bucket.head(key)
    if (!existing) return false
    if (existing.size !== bytes.byteLength)
      throw new Error(`R2 immutable object conflict: ${key}`)
    let actual = existing.checksums?.sha256
      ? Buffer.from(existing.checksums.sha256).toString('hex')
      : undefined
    if (!actual) {
      progress('verifying bytes')
      actual = await hashRemoteObject(bucket, key, existing.size, progress)
    }
    if (existing.size !== bytes.byteLength || actual !== sha256)
      throw new Error(`R2 immutable object conflict: ${key}`)
    return true
  }
  if (await matches()) return
  if (await retainMultipartEvidence(bucket, key, bytes, metadata, matches, progress))
    return
  progress('uploading')
  const written = await bucket.put(key, bytes, {
    sha256,
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: metadata,
  })
  // R2 returns the committed object's metadata and validates the supplied SHA-256.
  // A conditional-write race returns null and still needs independent verification.
  if (
    written &&
    typeof written === 'object' &&
    'size' in written &&
    'checksums' in written
  ) {
    const result = written as { size: number; checksums?: { sha256?: ArrayBuffer } }
    if (result.checksums?.sha256) {
      if (
        result.size !== bytes.byteLength ||
        Buffer.from(result.checksums.sha256).toString('hex') !== sha256
      )
        throw new Error(`R2 immutable object conflict: ${key}`)
      return
    }
  }
  if (!(await matches())) throw new Error(`R2 object missing after upload: ${key}`)
}
