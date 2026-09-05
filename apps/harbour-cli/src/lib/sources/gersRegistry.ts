import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { XMLParser } from 'fast-xml-parser'
import {
  asyncBufferFromFile,
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetRead,
  parquetReadObjects,
} from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

export const OVERTURE_GERS_REGISTRY_PREFIX =
  'https://overturemaps-us-west-2.s3.amazonaws.com/registry/'
export const OVERTURE_GERS_REGISTRY_LIST_URL =
  'https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=registry/'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const DEFAULT_SOURCE_ROOT = resolve(REPO_ROOT, 'data/overture')
const DEFAULT_CACHE_PATH = resolve(
  REPO_ROOT,
  '.local/harbour-sql/gers-registry/cache.json',
)
const CACHE_SCHEMA_VERSION = 1
const REGISTRY_SCAN_CONCURRENCY = 8
const REGISTRY_REQUEST_RETRIES = 5
const REGISTRY_COLUMNS = [
  'id',
  'first_seen',
  'last_seen',
  'last_changed',
  'path',
] as const
const REGISTRY_EVIDENCE_WINDOW_MAX_GAP = 32

type OvertureFeatureType = 'division' | 'place'

export type GersRegistryEntry = {
  firstSeen: string | null
  isGers: true
  lastChanged: string | null
  lastSeen: string | null
  path: string | null
}

export type NonGersRegistryEntry = {
  isGers: false
}

export type GersCacheEntry = GersRegistryEntry | NonGersRegistryEntry

export type GersRegistryCache = {
  entries: Record<string, GersCacheEntry>
  fetchedAt: string
  registryObjects: RegistryObject[]
  schemaVersion: 1
}

export type RegistryObject = {
  key: string
  lastModified: string | null
  size: number
}

export type OvertureGersCoverageRow = {
  gersIds: number
  nonGersIds: number
  sourceType: OvertureFeatureType
  totalIds: number
}

export type OvertureGersCacheResult = {
  cachePath: string
  fetchedIds: number
  coverage: OvertureGersCoverageRow[]
  sourceFiles: number
  unmatchedIds: string[]
}

type SourceIds = Map<string, Set<OvertureFeatureType>>

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export async function cacheOvertureGersRegistry(
  input: {
    cachePath?: string
    fetchImpl?: FetchLike
    onProgress?: (message: string) => void
    refresh?: boolean
    sourceRoot?: string
  } = {},
): Promise<OvertureGersCacheResult> {
  const sourceRoot = resolve(input.sourceRoot ?? DEFAULT_SOURCE_ROOT)
  const cachePath = resolve(input.cachePath ?? DEFAULT_CACHE_PATH)
  const sourceIds = await collectOvertureSourceIds(sourceRoot)
  const existing = await readGersCache(cachePath)
  const requestedIds = [...sourceIds.keys()].sort()
  const idsToFetch = input.refresh
    ? requestedIds
    : requestedIds.filter(id => !existing?.entries[id])

  let cache: GersRegistryCache = existing ?? {
    entries: {},
    fetchedAt: new Date(0).toISOString(),
    registryObjects: [],
    schemaVersion: CACHE_SCHEMA_VERSION,
  }

  if (idsToFetch.length > 0) {
    const fetched = await fetchGersEntries(idsToFetch, {
      fetchImpl: input.fetchImpl ?? fetch,
      onProgress: input.onProgress,
    })
    const entries = { ...cache.entries }
    for (const id of idsToFetch) {
      entries[id] = fetched.entries.get(id) ?? { isGers: false }
    }
    cache = {
      entries,
      fetchedAt: new Date().toISOString(),
      registryObjects: fetched.registryObjects,
      schemaVersion: CACHE_SCHEMA_VERSION,
    }
    await writeGersCache(cachePath, cache)
  }

  const coverage = buildOvertureGersCoverage(sourceIds, cache.entries)
  const unmatchedIds = [
    ...new Set(
      coverage.length === 0
        ? []
        : [...sourceIds.entries()]
            .filter(([id]) => cache.entries[id]?.isGers !== true)
            .map(([id]) => id),
    ),
  ].sort()

  return {
    cachePath,
    fetchedIds: idsToFetch.length,
    coverage,
    sourceFiles: (await listOvertureSourceFiles(sourceRoot)).length,
    unmatchedIds,
  }
}

export function buildOvertureGersCoverage(
  sourceIds: SourceIds,
  entries: Record<string, GersCacheEntry>,
) {
  const counts = new Map<OvertureFeatureType, OvertureGersCoverageRow>()
  for (const [id, types] of sourceIds.entries()) {
    for (const sourceType of types) {
      const row = counts.get(sourceType) ?? {
        gersIds: 0,
        nonGersIds: 0,
        sourceType,
        totalIds: 0,
      }
      row.totalIds += 1
      if (entries[id]?.isGers === true) row.gersIds += 1
      else row.nonGersIds += 1
      counts.set(sourceType, row)
    }
  }
  return [...counts.values()].sort((left, right) =>
    left.sourceType.localeCompare(right.sourceType),
  )
}

