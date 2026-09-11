import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import {
  SOURCE_ASSET_PART_SIZE,
  SOURCE_ASSET_MAX_PARTS,
  type SourceAssetPart,
} from '../../../../../libs/core/src/lib/services/sourceAssetTransfer.ts'

/** Hash files in bounded reads; never retain a whole source archive in memory. */
export async function inspectSourceAssetFile(path: string) {
  const before = await stat(path)
  if (!before.isFile() || before.size > SOURCE_ASSET_PART_SIZE * SOURCE_ASSET_MAX_PARTS)
    throw new Error(
      'Source retention requires a regular file no larger than 80,000 MiB.',
    )
  const hash = createHash('sha256')
  const parts: SourceAssetPart[] = []
  let chunkHash = createHash('sha256')
  let chunkLength = 0
  let byteLength = 0
  for await (const data of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    hash.update(data)
    byteLength += data.byteLength
    let offset = 0
    while (offset < data.byteLength) {
      const length = Math.min(
        data.byteLength - offset,
        SOURCE_ASSET_PART_SIZE - chunkLength,
      )
      chunkHash.update(data.subarray(offset, offset + length))
      offset += length
      chunkLength += length
      if (chunkLength === SOURCE_ASSET_PART_SIZE) {
        parts.push({ sha256: chunkHash.digest('hex'), byteLength: chunkLength })
        chunkHash = createHash('sha256')
        chunkLength = 0
      }
    }
  }
  if (chunkLength || parts.length === 0)
    parts.push({ sha256: chunkHash.digest('hex'), byteLength: chunkLength })
  const after = await stat(path)
  if (
    before.size !== byteLength ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ino !== after.ino
  )
    throw new Error('Source file changed during hashing; retry with a stable file.')
  return { byteLength, sha256: hash.digest('hex'), parts }
}

export async function readSourceAssetFilePart(
  path: string,
  index: number,
  part: SourceAssetPart,
) {
  const handle = await open(path, 'r')
  try {
    const bytes = new Uint8Array(part.byteLength)
    let offset = 0
    while (offset < bytes.byteLength) {
      const result = await handle.read(
        bytes,
        offset,
        bytes.byteLength - offset,
        index * SOURCE_ASSET_PART_SIZE + offset,
      )
      if (!result.bytesRead) throw new Error('Source file truncated during transfer.')
      offset += result.bytesRead
    }
    if (createHash('sha256').update(bytes).digest('hex') !== part.sha256)
      throw new Error('Source file changed during transfer; chunk SHA-256 mismatch.')
    return bytes
  } finally {
    await handle.close()
  }
}
