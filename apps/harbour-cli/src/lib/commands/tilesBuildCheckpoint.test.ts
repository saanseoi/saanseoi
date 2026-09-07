import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { retainTilesBuild } from './tilesBuildCheckpoint.ts'

test('Basemap completed builds reuse bytes and provenance but reject changed inputs or archives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tiles-build-'))
  const outputPath = join(root, 'test.pmtiles')
  const input = { outputPath, inputs: { source: 'sha', image: 'pinned' }, force: false }
  try {
    const result = await retainTilesBuild({
      ...input,
      build: async path => {
        await writeFile(path, 'archive bytes')
        return { builtAt: 'original', commit: 'pinned' }
      },
    })
    const mustNotBuild = async (): Promise<Record<string, unknown>> => {
      throw new Error('must not rebuild')
    }
    expect(await retainTilesBuild({ ...input, build: mustNotBuild })).toEqual(result)
    await expect(
      retainTilesBuild({
        ...input,
        inputs: { source: 'changed' },
        build: mustNotBuild,
      }),
    ).rejects.toThrow('inputs changed')
    await writeFile(outputPath, 'corrupt')
    await expect(retainTilesBuild({ ...input, build: mustNotBuild })).rejects.toThrow(
      'checksum differs',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('failed forced Basemap builds preserve the previous archive and completed checkpoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tiles-build-failure-'))
  const input = {
    outputPath: join(root, 'test.pmtiles'),
    inputs: { source: 'same' },
    force: false,
  }
  try {
    await retainTilesBuild({
      ...input,
      build: async path => {
        await writeFile(path, 'original')
        return { builtAt: 'original' }
      },
    })
    await expect(
      retainTilesBuild({
        ...input,
        force: true,
        build: async path => {
          await writeFile(path, 'partial')
          throw new Error('build failed')
        },
      }),
    ).rejects.toThrow('build failed')
    expect(await readFile(input.outputPath, 'utf8')).toBe('original')
    expect(
      await retainTilesBuild<Record<string, unknown>>({
        ...input,
        build: async () => {
          throw new Error('must not build')
        },
      }),
    ).toEqual({ builtAt: 'original' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