export function formatOvertureGersCoverage(coverage: OvertureGersCoverageRow[]) {
  return coverage.map(row => ({
    ...row,
    coverage:
      row.totalIds === 0
        ? '0.00%'
        : `${((row.gersIds / row.totalIds) * 100).toFixed(2)}%`,
  }))
}

async function collectOvertureSourceIds(sourceRoot: string): Promise<SourceIds> {
  const ids: SourceIds = new Map()
  const files = await listOvertureSourceFiles(sourceRoot)

  for (const file of files) {
    const sourceType = file.endsWith('/place.division.intersects.clipSmart.parquet')
      ? 'place'
      : 'division'
    const parquetFile = await asyncBufferFromFile(file)
    await parquetRead({
      columns: ['id'],
      compressors,
      file: parquetFile,
      onChunk({ columnData }) {
        for (const value of Array.from(columnData as ArrayLike<unknown>)) {
          const id = normaliseId(value)
          if (!id) continue
          const types = ids.get(id) ?? new Set<OvertureFeatureType>()
          types.add(sourceType)
          ids.set(id, types)
        }
      },
    })
  }

  return ids
}

async function listOvertureSourceFiles(sourceRoot: string) {
  const files: string[] = []
  for (const pattern of [
    '**/division.division.intersects.clipSmart.parquet',
    '**/place.division.intersects.clipSmart.parquet',
  ]) {
    for await (const file of new Bun.Glob(pattern).scan({
      absolute: true,
      cwd: sourceRoot,
      onlyFiles: true,
    })) {
      files.push(resolve(file))
    }
  }
  return [...new Set(files)].sort()
}

async function fetchGersEntries(
  ids: string[],
  input: {
    fetchImpl: FetchLike
    onProgress?: (message: string) => void
  },
) {
  const targetIds = [...ids].sort()
  const remaining = new Set(targetIds)
  const entries = new Map<string, GersRegistryEntry>()
  const fetchImpl = retryingFetch(input.fetchImpl)
  const registryObjects = await listRegistryObjects(fetchImpl)
  const rowGroups: RegistryRowGroup[] = []

  for (const [objectIndex, object] of registryObjects.entries()) {
    input.onProgress?.(
      `GERS Registry metadata ${objectIndex + 1}/${registryObjects.length}: ${remaining.size} IDs remaining`,
    )

    const url = `${OVERTURE_GERS_REGISTRY_PREFIX}${object.key.slice('registry/'.length)}`
    const file = await asyncBufferFromUrl({
      byteLength: object.size,
      fetch: fetchImpl as typeof fetch,
      url,
    })
    const metadata = await parquetMetadataAsync(file, { geoparquet: false })
    const firstRowGroup = metadata.row_groups[0]
    const idColumnIndex = firstRowGroup?.columns.findIndex(
      column => column.meta_data?.path_in_schema.join('.') === 'id',
    )
    if (idColumnIndex === undefined || idColumnIndex < 0) {
      throw new Error(`GERS Registry parquet has no id column: ${object.key}`)
    }

    let rowStart = 0
    for (const rowGroup of metadata.row_groups) {
      const rowEnd = rowStart + Number(rowGroup.num_rows)
      const statistics = rowGroup.columns[idColumnIndex]?.meta_data?.statistics
      const minimum = normaliseId(statistics?.min_value ?? statistics?.min)
      const maximum = normaliseId(statistics?.max_value ?? statistics?.max)
      const hasPossibleTarget =
        !minimum || !maximum || hasTargetInRange(targetIds, minimum, maximum)

      if (hasPossibleTarget) rowGroups.push({ file, metadata, rowEnd, rowStart })
      rowStart = rowEnd
    }
  }

  input.onProgress?.(
    `GERS Registry ID scan: ${rowGroups.length} candidate row groups across ${registryObjects.length} objects`,
  )
  await runWithConcurrency(rowGroups, REGISTRY_SCAN_CONCURRENCY, async rowGroup => {
    if (remaining.size === 0) return

    const idRows = await parquetReadObjects({
      columns: ['id'],
      compressors,
      file: rowGroup.file,
      metadata: rowGroup.metadata,
      rowEnd: rowGroup.rowEnd,
      rowStart: rowGroup.rowStart,
      useOffsetIndex: true,
    })
    const matchedOffsets = idRows.flatMap((row, offset) => {
      const id = normaliseId(row.id)
      return id && remaining.has(id) ? [offset] : []
    })

    for (const [windowStart, windowEnd] of compactEvidenceWindows(matchedOffsets)) {
      const rows = await parquetReadObjects({
        columns: [...REGISTRY_COLUMNS],
        compressors,
        file: rowGroup.file,
        metadata: rowGroup.metadata,
        rowEnd: rowGroup.rowStart + windowEnd,
        rowStart: rowGroup.rowStart + windowStart,
        useOffsetIndex: true,
      })
      for (const row of rows) {
        const id = normaliseId(row.id)
        if (!id || !remaining.has(id)) continue
        entries.set(id, {
          firstSeen: nullableString(row.first_seen),
          isGers: true,
          lastChanged: nullableString(row.last_changed),
          lastSeen: nullableString(row.last_seen),
          path: nullableString(row.path),
        })
        remaining.delete(id)
      }
    }
  })

  return { entries, registryObjects }
}

