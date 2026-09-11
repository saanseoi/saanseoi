import { createHash } from 'node:crypto'
import type { SourceAssetStore } from '../lib/services/sourceAssetTransfer'

/** Bounded fixtures with real checksums, conditional writes and injected R2 failures. */
export function createSourceAssetTestStore() {
  type Stored = {
    bytes: Uint8Array
    sha256?: string
    customMetadata?: Record<string, string>
  }
  const objects = new Map<string, Stored>()
  const writes: string[] = []
  const failures = { uploadPart: 0, lostCompletion: false }
  let multipartStarts = 0
  let aborted = 0
  const head = (value: Stored) => ({
    size: value.bytes.byteLength,
    checksums: value.sha256
      ? { sha256: Uint8Array.from(Buffer.from(value.sha256, 'hex')).buffer }
      : undefined,
    customMetadata: value.customMetadata,
  })
  const store: SourceAssetStore = {
    async head(key) {
      const value = objects.get(key)
      return value ? head(value) : null
    },
    async get(key) {
      const value = objects.get(key)
      if (!value) return null
      let position = 0
      return {
        ...head(value),
        body: new ReadableStream<Uint8Array>({
          pull(controller) {
            if (position >= value.bytes.length) {
              controller.close()
              return
            }
            const chunk = value.bytes.slice(position, position + 64 * 1024)
            position += chunk.length
            controller.enqueue(chunk)
          },
        }),
      }
    },
    async put(key, bytes, options) {
      if (options.onlyIf && objects.has(key)) return null
      if (options.sha256 && hash(bytes) !== options.sha256)
        throw new Error('R2 checksum mismatch')
      writes.push(key)
      objects.set(key, {
        bytes: bytes.slice(),
        sha256: options.sha256,
        customMetadata: options.customMetadata,
      })
      return {}
    },
    async delete(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) objects.delete(key)
    },
    async createMultipartUpload(key, options) {
      multipartStarts++
      const parts = new Map<number, Uint8Array>()
      return {
        async uploadPart(index, body) {
          if (failures.uploadPart === index) {
            failures.uploadPart = 0
            throw new Error('interrupted assembly')
          }
          parts.set(index, body.slice())
          return { partNumber: index, etag: hash(body) }
        },
        async complete(receipts) {
          const data = receipts.map(part => {
            const bytes = parts.get(part.partNumber)
            if (!bytes || hash(bytes) !== part.etag)
              throw new Error('invalid R2 part receipt')
            return bytes
          })
          objects.set(key, {
            bytes: new Uint8Array(Buffer.concat(data)),
            customMetadata: options.customMetadata,
          })
          writes.push(key)
          if (failures.lostCompletion) {
            failures.lostCompletion = false
            throw new Error('lost completion response')
          }
          return {}
        },
        async abort() {
          aborted++
          parts.clear()
        },
      }
    },
  }
  return {
    store,
    objects,
    writes,
    failures,
    get multipartStarts() {
      return multipartStarts
    },
    get aborted() {
      return aborted
    },
  }
}
export const hash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')
