import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

export const inspectStages = ['normalized', 'resolved', 'operations'] as const
export const inspectResourceTypes = ['address'] as const
export const inspectDbShards = ['source', 'history', 'current'] as const
export const inspectSampleStrategies = ['first', 'last', 'random'] as const

export type InspectStage = (typeof inspectStages)[number]
export type InspectResourceType = (typeof inspectResourceTypes)[number]
export type InspectDbShard = (typeof inspectDbShards)[number]
export type InspectSampleStrategy = (typeof inspectSampleStrategies)[number]

export type InspectArtifactOptions = {
  dbShard?: InspectDbShard
  outDir?: string
  persistDir?: string
  releaseCode: string
  resourceType: InspectResourceType
  sample: InspectSampleStrategy
  stage: InspectStage
}

export type InspectArtifactResult = {
  outputPath: string
  releaseCode: string
  resourceType: InspectResourceType
  rowEnd: number | null
  rowStart: number | null
  sample: InspectSampleStrategy
  sourceKeys: string[]
  stage: InspectStage
  dbShard?: InspectDbShard
}

type R2ObjectRow = {
  blob_id: string
  key: string
  size: number
  uploaded: number
}

type ArtifactCandidate = {
  key: string
  rowEnd: number | null
  rowStart: number | null
  rows: R2ObjectRow[]
}

const DEFAULT_OUT_DIR = '.'
const DEFAULT_PERSIST_DIR = '.local/d1/dev'
const TARGET_ORDER = new Map([
  ['source', 0],
  ['history', 1],
  ['current-init', 2],
  ['current', 3],
])

export function normalizeInspectStage(value: unknown): InspectStage | null {
  if (typeof value !== 'string') {
    return null
  }

  switch (value.trim().toLowerCase()) {
    case 'json-normalised':
    case 'json-normalized':
    case 'normalised':
    case 'normalized':
      return 'normalized'
    case 'resolved':
    case 'json-resolved':
      return 'resolved'
    case 'operation':
    case 'operations':
    case 'sql':
      return 'operations'
    default:
      return null
  }
}

export function normalizeInspectResourceType(
  value: unknown,
): InspectResourceType | null {
  return value === 'address' ? 'address' : null
}

export function normalizeInspectDbShard(value: unknown): InspectDbShard | null {
  return value === 'source' || value === 'history' || value === 'current' ? value : null
}

export function normalizeInspectSampleStrategy(
  value: unknown,
): InspectSampleStrategy | null {
  return value === 'first' || value === 'last' || value === 'random' ? value : null
}

export function listInspectableReleaseCodes(options: {
  dbShard?: InspectDbShard
  persistDir?: string
  resourceType: InspectResourceType
  stage: InspectStage
}) {
  const rows = loadInspectableObjectRows(options.persistDir)
  const releaseCodes = new Map<string, number>()

  for (const row of rows) {
    if (!matchesStage(row.key, options)) {
      continue
    }

    const releaseCode = extractReleaseCode(row.key, options.resourceType)

    if (!releaseCode) {
      continue
    }

    releaseCodes.set(
      releaseCode,
      Math.max(releaseCodes.get(releaseCode) ?? 0, row.uploaded),
    )
  }

  return [...releaseCodes.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([releaseCode]) => releaseCode)
}

