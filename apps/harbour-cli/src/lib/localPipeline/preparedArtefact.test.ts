import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareCachedArtefact } from './preparedArtefact.ts'

test('streamed preparation bounds chunks, isolates oversized rows and retains order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prepared-chunks-'))
  try {
    const rows = await prepareCachedArtefact({
      directory,
      inputs: { contract: 'stream-test' },
      generate: async function* () {
        for (let id = 0; id < 100; id++) yield { id, text: '中'.repeat(22_000) }
        yield { id: 100, text: 'x'.repeat(5 * 1024 * 1024) }
        yield { id: 101, text: 'last' }
      },
    })
    const manifest = JSON.parse(
      await readFile(join(directory, 'artefact.json'), 'utf8'),
    ) as { chunks: Array<{ bytes: number; rows: number }> }
    expect(manifest.chunks.length).toBeGreaterThan(2)
    expect(manifest.chunks.reduce((sum, chunk) => sum + chunk.rows, 0)).toBe(102)
    for (const chunk of manifest.chunks)
      expect(chunk.bytes <= 4 * 1024 * 1024 || chunk.rows === 1).toBe(true)
    const resumed = await prepareCachedArtefact<(typeof rows)[number]>({
      directory,
      inputs: { contract: 'stream-test' },
      generate: async () => {
        throw new Error('must not regenerate')
      },
    })
    expect(resumed).toEqual(rows)
    // Reordering chunks is detected before returning any prepared rows.
    manifest.chunks.reverse()
    await writeFile(join(directory, 'artefact.json'), JSON.stringify(manifest))
    await expect(
      prepareCachedArtefact({
        directory,
        inputs: { contract: 'stream-test' },
        generate: async () => [],
      }),
    ).rejects.toThrow('manifest is invalid')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('interrupted streamed preparation leaves no committed manifest and can retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prepared-stream-failure-'))
  try {
    await expect(
      prepareCachedArtefact({
        directory,
        inputs: {},
        generate: async function* () {
          yield 'x'.repeat(5 * 1024 * 1024)
          throw new Error('stream interrupted')
        },
      }),
    ).rejects.toThrow('stream interrupted')
    expect((await readdir(directory)).some(name => name.endsWith('.bin'))).toBe(true)
    expect(await readdir(directory)).not.toContain('artefact.json')
    expect(
      await prepareCachedArtefact({
        directory,
        inputs: {},
        generate: async () => ['retry'],
      }),
    ).toEqual(['retry'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('prepared artefacts preserve binary rows and timestamps, skip work, and reject changed inputs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prepared-artefact-'))
  try {
    let generated = 0
    const input = {
      directory,
      inputs: { source: 'checksum', release: 'release', contract: 'v1' },
      generate: async () => {
        generated++
        return [
          {
            geometry: new Uint8Array([0, 255]),
            createdAt: 'frozen',
            values: new Map([['population', 42]]),
          },
        ]
      },
    }
    const first = await prepareCachedArtefact(input)
    expect(
      await prepareCachedArtefact<(typeof first)[number]>({
        ...input,
        generate: async () => {
          throw new Error('must not regenerate')
        },
      }),
    ).toEqual(first)
    expect(generated).toBe(1)
    await expect(
      prepareCachedArtefact({
        ...input,
        inputs: { ...input.inputs, source: 'changed' },
      }),
    ).rejects.toThrow('inputs changed')
    expect(generated).toBe(1)
    const manifest = JSON.parse(
      await readFile(join(directory, 'artefact.json'), 'utf8'),
    )
    await writeFile(join(directory, `${manifest.chunks[0].sha256}.bin`), 'corrupted')
    await expect(prepareCachedArtefact(input)).rejects.toThrow('checksum differs')
    expect(generated).toBe(1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('failed preparation can retry but invalid retained manifests cannot regenerate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prepared-artefact-fail-'))
  try {
    await expect(
      prepareCachedArtefact({
        directory,
        inputs: {},
        generate: async () => {
          throw new Error('interrupted')
        },
      }),
    ).rejects.toThrow('interrupted')
    expect(
      await prepareCachedArtefact({
        directory,
        inputs: {},
        generate: async () => ['complete'],
      }),
    ).toEqual(['complete'])
    await writeFile(join(directory, 'artefact.json'), 'null')
    let generated = false
    await expect(
      prepareCachedArtefact({
        directory,
        inputs: {},
        generate: async () => {
          generated = true
          return []
        },
      }),
    ).rejects.toThrow('manifest is invalid')
    expect(generated).toBe(false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
