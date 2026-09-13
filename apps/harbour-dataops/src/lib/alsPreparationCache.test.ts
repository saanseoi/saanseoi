import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fingerprintTree } from './isolatedAlsReview.ts'
import { cachedAlsPreparation } from './alsPreparationCache.ts'

test('preparation reuse checks every output, input identity and incomplete attempts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-preparation-cache-'))
  const outputFile = join(directory, 'prepared.parquet')
  const input = { outputFile, sourceVersion: '2025-01-01.0' } as Parameters<
    typeof cachedAlsPreparation
  >[0]
  let generated = 0
  let key = 'first'
  const prepare = async () => {
    generated++
    for (const suffix of [
      '',
      '.address3d.jsonl',
      '.address3d.meta.json',
      '.audit.json',
      '.membership.json',
    ])
      await writeFile(`${outputFile}${suffix}`, `contents-${generated}`)
    return {
      outputFile,
      membership: { path: `${outputFile}.membership.json` },
    } as Awaited<ReturnType<typeof cachedAlsPreparation>>
  }
  const run = () => cachedAlsPreparation(input, prepare, async () => key)
  try {
    const first = await run()
    expect(await run()).toEqual(first)
    expect(generated).toBe(1)
    // Same-sized edits also invalidate reuse.
    await writeFile(`${outputFile}.audit.json`, 'contents-X')
    await run()
    expect(generated).toBe(2)
    await rm(`${outputFile}.address3d.jsonl`)
    await run()
    expect(generated).toBe(3)
    key = 'changed-curation-or-source-or-division'
    await run()
    expect(generated).toBe(4)
    await writeFile(`${outputFile}.preparation-cache.json`, '{truncated')
    await run()
    expect(generated).toBe(5)
    const checkpoint = `${outputFile}.preparation-cache.json`
    const corrupted = await Bun.file(checkpoint).json()
    corrupted.result.identityRecords = [{ id: 'corrupted' }]
    await writeFile(checkpoint, JSON.stringify(corrupted))
    await run()
    expect(generated).toBe(6)
    key = 'before'
    await expect(
      cachedAlsPreparation(
        input,
        async () => {
          const result = await prepare()
          key = 'after'
          return result
        },
        async () => key,
      ),
    ).rejects.toThrow('dependencies changed')
    await run()
    expect(generated).toBe(8)
    await cachedAlsPreparation(
      {
        ...input,
        args: {
          command: 'hkgov-dpo:ingest',
          positionals: [],
          options: { 'no-cache-artefacts': true },
        },
      },
      prepare,
      async () => {
        throw new Error('Cache opt-out must not fingerprint')
      },
    )
    expect(generated).toBe(9)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('runtime fingerprint ignores test edits but detects runtime code edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-runtime-key-'))
  const exclude = (file: string) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
  try {
    await writeFile(join(directory, 'source.ts'), 'runtime-a')
    await writeFile(join(directory, 'source.test.ts'), 'test-a')
    const before = await fingerprintTree(directory, exclude)
    await writeFile(join(directory, 'source.test.ts'), 'test-b')
    expect(await fingerprintTree(directory, exclude)).toBe(before)
    await writeFile(join(directory, 'source.ts'), 'runtime-b')
    expect(await fingerprintTree(directory, exclude)).not.toBe(before)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
