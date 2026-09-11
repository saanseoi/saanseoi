import { createHash } from 'node:crypto'

export type RemoteR2Bucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
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
    let actual = existing.checksums?.sha256
      ? Buffer.from(existing.checksums.sha256).toString('hex')
      : undefined
    if (!actual) {
      progress('verifying bytes')
      const object = await bucket.get(key)
      if (!object) throw new Error(`R2 object disappeared during verification: ${key}`)
      actual = createHash('sha256')
        .update(new Uint8Array(await object.arrayBuffer()))
        .digest('hex')
    }
    if (existing.size !== bytes.byteLength || actual !== sha256)
      throw new Error(`R2 immutable object conflict: ${key}`)
    return true
  }
  if (await matches()) return
  progress('uploading')
  await bucket.put(key, bytes, {
    sha256,
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: metadata,
  })
  if (!(await matches())) throw new Error(`R2 object missing after upload: ${key}`)
}
