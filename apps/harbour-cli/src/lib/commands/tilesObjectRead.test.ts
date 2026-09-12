import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadTilesObject } from './tilesObjectRead.ts'

test('ambiguous and failed R2 downloads retain existing bytes and never mean missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tiles-read-'))
  const path = join(root, 'versions.json')
  try {
    await writeFile(path, 'original')
    for (const stderr of [
      '',
      'Bucket does not exist',
      'Account not found',
      'Authentication failed',
      'Network timed out',
    ]) {
      await expect(
        downloadTilesObject(path, async temporary => {
          await writeFile(temporary, 'partial')
          return { exitCode: 1, stderr, stdout: '' }
        }),
      ).rejects.toThrow('download failed')
      expect(await readFile(path, 'utf8')).toBe('original')
      expect(await readdir(root)).toEqual(['versions.json'])
    }
    await expect(
      downloadTilesObject(path, async temporary => {
        await writeFile(temporary, 'partial')
        throw new Error('process failed')
      }),
    ).rejects.toThrow('process failed')
    expect(await readFile(path, 'utf8')).toBe('original')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('explicit missing keys preserve local bytes and successful reads replace them atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tiles-read-result-'))
  const path = join(root, 'archive.pbf')
  try {
    await writeFile(path, 'original')
    expect(
      await downloadTilesObject(path, async () => ({
        exitCode: 1,
        stderr: 'The specified key does not exist.',
        stdout: '',
      })),
    ).toBe(false)
    expect(await readFile(path, 'utf8')).toBe('original')
    expect(
      await downloadTilesObject(path, async temporary => {
        await writeFile(temporary, 'complete')
        expect(await readFile(path, 'utf8')).toBe('original')
        return { exitCode: 0, stderr: '', stdout: '' }
      }),
    ).toBe(true)
    expect(await readFile(path, 'utf8')).toBe('complete')
    expect(await readdir(root)).toEqual(['archive.pbf'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
