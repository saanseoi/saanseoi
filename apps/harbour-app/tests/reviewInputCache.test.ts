import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReviewInputCache, inputFingerprint } from '../reviewInputCache'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

it('reuses unchanged results and rebuilds after file additions, edits and removals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'review-cache-'))
  directories.push(root)
  const path = join(root, 'project.json')
  const build = vi.fn(async () => ({ generation: build.mock.calls.length }))
  const get = createReviewInputCache(() => inputFingerprint([root]), build)
  const first = await get()
  expect(await get()).toBe(first)
  await writeFile(path, 'first')
  expect(await get()).not.toBe(first)
  await writeFile(path, 'second')
  await get()
  await rm(path)
  await get()
  expect(build).toHaveBeenCalledTimes(4)
})

it('shares concurrent builds and retries failures', async () => {
  const build = vi
    .fn()
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValue('ready')
  const get = createReviewInputCache(async () => 'same', build)
  await expect(Promise.all([get(), get()])).rejects.toThrow('unavailable')
  expect(build).toHaveBeenCalledTimes(1)
  expect(await get()).toBe('ready')
  expect(await get()).toBe('ready')
  expect(build).toHaveBeenCalledTimes(2)
})

it('does not retain results if inputs change during generation', async () => {
  let revision = 'before'
  const build = vi.fn(async () => {
    revision = 'after'
    return 'data'
  })
  const get = createReviewInputCache(async () => revision, build)
  await get()
  await get()
  await get()
  expect(build).toHaveBeenCalledTimes(2)
})
