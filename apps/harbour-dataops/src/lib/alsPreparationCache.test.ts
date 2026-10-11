import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fingerprintTree, fingerprintRuntimeTree } from './isolatedAlsReview.ts'
import {
  alsPreparationMetadataFingerprint,
  cachedAlsPreparation,
  preparationCheckpointMatchesKey,
} from './alsPreparationCache.ts'

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
      '.review.json',
      '.membership.json',
    ])
      await writeFile(`${outputFile}${suffix}`, `contents-${generated}`)
    return {
      outputFile,
      membership: { path: `${outputFile}.membership.json` },
      identityRecords: [
        { id: 'Unicode 河 and double " quote', details: [null, { active: true }] },
      ],
      driftCandidates: [],
      omitted: undefined,
    } as unknown as Awaited<ReturnType<typeof cachedAlsPreparation>>
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

test('composition edits during ALS preparation do not invalidate it; processing edits do', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-metadata-key-'))
  const metadata = join(directory, 'meta')
  const outputFile = join(directory, 'prepared.parquet')
  const input = { outputFile, sourceVersion: '2024-07-31.0' } as Parameters<
    typeof cachedAlsPreparation
  >[0]
  const composition = join(metadata, 'datasetInputs/saanseoi-division.json')
  const curation = join(metadata, 'curations/hkgov-dpo-address.json')
  const rule = join(metadata, 'processing-rules/assembly/address-preparation.json')
  let generated = 0
  let editDuringPreparation = composition
  const prepare = async () => {
    generated++
    await writeFile(editDuringPreparation, JSON.stringify({ revision: generated }))
    for (const suffix of [
      '',
      '.address3d.jsonl',
      '.address3d.meta.json',
      '.audit.json',
      '.review.json',
      '.membership.json',
    ])
      await writeFile(`${outputFile}${suffix}`, `contents-${generated}`)
    return {
      outputFile,
      membership: { path: `${outputFile}.membership.json` },
      identityRecords: [
        { id: 'Unicode 河 and double " quote', details: [null, { active: true }] },
      ],
      driftCandidates: [],
      omitted: undefined,
    } as unknown as Awaited<ReturnType<typeof cachedAlsPreparation>>
  }
  const run = () =>
    cachedAlsPreparation(input, prepare, () =>
      alsPreparationMetadataFingerprint(metadata),
    )
  try {
    for (const path of ['datasetInputs', 'curations', 'processing-rules/assembly'])
      await mkdir(join(metadata, path), { recursive: true })
    for (const path of [composition, curation, rule]) await writeFile(path, '{}')
    const first = await run()
    await writeFile(composition, '{"inputs":["ds-hk-hkgov-rvd-division"]}')
    expect(await run()).toEqual(first)
    expect(generated).toBe(1)

    // Real processing edits invalidate both existing caches and in-flight work.
    await writeFile(curation, '{"revision":"updated"}')
    editDuringPreparation = curation
    await expect(run()).rejects.toThrow('dependencies changed')
    expect(generated).toBe(2)
    editDuringPreparation = composition
    await run()
    expect(generated).toBe(3)
    await writeFile(rule, '{"revision":"updated"}')
    editDuringPreparation = rule
    await expect(run()).rejects.toThrow('dependencies changed')
    expect(generated).toBe(4)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('runtime fingerprint ignores erased types while retaining runtime and JSON dependencies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-executable-key-'))
  const source = join(directory, 'source.ts')
  const declaration = join(directory, 'types.d.ts')
  const metadata = join(directory, 'metadata.json')
  try {
    await writeFile(
      source,
      "export const value: string = 'a'; export type Field = string;",
    )
    await writeFile(declaration, 'export interface Label { value: string }')
    await writeFile(metadata, '{"value":1}')
    const before = await fingerprintRuntimeTree(directory)
    await writeFile(
      source,
      "export const value: 'a' = 'a'; export type Field = string | number;",
    )
    await writeFile(
      declaration,
      'export interface Label { value: string; extra?: number }',
    )
    expect(await fingerprintRuntimeTree(directory)).toBe(before)
    await writeFile(
      source,
      "export const value: string = 'b'; export type Field = string | number;",
    )
    expect(await fingerprintRuntimeTree(directory)).not.toBe(before)
    const changed = await fingerprintRuntimeTree(directory)
    await writeFile(metadata, '{"value":2}')
    expect(await fingerprintRuntimeTree(directory)).not.toBe(changed)
    await writeFile(source, 'export const value = ;')
    await expect(fingerprintRuntimeTree(directory)).rejects.toThrow()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('stale preparation checkpoints only read the key prefix', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-stale-checkpoint-'))
  const checkpoint = join(directory, 'large.json')
  const file = await open(checkpoint, 'w')
  try {
    await file.writeFile('{"key":"old","result":')
    await file.truncate(512 * 1024 * 1024)
  } finally {
    await file.close()
  }
  try {
    expect(await preparationCheckpointMatchesKey(checkpoint, 'new')).toBe(false)
    expect(await preparationCheckpointMatchesKey(checkpoint, 'old')).toBe(true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
