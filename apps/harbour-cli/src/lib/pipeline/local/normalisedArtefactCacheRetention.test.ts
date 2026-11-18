import { afterEach, expect, test } from 'bun:test'
import {
  lstat,
  mkdtemp,
  open,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withDeliveryLock } from './sqlDeliveryFiles'
import { pruneNormalisedArtefactCache } from './normalisedArtefactCacheRetention'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

test('expires old cache entries while preserving pins, recent entries, temporary files and symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'normalised-retention-'))
  roots.push(root)
  const old = join(root, `${'a'.repeat(64)}.bin`)
  const pinned = join(root, `${'b'.repeat(64)}.bin`)
  const recent = join(root, `${'c'.repeat(64)}.bin`)
  const link = join(root, `${'d'.repeat(64)}.bin`)
  for (const path of [old, pinned, recent, join(root, 'in-progress.tmp')])
    await writeFile(path, 'retain unless expired')
  const past = new Date(Date.now() - 40 * 86_400_000)
  await utimes(old, past, past)
  await utimes(pinned, past, past)
  await writeFile(`${pinned}.keep`, 'review in progress')
  await symlink(recent, link)
  expect((await pruneNormalisedArtefactCache(root)).removed).toBe(1)
  expect(await Bun.file(old).exists()).toBe(false)
  expect(await readFile(pinned, 'utf8')).toBe('retain unless expired')
  expect(await Bun.file(recent).exists()).toBe(true)
  expect((await lstat(link)).isSymbolicLink()).toBe(true)
  expect(await Bun.file(join(root, 'in-progress.tmp')).exists()).toBe(true)
})

test('refuses a cache directory redirected through a symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'normalised-retention-'))
  roots.push(root)
  const link = join(root, 'redirect')
  await symlink(root, link)
  await expect(pruneNormalisedArtefactCache(link)).rejects.toThrow('symlinked')
})

test('size budget evicts old entries before their age expiry without removing a fresh entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'normalised-retention-'))
  roots.push(root)
  const old = join(root, `${'a'.repeat(64)}.bin`)
  const fresh = join(root, `${'b'.repeat(64)}.bin`)
  const file = await open(old, 'w')
  try {
    await file.truncate(10 * 1024 ** 3)
  } finally {
    await file.close()
  }
  const past = new Date(Date.now() - 2 * 86_400_000)
  await utimes(old, past, past)
  await writeFile(fresh, 'fresh')
  expect((await pruneNormalisedArtefactCache(root)).removed).toBe(1)
  expect(await Bun.file(old).exists()).toBe(false)
  expect(await readFile(fresh, 'utf8')).toBe('fresh')
})

test('an active cache writer blocks pruning until its lock is released', async () => {
  const root = await mkdtemp(join(tmpdir(), 'normalised-retention-'))
  roots.push(root)
  const old = join(root, `${'a'.repeat(64)}.bin`)
  await writeFile(old, 'retained while locked')
  const past = new Date(Date.now() - 40 * 86_400_000)
  await utimes(old, past, past)
  await withDeliveryLock(root, async () => {
    await expect(pruneNormalisedArtefactCache(root)).rejects.toThrow()
    expect(await Bun.file(old).exists()).toBe(true)
  })
  expect((await pruneNormalisedArtefactCache(root)).removed).toBe(1)
})
