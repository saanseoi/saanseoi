import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { cancel, isCancel, text } from '@clack/prompts'

import type { UploadPlan } from '@repo/core'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const CACHE_PATH = resolve(REPO_ROOT, '.local/harbour/release-note-cache.json')

type ReleaseNoteCache = {
  version: 1
  entries: Record<string, string>
}

const overtureVersions = [
  '2025-07-23.0',
  '2025-08-20.0',
  '2025-09-24.0',
  '2025-10-22.0',
  '2025-11-19.0',
  '2025-12-17.0',
  '2026-01-21.0',
  '2026-02-18.0',
  '2026-03-18.0',
  '2026-04-15.0',
  '2026-05-20.0',
  '2026-06-17.0',
] as const

const builtInEntries = Object.fromEntries(
  overtureVersions.flatMap(sourceVersion =>
    (['address', 'division', 'place'] as const).map(type => [
      cacheKey({ source: 'overture', regionCode: 'hk', type, sourceVersion }),
      `${overtureReleaseNotesUrl(sourceVersion)}#${type === 'address' ? 'addresses' : `${type}s`}`,
    ]),
  ),
)

function cacheKey(
  input: Pick<UploadPlan, 'source' | 'regionCode' | 'type' | 'sourceVersion'>,
) {
  return [input.source, input.regionCode, input.type, input.sourceVersion]
    .map(value => value.trim().toLowerCase())
    .join(':')
}

function overtureReleaseNotesUrl(sourceVersion: string) {
  const [year, month, day] = sourceVersion.split('.')[0]?.split('-') ?? []
  return `https://docs.overturemaps.org/blog/${year}/${month}/${day}/release-notes/`
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

async function readCache(): Promise<ReleaseNoteCache> {
  const raw = await readFile(CACHE_PATH, 'utf8').catch(() => null)

  if (!raw) return { version: 1, entries: {} }

  try {
    const parsed = JSON.parse(raw) as Partial<ReleaseNoteCache>
    return parsed.version === 1 && parsed.entries
      ? { version: 1, entries: parsed.entries }
      : { version: 1, entries: {} }
  } catch {
    return { version: 1, entries: {} }
  }
}

async function writeCache(cache: ReleaseNoteCache) {
  await mkdir(dirname(CACHE_PATH), { recursive: true })
  await writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`)
}

export async function resolveReleaseNotesUrl(
  plan: UploadPlan,
  options: { explicitUrl?: string; skipPrompt: boolean },
) {
  const key = cacheKey(plan)
  const explicitUrl = options.explicitUrl?.trim()

  if (explicitUrl) {
    if (!isHttpUrl(explicitUrl)) {
      throw new Error('Release notes URL must be an absolute HTTP(S) URL.')
    }

    const cache = await readCache()
    cache.entries[key] = explicitUrl
    await writeCache(cache)
    return explicitUrl
  }

  const cachedUrl = builtInEntries[key] ?? (await readCache()).entries[key]
  if (cachedUrl) return cachedUrl

  if (options.skipPrompt) {
    throw new Error(
      `No upstream release-notes URL is cached for ${key}. Pass --release-notes-url URL.`,
    )
  }

  const result = await text({
    message: `Upstream release notes for ${plan.sourceVersion} (${plan.type})`,
    placeholder: 'https://…',
    validate: value =>
      isHttpUrl(value?.trim() ?? '') ? undefined : 'Enter an absolute HTTP(S) URL.',
  })

  if (isCancel(result)) {
    cancel('UPLOAD CANCELLED')
    process.exit(1)
  }

  const releaseNotesUrl = result.trim()
  const cache = await readCache()
  cache.entries[key] = releaseNotesUrl
  await writeCache(cache)
  return releaseNotesUrl
}
