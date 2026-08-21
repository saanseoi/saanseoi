import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { cancel, isCancel, text } from '@clack/prompts'

import type { UploadPlan } from '@repo/core'

import { formatInteractiveRetry } from '../cli/interactiveRetry.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const CACHE_PATH = resolve(REPO_ROOT, '.local/harbour/release-note-cache.json')

type ReleaseNoteCache = {
  version: 2
  entries: Record<string, string>
}

function cacheKey(releaseCode: string) {
  return releaseCode.trim().toLowerCase()
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

  if (!raw) return { version: 2, entries: {} }

  try {
    const parsed = JSON.parse(raw) as { entries?: unknown; version?: number }
    if (parsed.version === 2 && isReleaseNoteEntries(parsed.entries)) {
      return { version: 2, entries: parsed.entries }
    }

    if (parsed.version === 1 && isReleaseNoteEntries(parsed.entries)) {
      const cache = { version: 2 as const, entries: migrateV1Entries(parsed.entries) }
      await writeCache(cache)
      return cache
    }

    return { version: 2, entries: {} }
  } catch {
    return { version: 2, entries: {} }
  }
}

function isReleaseNoteEntries(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(entry => typeof entry === 'string')
  )
}

function migrateV1Entries(entries: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(entries).flatMap(([legacyKey, url]) => {
      const [source, regionCode, type, sourceVersion, ...rest] = legacyKey.split(':')
      if (!source || !regionCode || !type || !sourceVersion || rest.length > 0) {
        return []
      }

      const releaseType =
        source === 'hkgov-had' && type === 'divisionarea' ? 'district' : type
      return [
        [cacheKey(`${source}-${regionCode}-${sourceVersion}-${releaseType}`), url],
      ]
    }),
  )
}

async function writeCache(cache: ReleaseNoteCache) {
  await mkdir(dirname(CACHE_PATH), { recursive: true })
  await writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`)
}

export function parseFixtureReleaseNotesUrl(content: string) {
  const match = content.match(/^releaseNotesUrl:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/m)
  return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim()
}

async function readFixtureReleaseNotesUrl(plan: UploadPlan) {
  const fixturePath = resolve(
    REPO_ROOT,
    'fixtures/meta/releases',
    plan.datasetCode,
    `${plan.releaseCode}.md`,
  )
  const content = await readFile(fixturePath, 'utf8').catch(() => null)
  const url = content ? parseFixtureReleaseNotesUrl(content) : undefined

  if (url && !isHttpUrl(url)) {
    throw new Error(`Release fixture has an invalid releaseNotesUrl: ${fixturePath}`)
  }

  return url
}

export async function resolveReleaseNotesUrl(
  plan: UploadPlan,
  options: {
    explicitUrl?: string
    interactiveRetryCommand?: string
    skipPrompt: boolean
  },
) {
  const key = cacheKey(plan.releaseCode)
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

  const fixtureUrl = await readFixtureReleaseNotesUrl(plan)
  const cachedUrl = fixtureUrl ?? (await readCache()).entries[key]
  if (cachedUrl) return cachedUrl

  if (options.skipPrompt) {
    const retry = options.interactiveRetryCommand
      ? `\n\n${formatInteractiveRetry(options.interactiveRetryCommand)}`
      : ''
    throw new Error(
      `No upstream release-notes URL is cached for ${key}. Pass --release-notes-url URL.${retry}`,
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
