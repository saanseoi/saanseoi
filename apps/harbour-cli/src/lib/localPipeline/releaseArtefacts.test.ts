import { expect, test } from 'bun:test'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  discardDerivedReleaseArtefacts,
  shouldCacheArtefacts,
} from './releaseArtefacts.ts'

test('discards derived artefacts while retaining the source object and state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'harbour-release-artefacts-'))
  const releaseCode = 'dr-hk-example-address-2026-01-01.0'
  const releaseRoot = join(root, 'remote', releaseCode)

  try {
    await mkdir(join(releaseRoot, 'objects/processed/address'), { recursive: true })
    await mkdir(join(releaseRoot, 'objects/hk/example/2026-01-01.0'), {
      recursive: true,
    })
    await writeFile(join(releaseRoot, 'state.json'), '{"status":"published"}\n')
    await writeFile(
      join(releaseRoot, 'objects/hk/example/2026-01-01.0/source.parquet'),
      'raw source',
    )
    await writeFile(
      join(releaseRoot, 'objects/processed/address/normalised.json'),
      'derived rows',
    )

    await discardDerivedReleaseArtefacts(
      { environment: 'production', remote: true },
      releaseCode,
      root,
    )

    await expect(
      readFile(
        join(releaseRoot, 'objects/hk/example/2026-01-01.0/source.parquet'),
        'utf8',
      ),
    ).resolves.toBe('raw source')
    await expect(readFile(join(releaseRoot, 'state.json'), 'utf8')).resolves.toContain(
      'published',
    )
    await expect(access(join(releaseRoot, 'objects/processed'))).rejects.toThrow()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('recognises both cache artefact flag spellings', () => {
  expect(shouldCacheArtefacts({ cacheArtefacts: true })).toBe(true)
  expect(shouldCacheArtefacts({ 'cache-artefacts': true })).toBe(true)
})

test('cleans both supported remote release workspace layouts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'harbour-release-artefacts-'))
  const releaseCode = 'dr-hk-example-address-2026-01-01.0'

  try {
    for (const targetDirectory of ['production', 'remote']) {
      const processedRoot = join(
        root,
        targetDirectory,
        releaseCode,
        'objects/processed',
      )
      await mkdir(processedRoot, { recursive: true })
      await writeFile(join(processedRoot, 'current.sql'), 'derived SQL')
    }

    await discardDerivedReleaseArtefacts(
      { environment: 'production', remote: true },
      releaseCode,
      root,
    )

    for (const targetDirectory of ['production', 'remote']) {
      await expect(
        access(join(root, targetDirectory, releaseCode, 'objects/processed')),
      ).rejects.toThrow()
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('refuses a release code that escapes its target release directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'harbour-release-artefacts-'))

  try {
    await expect(
      discardDerivedReleaseArtefacts(
        { environment: 'dev', remote: false },
        '../../outside-release-root',
        root,
      ),
    ).rejects.toThrow('Refusing to discard artefacts')
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
