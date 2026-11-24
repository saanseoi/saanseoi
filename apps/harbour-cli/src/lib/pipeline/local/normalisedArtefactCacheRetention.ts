import { lstat, readdir, realpath, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { withDeliveryLock } from './sqlDeliveryFiles'
import policy from '../../../../../../scripts/local-artefact-retention-policy.json'

const DAY = 86_400_000
const missing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

/** Only immutable, regenerable cache entries are eligible; never source archives. */
export async function pruneNormalisedArtefactCache(
  directory: string,
  now = Date.now(),
) {
  if ((await realpath(directory)) !== resolve(directory))
    throw new Error('Normalised cache retention refuses symlinked directories.')
  return withDeliveryLock(directory, () => pruneUnlocked(directory, now))
}

async function pruneUnlocked(directory: string, now: number) {
  const entries = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (!item.isFile() || !/^[a-f0-9]{64}\.bin$/.test(item.name)) continue
    const path = resolve(directory, item.name)
    try {
      const stat = await lstat(path)
      if (!stat.isFile()) continue
      entries.push({ path, stat })
    } catch (error) {
      if (!missing(error)) throw error
    }
  }
  let bytes = entries.reduce((total, entry) => total + entry.stat.size, 0)
  let removed = 0
  for (const { path, stat } of entries.sort(
    (a, b) => a.stat.mtimeMs - b.stat.mtimeMs,
  )) {
    const age = now - stat.mtimeMs
    if (age < policy.normalisedCacheGraceDays * DAY) continue
    if (
      age <= policy.normalisedCacheMaxDays * DAY &&
      bytes <= policy.normalisedCacheMaxBytes
    )
      continue
    try {
      await lstat(`${path}.keep`)
      continue
    } catch (error) {
      if (!missing(error)) throw error
    }
    try {
      const current = await lstat(path)
      // A concurrent atomic cache rewrite must not be removed as an old entry.
      if (
        !current.isFile() ||
        current.ino !== stat.ino ||
        current.dev !== stat.dev ||
        current.mtimeMs !== stat.mtimeMs ||
        current.ctimeMs !== stat.ctimeMs ||
        current.size !== stat.size
      )
        continue
      await unlink(path)
      bytes -= stat.size
      removed++
    } catch (error) {
      if (!missing(error)) throw error
    }
  }
  return { removed, bytes }
}
