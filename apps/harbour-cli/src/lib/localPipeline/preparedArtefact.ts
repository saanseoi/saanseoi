import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deserialize, serialize } from 'node:v8'
import { sha256, withDeliveryLock, writeDeliveryFile } from './sqlDeliveryFiles.ts'

const CHUNK_BYTES = 4 * 1024 * 1024
type Chunk = { sha256: string; bytes: number; rows: number }
type Manifest = { version: 2; identity: string; chunks: Chunk[]; checksum: string }

/** Immutable row preparation with bounded serialisation buffers and exact row order. */
export async function prepareCachedArtefact<T>(input: {
  directory: string
  inputs: Record<string, unknown>
  generate: () => Promise<T[]> | AsyncIterable<T>
}): Promise<T[]> {
  return withDeliveryLock(input.directory, async () => {
    const identity = sha256(JSON.stringify(input.inputs))
    let manifest: Manifest | undefined
    try {
      manifest = JSON.parse(
        await readFile(join(input.directory, 'artefact.json'), 'utf8'),
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (manifest !== undefined) {
      if (
        manifest?.version !== 2 ||
        manifest.identity !== identity ||
        !Array.isArray(manifest.chunks) ||
        manifest.checksum !==
          sha256(JSON.stringify({ identity, chunks: manifest.chunks })) ||
        manifest.chunks.some(
          chunk =>
            !chunk ||
            !/^[a-f0-9]{64}$/.test(chunk.sha256) ||
            !Number.isSafeInteger(chunk.bytes) ||
            chunk.bytes < 4 ||
            !Number.isSafeInteger(chunk.rows) ||
            chunk.rows < 1,
        )
      )
        throw new Error(
          'Prepared artefact inputs changed or manifest is invalid; refusing stale preparation.',
        )
      const rows: T[] = []
      for (const chunk of manifest.chunks) {
        const payload = await readFile(join(input.directory, `${chunk.sha256}.bin`))
        if (payload.length !== chunk.bytes || sha256(payload) !== chunk.sha256)
          throw new Error(
            'Prepared artefact checksum differs; refusing corrupted preparation.',
          )
        let count = 0
        for (let offset = 0; offset < payload.length; ) {
          if (offset + 4 > payload.length)
            throw new Error('Truncated prepared row header.')
          const length = payload.readUInt32BE(offset)
          offset += 4
          if (length === 0 || offset + length > payload.length)
            throw new Error('Truncated prepared row payload.')
          rows.push(deserialize(payload.subarray(offset, offset + length)) as T)
          offset += length
          count++
        }
        if (count !== chunk.rows)
          throw new Error('Prepared artefact row count differs.')
      }
      return rows
    }
    const rows: T[] = []
    const chunks: Chunk[] = []
    let frames: Buffer[] = []
    let bytes = 0
    let count = 0
    const flush = async () => {
      if (!count) return
      const payload = Buffer.concat(frames, bytes)
      const digest = sha256(payload)
      await writeDeliveryFile(input.directory, `${digest}.bin`, payload)
      chunks.push({ sha256: digest, bytes, rows: count })
      frames = []
      bytes = 0
      count = 0
    }
    for await (const row of await input.generate()) {
      const payload = serialize(row)
      if (payload.length > 0xffffffff)
        throw new Error('Prepared row exceeds the frame size limit.')
      if (bytes + payload.length + 4 > CHUNK_BYTES) await flush()
      const header = Buffer.allocUnsafe(4)
      header.writeUInt32BE(payload.length)
      frames.push(header, payload)
      bytes += payload.length + 4
      count++
      rows.push(row)
      // A single oversized row gets its own chunk, never a cohort-sized buffer.
      if (bytes >= CHUNK_BYTES) await flush()
    }
    await flush()
    // Publish only after every chunk is durable. Partial generation never seals.
    await writeDeliveryFile(
      input.directory,
      'artefact.json',
      JSON.stringify({
        version: 2,
        identity,
        chunks,
        checksum: sha256(JSON.stringify({ identity, chunks })),
      } satisfies Manifest),
    )
    return rows
  })
}