export function inspectLocalArtifact(
  options: InspectArtifactOptions,
): InspectArtifactResult {
  const normalizedOptions = {
    ...options,
    outDir: resolve(options.outDir ?? DEFAULT_OUT_DIR),
    persistDir: resolve(options.persistDir ?? DEFAULT_PERSIST_DIR),
  }
  const rows = loadInspectableObjectRows(normalizedOptions.persistDir)
  const matchingRows = rows.filter(row =>
    matchesArtifactRequest(row.key, normalizedOptions),
  )
  const candidates = buildArtifactCandidates(matchingRows, normalizedOptions)
  const candidate = selectCandidate(candidates, normalizedOptions.sample)

  if (!candidate) {
    throw new Error(
      `No ${normalizedOptions.stage} artifacts found for ${normalizedOptions.releaseCode}.`,
    )
  }

  mkdirSync(normalizedOptions.outDir, { recursive: true })

  const timestamp = formatTimestamp(new Date())
  const extension = normalizedOptions.stage === 'operations' ? 'sql' : 'json'
  const outputPath = join(
    normalizedOptions.outDir,
    [
      timestamp,
      normalizedOptions.releaseCode,
      normalizedOptions.stage,
      normalizedOptions.dbShard,
      normalizedOptions.sample,
    ]
      .filter(Boolean)
      .join('-') + `.${extension}`,
  )
  const bucketRoot = join(
    normalizedOptions.persistDir,
    'v3',
    'r2',
    'ss-raw-preview',
    'blobs',
  )

  writeCandidate(bucketRoot, candidate, outputPath)

  return {
    outputPath,
    releaseCode: normalizedOptions.releaseCode,
    resourceType: normalizedOptions.resourceType,
    rowEnd: candidate.rowEnd,
    rowStart: candidate.rowStart,
    sample: normalizedOptions.sample,
    sourceKeys: candidate.rows.map(row => row.key),
    stage: normalizedOptions.stage,
    ...(normalizedOptions.dbShard ? { dbShard: normalizedOptions.dbShard } : {}),
  }
}

function loadInspectableObjectRows(persistDir = DEFAULT_PERSIST_DIR) {
  const sqlitePath = resolveR2ObjectSqlite(
    join(resolve(persistDir), 'v3', 'r2', 'miniflare-R2BucketObject'),
  )
  const db = new Database(sqlitePath, { readonly: true })

  try {
    return db
      .query<R2ObjectRow, []>(`
        SELECT key, blob_id, size, uploaded
        FROM _mf_objects
        WHERE key LIKE 'processed/%'
        ORDER BY uploaded DESC, key ASC
      `)
      .all()
  } finally {
    db.close()
  }
}

function resolveR2ObjectSqlite(r2Root: string) {
  if (!existsSync(r2Root)) {
    throw new Error(`Local R2 object store not found: ${r2Root}`)
  }

  const candidates = readdirSync(r2Root)
    .filter(file => file.endsWith('.sqlite') && file !== 'metadata.sqlite')
    .map(file => join(r2Root, file))

  for (const candidate of candidates) {
    try {
      const db = new Database(candidate, { readonly: true })
      const hasObjectsTable = Boolean(
        db
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_mf_objects'",
          )
          .get(),
      )
      db.close()

      if (hasObjectsTable) {
        return candidate
      }
    } catch {
      // Ignore unrelated sqlite files in the Miniflare object store directory.
    }
  }

  throw new Error(`Could not find Miniflare _mf_objects sqlite in ${r2Root}`)
}

function matchesStage(
  key: string,
  options: {
    dbShard?: InspectDbShard
    resourceType: InspectResourceType
    stage: InspectStage
  },
) {
  if (options.stage === 'operations') {
    return (
      key.startsWith('processed/') &&
      key.includes(`/sql/${options.dbShard ?? ''}`) &&
      key.endsWith('.sql')
    )
  }

  return (
    key.startsWith(`processed/${options.resourceType}/`) &&
    key.includes(`/${options.stage}/`) &&
    key.endsWith('.json')
  )
}

function matchesArtifactRequest(key: string, options: InspectArtifactOptions) {
  if (!matchesStage(key, options)) {
    return false
  }

  if (options.stage === 'operations') {
    return (
      extractReleaseCode(key, options.resourceType) === options.releaseCode &&
      (!options.dbShard || extractDbShard(key) === options.dbShard)
    )
  }

  return extractReleaseCode(key, options.resourceType) === options.releaseCode
}

function buildArtifactCandidates(rows: R2ObjectRow[], options: InspectArtifactOptions) {
  if (options.stage !== 'operations') {
    return rows
      .map((row): ArtifactCandidate => {
        const range = extractJsonRange(row.key)
        return {
          key: row.key,
          rowEnd: range.rowEnd,
          rowStart: range.rowStart,
          rows: [row],
        }
      })
      .sort(compareCandidates)
  }

  const grouped = new Map<string, ArtifactCandidate>()

  for (const row of rows) {
    const rowStart = extractSqlRowStart(row.key)
    const key = String(rowStart ?? Number.POSITIVE_INFINITY)
    const existing = grouped.get(key)

    if (existing) {
      existing.rows.push(row)
      existing.rows.sort(compareSqlObjects)
      continue
    }

    grouped.set(key, {
      key,
      rowEnd: null,
      rowStart,
      rows: [row],
    })
  }

  return [...grouped.values()].sort(compareCandidates)
}

