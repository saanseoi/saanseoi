import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { and, eq } from 'drizzle-orm'

import type { HistoryDatabase } from '@repo/db'
import { historySchema } from '@repo/db'

import { buildMatchKey } from '@repo/core/pipeline/services/addressPipeline/normalization'
import type {
  AddressCurrentLookupCache,
  AddressCurrentLookupEntry,
} from '@repo/core/pipeline/services/addressPipeline/types'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const ADDRESS_LOOKUP_CACHE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/address-cache')

type AddressCurrentLookupCacheFile = {
  builtAt: string
  entries: Array<{
    id: string
    matchKey: string | null
    versionHash: string
  }>
  kind: 'address.current-lookup.v1'
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

  if (parsed.kind !== 'address.current-lookup.v1') {
    return null
  }

  const byId = new Map<string, AddressCurrentLookupEntry>()
  const byMatchKey = new Map<string, AddressCurrentLookupEntry>()

  for (const entry of parsed.entries) {
    const value = {
      id: entry.id,
      versionHash: entry.versionHash,
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
  const rows = await historyDb
    .select({
      id: historySchema.address2d.id,
      districtId: historySchema.address2d.districtId,
      streetName: historySchema.address2dI18n.streetName,
      streetNumber: historySchema.address2dI18n.streetNumber,
      versionHash: historySchema.address2d.versionHash,
    })
    .from(historySchema.address2d)
    .leftJoin(
      historySchema.address2dI18n,
      and(
        eq(historySchema.address2d.id, historySchema.address2dI18n.addressId),
        eq(historySchema.address2dI18n.isCurrent, true),
        eq(historySchema.address2dI18n.locale, 'en'),
      ),
    )
    .where(eq(historySchema.address2d.isCurrent, true))
    .all()

  const entries = rows.map(row => ({
    id: row.id,
    matchKey: buildMatchKey({
      districtId: row.districtId,
      streetName: row.streetName ?? null,
      streetNumber: row.streetNumber ?? null,
    }),
    versionHash: row.versionHash,
  }))
  const cacheFile: AddressCurrentLookupCacheFile = {
    builtAt: new Date().toISOString(),
    entries,
    kind: 'address.current-lookup.v1',
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
