import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Metadata fingerprint: detects edits, additions and removals without rereading archives. */
export async function inputFingerprint(paths: string[]): Promise<string> {
  const entries: string[] = []
  async function visit(path: string): Promise<void> {
    try {
      const info = await stat(path)
      if (info.isDirectory()) {
        const children = await readdir(path)
        await Promise.all(children.sort().map(name => visit(resolve(path, name))))
      } else entries.push(`${path}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      entries.push(`${path}:missing`)
    }
  }
  await Promise.all(paths.map(visit))
  return entries.sort().join('\n')
}

/** Share a build, retain successful results, and never cache a build across input edits. */
export function createReviewInputCache<T>(
  fingerprint: () => Promise<string>,
  build: () => Promise<T>,
) {
  let cached: { key: string; value: T } | undefined
  let pending: Promise<T> | undefined
  return async (): Promise<T> => {
    if (pending) return pending
    pending = (async () => {
      const key = await fingerprint()
      if (cached?.key === key) return cached.value
      const value = await build()
      cached = (await fingerprint()) === key ? { key, value } : undefined
      return value
    })()
    try {
      return await pending
    } finally {
      pending = undefined
    }
  }
}
