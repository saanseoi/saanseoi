import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { archiveMetadata } from './tilesStorage.ts'

test('archive metadata hashes multi-chunk binary input and empty files exactly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tiles-metadata-'))
  try {
    const path = join(directory, 'source.osm.pbf')
    for (const bytes of [Buffer.alloc(2 * 1024 * 1024 + 17, 0xff), Buffer.alloc(0)]) {
      await writeFile(path, bytes)
      expect(await archiveMetadata(path)).toEqual({
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
    }
    await expect(archiveMetadata(join(directory, 'missing'))).rejects.toThrow()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