function selectCandidate(
  candidates: ArtifactCandidate[],
  sample: InspectSampleStrategy,
) {
  if (candidates.length === 0) {
    return null
  }

  switch (sample) {
    case 'first':
      return candidates[0] ?? null
    case 'last':
      return candidates.at(-1) ?? null
    case 'random':
      return candidates[Math.floor(Math.random() * candidates.length)] ?? null
  }
}

function writeCandidate(
  bucketRoot: string,
  candidate: ArtifactCandidate,
  outputPath: string,
) {
  if (candidate.rows.length === 1) {
    copyFileSync(resolveBlobPath(bucketRoot, candidate.rows[0]), outputPath)
    return
  }

  const body = candidate.rows
    .map(row => {
      const sourcePath = resolveBlobPath(bucketRoot, row)

      return [
        `-- ${row.key}`,
        `-- size=${row.size} uploaded=${new Date(row.uploaded).toISOString()}`,
        readFileSync(sourcePath, 'utf8').trimEnd(),
      ].join('\n')
    })
    .join('\n\n')

  writeFileSync(outputPath, `${body}\n`)
}

function extractReleaseCode(key: string, resourceType: InspectResourceType) {
  const sqlMatch = key.match(/^processed\/([^/]+)\/sql\//)

  if (sqlMatch) {
    return sqlMatch[1] ?? null
  }

  const jsonMatch = key.match(new RegExp(`^processed/${resourceType}/([^/]+)/`))

  return jsonMatch?.[1] ?? null
}

function extractDbShard(key: string) {
  const match = key.match(/^processed\/[^/]+\/sql\/([^/]+)\//)

  return match?.[1] ?? null
}

function extractJsonRange(key: string) {
  const filename = basename(key)
  const match = filename.match(/^(\d{12})-(\d{12})\.json$/)

  return {
    rowEnd: match ? Number.parseInt(match[2] ?? '', 10) : null,
    rowStart: match ? Number.parseInt(match[1] ?? '', 10) : null,
  }
}

function extractSqlRowStart(key: string) {
  const filename = basename(key)
  const match = filename.match(/-(source|history|current)-(\d+)\.sql$/)

  if (!match) {
    return filename.endsWith('-current-init.sql') ? 0 : null
  }

  return Number.parseInt(match[2] ?? '', 10)
}

function compareCandidates(left: ArtifactCandidate, right: ArtifactCandidate) {
  const leftStart = left.rowStart ?? Number.POSITIVE_INFINITY
  const rightStart = right.rowStart ?? Number.POSITIVE_INFINITY

  if (leftStart !== rightStart) {
    return leftStart - rightStart
  }

  return left.key.localeCompare(right.key)
}

function compareSqlObjects(left: R2ObjectRow, right: R2ObjectRow) {
  const leftTarget = classifyTargetForOrdering(left.key)
  const rightTarget = classifyTargetForOrdering(right.key)
  const targetDiff =
    (TARGET_ORDER.get(leftTarget) ?? 999) - (TARGET_ORDER.get(rightTarget) ?? 999)

  if (targetDiff !== 0) {
    return targetDiff
  }

  return left.key.localeCompare(right.key)
}

function classifyTargetForOrdering(key: string) {
  const target = extractDbShard(key)

  if (target === 'current' && key.endsWith('-current-init.sql')) {
    return 'current-init'
  }

  return target ?? 'unknown'
}

function resolveBlobPath(bucketRoot: string, row: R2ObjectRow | undefined) {
  if (!row) {
    throw new Error('Missing selected artifact row.')
  }

  const blobPath = join(bucketRoot, row.blob_id)

  if (!existsSync(blobPath)) {
    throw new Error(`Blob file not found for ${row.key}: ${blobPath}`)
  }

  return blobPath
}

function formatTimestamp(date: Date) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:]/g, '')
}
