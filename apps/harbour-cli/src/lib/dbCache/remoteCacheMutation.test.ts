import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withRemoteCacheMutation } from './remoteCacheMutation.ts'

test('blocks readers before remote work and clears the marker only after replay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'harbour-cache-mutation-'))
  const marker = join(dir, 'invalidated.json')
  try {
    await writeFile(join(dir, 'manifest.json'), 'original manifest')
    const result = await withRemoteCacheMutation(dir, 'reset incomplete', async () => {
      expect(JSON.parse(await readFile(marker, 'utf8')).reason).toBe('reset incomplete')
      await expect(
        withRemoteCacheMutation(dir, 'competing reset', async () => {}),
      ).rejects.toThrow()
      return 'replayed'
    })
    expect(result).toBe('replayed')
    expect(await Bun.file(marker).exists()).toBe(false)
    expect(await readFile(join(dir, 'manifest.json'), 'utf8')).toBe('original manifest')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test.each(['remote execution', 'local replay'])(
  'keeps the cache invalid after failure in %s',
  async phase => {
    const dir = await mkdtemp(join(tmpdir(), 'harbour-cache-mutation-'))
    try {
      const failure = new Error(phase)
      await expect(
        withRemoteCacheMutation(dir, 'reset incomplete', async () => {
          throw failure
        }),
      ).rejects.toBe(failure)
      expect(await Bun.file(join(dir, 'invalidated.json')).exists()).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
)
