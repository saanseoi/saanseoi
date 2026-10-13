import { createHash } from 'node:crypto'
import type { RemoteR2Bucket, R2Metadata } from './remoteR2Object.ts'
import { retryRemoteR2 } from './remoteR2Retry.ts'

export const EVIDENCE_PART_SIZE = 8 * 1024 * 1024

/** Bounded RPC responses also work for large multipart objects without R2 SHA-256 metadata. */
export async function* readRemoteObject(
  bucket: RemoteR2Bucket,
  key: string,
  size: number,
  progress: (operation: string) => void,
) {
  for (let offset = 0; offset < size; offset += EVIDENCE_PART_SIZE) {
    const length = Math.min(EVIDENCE_PART_SIZE, size - offset)
    progress(
      `reading chunk ${Math.floor(offset / EVIDENCE_PART_SIZE) + 1}/${Math.ceil(size / EVIDENCE_PART_SIZE)}`,
    )
    yield await retryRemoteR2(async () => {
      const object = await bucket.get(key, { range: { offset, length } })
      if (!object) throw new Error(`R2 object disappeared during verification: ${key}`)
      const bytes = new Uint8Array(await object.arrayBuffer())
      if (bytes.byteLength !== length)
        throw new Error(`R2 object range size mismatch: ${key}`)
      return bytes
    }, progress)
  }
}

export async function hashRemoteObject(
  bucket: RemoteR2Bucket,
  key: string,
  size: number,
  progress: (operation: string) => void,
) {
  const hash = createHash('sha256')
  for await (const bytes of readRemoteObject(bucket, key, size, progress))
    hash.update(bytes)
  return hash.digest('hex')
}

/** Only content-addressed evidence may use multipart completion (which has no onlyIf). */
export async function retainMultipartEvidence(
  bucket: RemoteR2Bucket,
  key: string,
  bytes: Uint8Array,
  metadata: R2Metadata,
  matches: () => Promise<boolean>,
  progress: (operation: string) => void,
) {
  if (bytes.byteLength <= EVIDENCE_PART_SIZE || !key.startsWith('evidence/sha256/'))
    return false
  if (key !== `evidence/sha256/${createHash('sha256').update(bytes).digest('hex')}`)
    throw new Error('Evidence multipart key does not match SHA-256.')
  if (!bucket.createMultipartUpload)
    throw new Error('R2 multipart uploads unavailable.')
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: metadata })
  try {
    const parts: { partNumber: number; etag: string }[] = []
    for (let offset = 0; offset < bytes.byteLength; offset += EVIDENCE_PART_SIZE) {
      const partNumber = parts.length + 1
      const part = bytes.subarray(offset, offset + EVIDENCE_PART_SIZE)
      progress(
        `uploading chunk ${partNumber}/${Math.ceil(bytes.byteLength / EVIDENCE_PART_SIZE)}`,
      )
      // Retrying the same number replaces only this upload's part, with the same bytes.
      parts.push(
        await retryRemoteR2(() => upload.uploadPart(partNumber, part), progress),
      )
    }
    // Legitimate concurrent writers have the same hash-addressed bytes. Detect an
    // existing conflicting object before completing, as with source-file transfers.
    if (await matches()) await upload.abort()
    else {
      progress('completing multipart upload')
      await upload.complete(parts)
    }
  } catch (error) {
    await upload.abort().catch(() => {})
    // Completion may commit even when its response is lost.
    if (!(await matches())) throw error
  }
  if (!(await matches()))
    throw new Error(`R2 object missing after multipart upload: ${key}`)
  return true
}
