import { expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readJsonArtefact,
  writeJsonArtefact,
  writeTextArtefact,
} from '@repo/core/pipeline/services/storage/artefacts'
import { LocalChunkBucket } from './localChunkBucket.ts'

test('chunk intermediates stay bounded to their owner while SQL remains durable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'local-chunk-'))
  try {
    const one = new LocalChunkBucket(directory)
    const two = new LocalChunkBucket(directory)
    const value = { rows: [{ id: 'a', name: '香港', coordinate: null }] }
    await writeJsonArtefact(one, 'chunk.json', value)
    expect(await readJsonArtefact<typeof value>(one, 'chunk.json')).toEqual(value)
    await expect(readJsonArtefact(two, 'chunk.json')).rejects.toThrow('Missing chunk')
    expect(await readdir(directory)).toEqual([])
    await writeTextArtefact(one, 'current.sql', 'SELECT 1;', 'application/sql')
    expect(
      new TextDecoder().decode(await (await two.get('current.sql'))!.arrayBuffer()),
    ).toBe('SELECT 1;')
    one.clear()
    await expect(readJsonArtefact(one, 'chunk.json')).rejects.toThrow('Missing chunk')
    expect(await two.head('current.sql')).toEqual({ size: 9 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
