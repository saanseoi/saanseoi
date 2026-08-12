import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { HistoryDatabase } from '@repo/db'

import type { HarbourReadableDb } from '@repo/core/db/types'
import { getCurrentAddressVersionMap } from '@repo/core/pipeline/db/address'
import {
  buildAddressBaseHashInput,
  buildMatchKey,
  normaliseAddressI18nSnapshotRow,
} from '@repo/core/pipeline/services/addressPipeline/normalisation'
import type {
  AddressCurrentLookupCache,
  AddressCurrentLookupEntry,
} from '@repo/core/pipeline/services/addressPipeline/types'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const ADDRESS_LOOKUP_CACHE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/address-cache')

type AddressCurrentLookupCacheFile = {
  builtAt: string
  entries: Array<{
    churnHash: string
    id: string
    matchKey: string | null
  }>
  kind: 'address.current-lookup.v2'
  releaseCode: string
  target: 'local' | 'preview' | 'production'
}

export async function loadAddressCurrentLookupCache(
  target: 'local' | 'preview' | 'production',
  regionCode: string,
) {
  const cachePath = resolveCachePath(target, regionCode)
  const raw = await readFile(cachePath, 'utf8').catch(error => {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  })

  if (!raw) {
    return null
  }

  const parsed = JSON.parse(raw) as AddressCurrentLookupCacheFile

  if (parsed.kind !== 'address.current-lookup.v2') {
    return null
  }

  const byId = new Map<string, AddressCurrentLookupEntry>()
  const byMatchKey = new Map<string, AddressCurrentLookupEntry>()

  for (const entry of parsed.entries) {
    const value = {
      churnHash: entry.churnHash,
      id: entry.id,
    } satisfies AddressCurrentLookupEntry

    byId.set(entry.id, value)

    if (entry.matchKey && !byMatchKey.has(entry.matchKey)) {
      byMatchKey.set(entry.matchKey, value)
    }
  }

  return {
    byId,
    byMatchKey,
  } satisfies AddressCurrentLookupCache
}

export async function writeAddressCurrentLookupCache(
  target: 'local' | 'preview' | 'production',
  regionCode: string,
  releaseCode: string,
  historyDb: HistoryDatabase,
) {
  const snapshots = await getCurrentAddressVersionMap(
    historyDb as unknown as HarbourReadableDb,
    {
      buildAddressBaseHashInput,
      buildMatchKey,
      normaliseAddressI18nSnapshotRow,
    },
  )
  const entries = [...snapshots.values()].map(snapshot => ({
    churnHash: snapshot.churnHash,
    id: snapshot.id,
    matchKey: snapshot.matchKey,
  }))
  const cacheFile: AddressCurrentLookupCacheFile = {
    builtAt: new Date().toISOString(),
    entries,
    kind: 'address.current-lookup.v2',
    releaseCode,
    target,
  }
  const cachePath = resolveCachePath(target, regionCode)

  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(cacheFile))
}

function resolveCachePath(
  target: 'local' | 'preview' | 'production',
  regionCode: string,
) {
  return resolve(
    ADDRESS_LOOKUP_CACHE_ROOT,
    target,
    regionCode,
    'current-address-lookup.json',
  )
}

function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === 'ENOENT'
  )
}