function retryingFetch(fetchImpl: FetchLike): FetchLike {
  return async (input, init) => {
    let lastError: unknown
    for (let attempt = 0; attempt <= REGISTRY_REQUEST_RETRIES; attempt += 1) {
      try {
        const response = await fetchImpl(input, init)
        if (
          response.ok ||
          (response.status >= 400 && response.status < 500 && response.status !== 429)
        ) {
          return response
        }
        lastError = new Error(
          `GERS Registry request failed with HTTP ${response.status}.`,
        )
      } catch (error) {
        lastError = error
      }
      if (attempt < REGISTRY_REQUEST_RETRIES) {
        await new Promise(resolve =>
          setTimeout(resolve, 250 * 2 ** Math.min(attempt, 4)),
        )
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('GERS Registry request failed.')
  }
}

type RegistryRowGroup = {
  file: Awaited<ReturnType<typeof asyncBufferFromUrl>>
  metadata: Awaited<ReturnType<typeof parquetMetadataAsync>>
  rowEnd: number
  rowStart: number
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  callback: (value: T) => Promise<void>,
) {
  let nextIndex = 0
  const workerCount = Math.min(concurrency, values.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++
        const value = values[index]
        if (value === undefined) return
        await callback(value)
      }
    }),
  )
}

async function listRegistryObjects(fetchImpl: FetchLike) {
  const response = await fetchImpl(OVERTURE_GERS_REGISTRY_LIST_URL)
  if (!response.ok) {
    throw new Error(`GERS Registry listing failed with HTTP ${response.status}.`)
  }
  const parsed = new XMLParser({
    isArray: name => name === 'Contents',
  }).parse(await response.text()) as {
    ListBucketResult?: { Contents?: Array<Record<string, string>> }
  }
  const contents = parsed.ListBucketResult?.Contents ?? []
  const objects: RegistryObject[] = []
  for (const item of contents) {
    const key = item.Key
    const size = Number(item.Size)
    if (
      !key?.startsWith('registry/') ||
      !key.endsWith('.parquet') ||
      !Number.isSafeInteger(size) ||
      size <= 0
    ) {
      continue
    }
    objects.push({
      key,
      lastModified: item.LastModified ?? null,
      size,
    })
  }
  objects.sort((left, right) => left.key.localeCompare(right.key))

  if (objects.length === 0) {
    throw new Error('GERS Registry listing contained no parquet objects.')
  }
  return objects
}

async function readGersCache(path: string): Promise<GersRegistryCache | null> {
  try {
    const parsed = JSON.parse(
      await readFile(path, 'utf8'),
    ) as Partial<GersRegistryCache>
    if (
      parsed.schemaVersion !== CACHE_SCHEMA_VERSION ||
      !parsed.entries ||
      !parsed.fetchedAt ||
      !Array.isArray(parsed.registryObjects)
    ) {
      throw new Error(`Invalid GERS Registry cache: ${path}`)
    }
    return parsed as GersRegistryCache
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
}

async function writeGersCache(path: string, cache: GersRegistryCache) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.tmp`
  try {
    await Bun.write(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`)
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

function hasTargetInRange(ids: string[], minimum: string, maximum: string) {
  const index = lowerBound(ids, minimum)
  const candidate = ids[index]
  return candidate !== undefined && candidate <= maximum
}

function lowerBound(values: string[], target: string) {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    const value = values[middle]
    if (value === undefined || value >= target) high = middle
    else low = middle + 1
  }
  return low
}

function compactEvidenceWindows(offsets: number[]) {
  const windows: Array<[number, number]> = []
  for (const offset of offsets) {
    const previous = windows[windows.length - 1]
    if (previous && offset - previous[1] <= REGISTRY_EVIDENCE_WINDOW_MAX_GAP) {
      previous[1] = offset + 1
      continue
    }
    windows.push([offset, offset + 1])
  }
  return windows
}

function normaliseId(value: unknown): string | null {
  if (value instanceof Uint8Array) return new TextDecoder().decode(value)
  if (typeof value !== 'string') return null
  return value.trim() || null
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
