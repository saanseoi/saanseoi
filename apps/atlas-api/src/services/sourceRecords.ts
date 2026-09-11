import { resolveDataRegion, type ApiRegion } from '../schema/region'
import { decompressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson.ts'

import { runWithD1ReadRetry } from '../lib/d1'
import type { AccessAttribution } from './accessAnalytics'
import type { AppBindings, AppEnv } from '../types'

const DEFAULT_PAGE_LIMIT = 100
const MAX_PAGE_LIMIT = 500
const DOWNLOAD_PAGE_LIMIT = 500

export type SourceFamily = 'addresses' | 'divisions' | 'places' | 'stats' | 'streets'

import {
  sourceCatalogueFor,
  type SourceRecordCatalogueEntry,
} from './sourceRecordCatalogue'
type SourceReleaseRow = {
  sourceValidityCode?: string
  datasetCode: string
  releaseId: string
  resourceType: string
  sourceReleaseCode: string
  sourceVersion: string
  sourceVariant: string
}

type SourceReleaseWithShard = SourceReleaseRow & {
  bindingName: string
  bindingNames?: string[]
  datasetId: string
  publisherCode: string
  sourceReleaseId: string
}

type SourceRecordRow = {
  sources?: string | null
  placeNames?: string | null
  rawProperties: string | null
  sourceGeometry?: unknown
  sourceRecordId: string
  versionHash: string
}

export type SourceRecord = {
  placeNames?: Record<string, unknown>[] | null
  geometry?: unknown
  rawProperties: Record<string, unknown> | null
  resourceType?: string
  sourceRecordId: string
  variant?: string
}

export type SourceRecordPin = {
  apiReleaseSetCode: null
  datasetCode: string
  snapshotCode: null
  sourceReleaseCode: string
}

export type SourceRecordPage = {
  nextCursor: string | null
  pin: SourceRecordPin
  records: SourceRecord[]
}

export type SourceReleaseDiscoveryEntry = Omit<
  SourceReleaseRow,
  'releaseId' | 'sourceVersion'
> & {
  apiReleaseSetCode: string | null
  recordsAvailable: boolean
  recordsHref: string | null
  role: string
  snapshotCode: string
}

type Cursor = {
  sourceRecordId: string
  versionHash: string
}

function sourceBindingForName(
  env: AppBindings,
  bindingName: string,
): D1Database | null {
  const bindings = {
    DB_SOURCE_HK_2025: env.DB_SOURCE_HK_2025,
    DB_SOURCE_HK_2026: env.DB_SOURCE_HK_2026,
    DB_SOURCE_HK_BEFORE: env.DB_SOURCE_HK_BEFORE,
  } as const

  return bindings[bindingName as keyof typeof bindings] ?? null
}

function parseStoredJson(value: string | null): unknown {
  if (value === null) return null
  return JSON.parse(value) as unknown
}

function parseRawProperties(value: string | null) {
  const parsed = parseStoredJson(value)
  if (parsed === null) return null
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Source record rawProperties must be an object or null.')
  }
  return parsed as Record<string, unknown>
}

function parseSourceGeometry(value: unknown, entry: SourceRecordCatalogueEntry) {
  if (entry.geometryEncoding === 'brotli-json') {
    if (value instanceof Uint8Array) return decompressJsonBrotli(value)
    if (value instanceof ArrayBuffer) return decompressJsonBrotli(value)
    throw new Error('C&SD source geometry must be a Brotli-compressed BLOB.')
  }

  if (typeof value !== 'string') {
    throw new Error('Source geometry must be stored as JSON text.')
  }
  return parseStoredJson(value)
}

function encodeCursor(cursor: Cursor) {
  return btoa(JSON.stringify(cursor))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null

  try {
    const padded =
      value.replaceAll('-', '+').replaceAll('_', '/') +
      '='.repeat((4 - (value.length % 4)) % 4)
    const parsed = JSON.parse(atob(padded)) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Record<string, unknown>).sourceRecordId !== 'string' ||
      typeof (parsed as Record<string, unknown>).versionHash !== 'string'
    ) {
      return null
    }

    return parsed as Cursor
  } catch {
    return null
  }
}

async function resolveSourceRelease(
  metaDb: AppEnv['Variables']['metaDb'],
  sourceReleaseCode: string,
  family: SourceFamily,
  region?: ApiRegion,
): Promise<SourceReleaseWithShard | null> {
  const result = await runWithD1ReadRetry(() =>
    metaDb.$client
      .prepare(
        `SELECT
          datasets.id AS datasetId,
          datasets.code AS datasetCode,
          releases.id AS releaseId,
          releases.resourceType AS resourceType,
          sourceReleases.code AS sourceReleaseCode,
          releases.sourceVersion AS sourceVersion,
          datasets.sourceVariant AS sourceVariant,
          sourceReleases.id AS sourceReleaseId,
          releases.code AS sourceValidityCode,
          publishers.code AS publisherCode,
          dataShards.bindingName AS bindingName
        FROM releases
        INNER JOIN sourceReleases
          ON sourceReleases.id = releases.sourceReleaseId
        INNER JOIN datasets ON datasets.id = releases.datasetId
        INNER JOIN publishers ON publishers.id = datasets.publisherId
        INNER JOIN releaseShardAssignments
          ON releaseShardAssignments.releaseId = releases.id
        INNER JOIN dataShards
          ON dataShards.id = releaseShardAssignments.dataShardId
        WHERE (sourceReleases.code = ? OR releases.code = ?) AND datasets.regionCode = ?
          AND releases.status IN ('published', 'superseded')
          AND releases.revokedAt IS NULL
          AND sourceReleases.status IN ('published', 'superseded')
          AND sourceReleases.revokedAt IS NULL
          AND dataShards.shardType = 'source'
          AND dataShards.status = 'active'
          `,
      )
      .bind(sourceReleaseCode, sourceReleaseCode, resolveDataRegion(region))
      .all<SourceReleaseWithShard>(),
  )

  const preferred =
    result.results.find(
      row =>
        row.resourceType ===
        (sourceCatalogueFor(family)[row.datasetCode]?.resourceType ??
          {
            stats: 'divisionStatistic',
            divisions: 'division',
            places: 'place',
            addresses: 'address',
            streets: 'street',
          }[family]),
    ) ?? result.results[0]
  const rows = [
    ...new Map(
      result.results
        .filter(row => row.releaseId === preferred?.releaseId)
        .map(row => [row.bindingName, row]),
    ).values(),
  ]
  const release = rows[0]
  return release ? { ...release, bindingNames: rows.map(row => row.bindingName) } : null
}

async function readSourceRecordPage(args: {
  cursor: Cursor | null
  entry: SourceRecordCatalogueEntry
  includeGeometry: boolean
  limit: number
  random: boolean
  release: SourceReleaseWithShard
  sourceDbs: D1Database[]
}): Promise<SourceRecordRow[]> {
  const pages = await Promise.all(
    args.sourceDbs.map(sourceDb => readShardSourceRecordPage({ ...args, sourceDb })),
  )
  const rows = [
    ...new Map(
      pages.flat().map(row => [`${row.sourceRecordId}:${row.versionHash}`, row]),
    ).values(),
  ]
  if (args.random && pages.length > 1) {
    // Shuffle the small candidate pool so an earlier shard is not always favoured.
    for (let index = rows.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1))
      const value = rows[index]!
      rows[index] = rows[other]!
      rows[other] = value
    }
  } else if (!args.random) {
    rows.sort((left, right) =>
      left.sourceRecordId < right.sourceRecordId
        ? -1
        : left.sourceRecordId > right.sourceRecordId
          ? 1
          : left.versionHash < right.versionHash
            ? -1
            : left.versionHash > right.versionHash
              ? 1
              : 0,
    )
  }
  return rows.slice(0, args.limit)
}

async function readShardSourceRecordPage(args: {
  cursor: Cursor | null
  entry: SourceRecordCatalogueEntry
  includeGeometry: boolean
  limit: number
  random: boolean
  release: SourceReleaseWithShard
  sourceDb: D1Database
}): Promise<SourceRecordRow[]> {
  if (args.random) return readRandomSourceRecordPage(args)

  const geometrySelection =
    args.includeGeometry && args.entry.geometryColumn
      ? `${args.entry.geometryColumn} AS sourceGeometry`
      : 'NULL AS sourceGeometry'
  const cursorCondition = args.cursor
    ? 'AND (sourceRecordId > ? OR (sourceRecordId = ? AND versionHash > ?))'
    : ''
  const statement = args.sourceDb
    .prepare(
      `SELECT sourceRecordId, versionHash, rawProperties, ${args.entry.nativeNamesColumn ?? 'NULL'} AS placeNames, ${geometrySelection}
       FROM ${args.entry.tableName}
       WHERE validFromRelease <= ?
         AND (validToRelease IS NULL OR validToRelease > ?)
         AND validFromRelease >= ?
       ${cursorCondition}
       ORDER BY sourceRecordId ASC, versionHash ASC
       LIMIT ?`,
    )
    .bind(
      ...sourceValidityValues(args),
      ...(args.cursor
        ? [
            args.cursor.sourceRecordId,
            args.cursor.sourceRecordId,
            args.cursor.versionHash,
          ]
        : []),
      args.limit,
    )

  const result = await runWithD1ReadRetry(() => statement.all<SourceRecordRow>())
  return result.results
}

async function readRandomSourceRecordPage(args: {
  entry: SourceRecordCatalogueEntry
  includeGeometry: boolean
  limit: number
  release: SourceReleaseWithShard
  sourceDb: D1Database
}): Promise<SourceRecordRow[]> {
  if (args.entry.randomSampleStrategy !== 'uuid-pivot') {
    return readRandomOrderedSourceRecordPage(args)
  }

  return readUuidPivotSourceRecordPage(args)
}

/**
 * Pick a random point in Overture's UUID-shaped source-record key space, then
 * read forward through the primary-key index. This avoids evaluating RANDOM()
 * for, and sorting, every Overture record that is valid in the requested release.
 */
async function readUuidPivotSourceRecordPage(args: {
  entry: SourceRecordCatalogueEntry
  includeGeometry: boolean
  limit: number
  release: SourceReleaseWithShard
  sourceDb: D1Database
}): Promise<SourceRecordRow[]> {
  const geometrySelection =
    args.includeGeometry && args.entry.geometryColumn
      ? `${args.entry.geometryColumn} AS sourceGeometry`
      : 'NULL AS sourceGeometry'
  // Overture source IDs are stored as canonical hyphenated UUIDs. Keep the
  // pivot in the same representation so SQLite compares the same key space.
  const randomStart = `${args.entry.randomSamplePrefix ?? ''}${crypto.randomUUID()}`

  const readRange = async (operator: '>=' | '<', limit: number) => {
    const statement = args.sourceDb
      .prepare(
        `SELECT sourceRecordId, versionHash, rawProperties, ${args.entry.nativeNamesColumn ?? 'NULL'} AS placeNames, ${geometrySelection}
         FROM ${args.entry.tableName}
         WHERE validFromRelease <= ?
           AND (validToRelease IS NULL OR validToRelease > ?)
           AND validFromRelease >= ?
           AND sourceRecordId ${operator} ?
         ORDER BY sourceRecordId ASC, versionHash ASC
         LIMIT ?`,
      )
      .bind(...sourceValidityValues(args), randomStart, limit)
    const result = await runWithD1ReadRetry(() => statement.all<SourceRecordRow>())
    return result.results
  }

  const rows = await readRange('>=', args.limit)
  if (rows.length === args.limit) return rows

  return [...rows, ...(await readRange('<', args.limit - rows.length))]
}

/**
 * Publisher identifiers are intentionally retained verbatim and do not share
 * a sortable key space. The non-Overture source tables are small enough that
 * a random ordering is preferable to biasing samples toward their first key.
 */
async function readRandomOrderedSourceRecordPage(args: {
  entry: SourceRecordCatalogueEntry
  includeGeometry: boolean
  limit: number
  release: SourceReleaseWithShard
  sourceDb: D1Database
}): Promise<SourceRecordRow[]> {
  const geometrySelection =
    args.includeGeometry && args.entry.geometryColumn
      ? `${args.entry.geometryColumn} AS sourceGeometry`
      : 'NULL AS sourceGeometry'
  const statement = args.sourceDb
    .prepare(
      `SELECT sourceRecordId, versionHash, rawProperties, ${args.entry.nativeNamesColumn ?? 'NULL'} AS placeNames, ${geometrySelection}
       FROM ${args.entry.tableName}
       WHERE validFromRelease <= ?
         AND (validToRelease IS NULL OR validToRelease > ?)
         AND validFromRelease >= ?
       ORDER BY RANDOM()
       LIMIT ?`,
    )
    .bind(...sourceValidityValues(args), args.limit)
  const result = await runWithD1ReadRetry(() => statement.all<SourceRecordRow>())
  return result.results
}

function sourceValidityValues(args: {
  entry: SourceRecordCatalogueEntry
  release: SourceReleaseRow
}): [string, string, string] {
  const key =
    args.entry.releaseKey === 'version'
      ? args.release.sourceVersion
      : (args.release.sourceValidityCode ?? args.release.sourceReleaseCode)
  // Shared publisher tables contain several datasets. A release-code lower
  // bound prevents an earlier dataset's open intervals leaking into this one.
  const lower =
    args.entry.releaseKey === 'version'
      ? ''
      : `${args.release.datasetCode.replace(/^ds-/, 'dr-')}-`
  return [key, key, lower]
}

function toSourceRecord(
  row: SourceRecordRow,
  release: SourceReleaseRow,
  entry: SourceRecordCatalogueEntry,
  includeGeometry: boolean,
  family: SourceFamily,
): SourceRecord {
  const rawProperties = parseRawProperties(row.rawProperties)
  const record: SourceRecord = {
    rawProperties,
    sourceRecordId: row.sourceRecordId,
    ...(family === 'streets'
      ? { resourceType: release.resourceType, variant: release.sourceVariant }
      : {}),
  }

  if (entry.nativeNamesColumn)
    record.placeNames = parseObjectArray(row.placeNames, 'placeNames')

  if (
    includeGeometry &&
    row.sourceGeometry !== null &&
    row.sourceGeometry !== undefined
  ) {
    record.geometry = parseSourceGeometry(row.sourceGeometry, entry)
  }

  return record
}

function parseObjectArray(
  value: string | null | undefined,
  field: string,
): Record<string, unknown>[] | null {
  const parsed = value == null ? null : JSON.parse(value)
  if (
    parsed !== null &&
    (!Array.isArray(parsed) ||
      parsed.some(item => !item || typeof item !== 'object' || Array.isArray(item)))
  ) {
    throw new Error(`Source record ${field} must be an array of objects or null.`)
  }
  return parsed
}

async function resolveRecordsRequest(args: {
  env: AppBindings
  family: SourceFamily
  region?: ApiRegion
  metaDb: AppEnv['Variables']['metaDb']
  sourceReleaseCode: string
}) {
  const release = await resolveSourceRelease(
    args.metaDb,
    args.sourceReleaseCode,
    args.family,
    args.region,
  )
  if (!release) return null

  const entry = sourceCatalogueFor(args.family)[release.datasetCode]
  const sourceDbs = (release.bindingNames ?? [release.bindingName]).map(name =>
    sourceBindingForName(args.env, name),
  )
  if (!entry || sourceDbs.some(db => !db)) return null

  return { entry, release, sourceDbs: sourceDbs as D1Database[] }
}

export async function listSourceRecords(args: {
  cursor?: string
  env: AppBindings
  family: SourceFamily
  region?: ApiRegion
  includeGeometry: boolean
  limit?: number
  metaDb: AppEnv['Variables']['metaDb']
  sample?: 'random'
  sourceReleaseCode: string
  onResolved?: (attribution: AccessAttribution) => void
}): Promise<SourceRecordPage | null> {
  const resolved = await resolveRecordsRequest(args)
  if (!resolved) return null
  args.onResolved?.({
    datasetId: resolved.release.datasetId,
    publisherCodes: [resolved.release.publisherCode],
    sourceReleaseCode: resolved.release.sourceReleaseCode,
    sourceReleaseId: resolved.release.sourceReleaseId,
    surface: 'source',
  })

  if (args.sample === 'random' && args.cursor) {
    throw new SourceRecordRequestError(
      'invalid_cursor',
      'A random source-record sample cannot be combined with a cursor.',
    )
  }
  const cursor = decodeCursor(args.cursor)
  if (args.cursor && !cursor) {
    throw new SourceRecordRequestError(
      'invalid_cursor',
      'The source cursor is invalid.',
    )
  }
  const limit = Math.min(args.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT)
  const random = args.sample === 'random'
  const rows = await readSourceRecordPage({
    ...resolved,
    cursor,
    includeGeometry: args.includeGeometry,
    limit: random ? limit : limit + 1,
    random,
  })
  const pageRows = random ? rows : rows.slice(0, limit)
  const last = pageRows.at(-1)

  return {
    nextCursor:
      !random && rows.length > limit && last
        ? encodeCursor({
            sourceRecordId: last.sourceRecordId,
            versionHash: last.versionHash,
          })
        : null,
    pin: {
      apiReleaseSetCode: null,
      datasetCode: resolved.release.datasetCode,
      snapshotCode: null,
      sourceReleaseCode: resolved.release.sourceReleaseCode,
    },
    records: pageRows.map(row =>
      toSourceRecord(
        row,
        resolved.release,
        resolved.entry,
        args.includeGeometry,
        args.family,
      ),
    ),
  }
}

/** Exhaustive field/type inventory of the retained release, not a random sample. */
export async function getSourceRecordSchema(args: {
  env: AppBindings
  family: SourceFamily
  region?: ApiRegion
  metaDb: AppEnv['Variables']['metaDb']
  sourceReleaseCode: string
}) {
  const resolved = await resolveRecordsRequest(args)
  if (!resolved) return null
  const { entry, sourceDbs } = resolved
  const results = await Promise.all(
    sourceDbs.map(async sourceDb => {
      const statement = sourceDb
        .prepare(`
    WITH records AS (
      SELECT rawProperties FROM ${entry.tableName} AS record
      WHERE record.validFromRelease <= ?
        AND (record.validToRelease IS NULL OR record.validToRelease > ?)
        AND record.validFromRelease >= ?
    )
    SELECT field.key AS name, field.type AS type, COUNT(field.key) AS occurrences,
      (SELECT COUNT(*) FROM records) AS total
    FROM records AS record LEFT JOIN json_each(record.rawProperties) AS field ON true
    GROUP BY field.key, field.type
    ORDER BY field.key, field.type
  `)
        .bind(...sourceValidityValues(resolved))
      return runWithD1ReadRetry(() =>
        statement.all<{
          name: string | null
          type: string
          occurrences: number
          total: number
        }>(),
      )
    }),
  )
  const fields = new Map<string, Set<string>>()
  const occurrences = new Map<string, number>()
  const total = results.reduce(
    (sum, result) => sum + (result.results[0]?.total ?? 0),
    0,
  )
  const types: Record<string, string> = {
    text: 'string',
    integer: 'integer',
    real: 'number',
    true: 'boolean',
    false: 'boolean',
    array: 'array',
    object: 'object',
    null: 'null',
  }
  for (const field of results.flatMap(result => result.results)) {
    if (field.name == null) continue
    occurrences.set(field.name, (occurrences.get(field.name) ?? 0) + field.occurrences)
    const values = fields.get(field.name) ?? new Set<string>()
    values.add(types[field.type] ?? field.type)
    fields.set(field.name, values)
  }
  return {
    type: 'object' as const,
    additionalProperties: true,
    required: [...fields.keys()].filter(name => occurrences.get(name) === total),
    properties: Object.fromEntries(
      [...fields].map(([name, values]) => {
        const nonNull = [...values].filter(type => type !== 'null')
        const definitions = nonNull.map(type => ({
          type,
          ...(type === 'object' ? { additionalProperties: true } : {}),
          ...(type === 'array' ? { items: {} } : {}),
        }))
        return [
          name,
          {
            ...(definitions.length === 1
              ? definitions[0]
              : definitions.length
                ? { anyOf: definitions }
                : { type: 'null' }),
            nullable: values.has('null'),
          },
        ]
      }),
    ),
  }
}

export async function streamSourceRecordsNdjson(args: {
  cursor?: string
  env: AppBindings
  family: SourceFamily
  region?: ApiRegion
  includeGeometry: boolean
  metaDb: AppEnv['Variables']['metaDb']
  sourceReleaseCode: string
  onResolved?: (attribution: AccessAttribution) => void
}): Promise<ReadableStream<Uint8Array> | null> {
  const resolved = await resolveRecordsRequest(args)
  if (!resolved) return null
  args.onResolved?.({
    datasetId: resolved.release.datasetId,
    publisherCodes: [resolved.release.publisherCode],
    sourceReleaseCode: resolved.release.sourceReleaseCode,
    sourceReleaseId: resolved.release.sourceReleaseId,
    surface: 'source',
  })

  let cursor = decodeCursor(args.cursor)
  if (args.cursor && !cursor) {
    throw new SourceRecordRequestError(
      'invalid_cursor',
      'The source cursor is invalid.',
    )
  }
  const encoder = new TextEncoder()
  let page: SourceRecordRow[] = []
  let pageIndex = 0
  let reachedLastPage = false
  let cancelled = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (cancelled) return

        if (pageIndex >= page.length) {
          if (reachedLastPage) {
            controller.close()
            return
          }

          page = await readSourceRecordPage({
            ...resolved,
            cursor,
            includeGeometry: args.includeGeometry,
            limit: DOWNLOAD_PAGE_LIMIT,
            random: false,
          })
          pageIndex = 0
          reachedLastPage = page.length < DOWNLOAD_PAGE_LIMIT

          const last = page.at(-1)
          if (!last) {
            controller.close()
            return
          }
          cursor = {
            sourceRecordId: last.sourceRecordId,
            versionHash: last.versionHash,
          }
        }

        const row = page[pageIndex]
        if (!row) return
        pageIndex += 1
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify(toSourceRecord(row, resolved.release, resolved.entry, args.includeGeometry, args.family))}\n`,
          ),
        )

        if (pageIndex >= page.length && reachedLastPage) {
          controller.close()
        }
      } catch (error) {
        controller.error(error)
      }
    },
    cancel() {
      cancelled = true
      page = []
    },
  })
}

export class SourceRecordRequestError extends Error {
  constructor(
    readonly code: 'invalid_cursor',
    message: string,
  ) {
    super(message)
  }
}

export async function listSourceReleases(args: {
  datasetCode?: string
  family: SourceFamily
  region?: ApiRegion
  metaDb: AppEnv['Variables']['metaDb']
  selector?:
    | { kind: 'cohort'; value: string }
    | { kind: 'releaseSet'; value: string }
    | { kind: 'snapshot'; value: string }
}): Promise<SourceReleaseDiscoveryEntry[]> {
  const catalogue = sourceCatalogueFor(args.family)
  const sourceRows =
    args.selector?.kind === 'snapshot'
      ? await listSnapshotSourceReleases(args, args.selector.value)
      : await listReleaseSetSourceReleases(args, args.selector)

  return sourceRows.map(row => {
    const recordsAvailable = Boolean(row.hasSourceShard) && row.datasetCode in catalogue
    return {
      apiReleaseSetCode: row.apiReleaseSetCode,
      datasetCode: row.datasetCode,
      recordsAvailable,
      recordsHref: recordsAvailable
        ? `/${args.family}/v0/sources?sourceRelease=${encodeURIComponent(row.sourceReleaseCode)}${args.region ? `&region=${args.region}` : ''}`
        : null,
      resourceType: row.resourceType,
      role: row.role,
      snapshotCode: row.snapshotCode,
      sourceReleaseCode: row.sourceReleaseCode,
      sourceVariant: row.sourceVariant,
    }
  })
}

type SourceReleaseDiscoveryRow = Omit<
  SourceReleaseDiscoveryEntry,
  'recordsAvailable' | 'recordsHref'
> & {
  hasSourceShard: number
}

async function listReleaseSetSourceReleases(
  args: {
    datasetCode?: string
    family: SourceFamily
    region?: ApiRegion
    metaDb: AppEnv['Variables']['metaDb']
  },
  selector:
    | { kind: 'cohort'; value: string }
    | { kind: 'releaseSet'; value: string }
    | undefined,
) {
  const selectionCondition =
    selector?.kind === 'releaseSet'
      ? 'AND apiReleaseSets.code = ?'
      : selector?.kind === 'cohort'
        ? 'AND apiReleaseSets.cohortKey = ?'
        : ''
  const selectionResult = await runWithD1ReadRetry(() =>
    args.metaDb.$client
      .prepare(
        `SELECT apiReleaseSets.id
         FROM apiReleaseSets
         INNER JOIN apiVersions ON apiVersions.id = apiReleaseSets.apiVersionId
         WHERE apiVersions.familyType = ? AND apiReleaseSets.regionCode = ?
           AND apiReleaseSets.status <> 'draft'
           ${selectionCondition}
         ORDER BY coalesce(apiReleaseSets.publishedAt, apiReleaseSets.createdAt) DESC,
           apiReleaseSets.id DESC
         LIMIT 1`,
      )
      .bind(
        args.family,
        resolveDataRegion(args.region),
        ...(selector ? [selector.value] : []),
      )
      .first<{ id: string }>(),
  )
  if (!selectionResult) return []

  return querySourceReleaseDiscoveryRows(args.metaDb, {
    apiReleaseSetId: selectionResult.id,
    datasetCode: args.datasetCode,
    region: args.region,
  })
}

async function listSnapshotSourceReleases(
  args: {
    datasetCode?: string
    family: SourceFamily
    region?: ApiRegion
    metaDb: AppEnv['Variables']['metaDb']
  },
  snapshotCode: string,
) {
  return querySourceReleaseDiscoveryRows(args.metaDb, {
    datasetCode: args.datasetCode,
    region: args.region,
    family: args.family,
    snapshotCode,
  })
}

async function querySourceReleaseDiscoveryRows(
  metaDb: AppEnv['Variables']['metaDb'],
  selector: (
    | { apiReleaseSetId: string; datasetCode?: string }
    | { datasetCode?: string; family: SourceFamily; snapshotCode: string }
  ) & { region?: ApiRegion },
) {
  const byReleaseSet = 'apiReleaseSetId' in selector
  const sourceCondition = byReleaseSet
    ? 'apiReleaseSetSnapshots.apiReleaseSetId = ?'
    : "apiVersions.familyType = ? AND snapshots.code = ? AND apiReleaseSets.status <> 'draft'"
  const datasetCondition = selector.datasetCode ? 'AND datasets.code = ?' : ''
  const values = byReleaseSet
    ? [selector.apiReleaseSetId]
    : [selector.family, selector.snapshotCode]
  values.push(resolveDataRegion(selector.region))
  if (selector.datasetCode) values.push(selector.datasetCode)
  const result = await runWithD1ReadRetry(() =>
    metaDb.$client
      .prepare(
        `SELECT DISTINCT
          datasets.code AS datasetCode,
          releases.resourceType AS resourceType,
          sourceReleases.code AS sourceReleaseCode,
          datasets.sourceVariant AS sourceVariant,
          apiReleaseSets.code AS apiReleaseSetCode,
          snapshotSources.role AS role,
          snapshots.code AS snapshotCode,
          EXISTS(
            SELECT 1
            FROM releaseShardAssignments
            INNER JOIN dataShards
              ON dataShards.id = releaseShardAssignments.dataShardId
            WHERE releaseShardAssignments.releaseId = releases.id
              AND dataShards.shardType = 'source'
              AND dataShards.status = 'active'
          ) AS hasSourceShard
        FROM apiReleaseSetSnapshots
        INNER JOIN apiReleaseSets
          ON apiReleaseSets.id = apiReleaseSetSnapshots.apiReleaseSetId
        INNER JOIN apiVersions ON apiVersions.id = apiReleaseSets.apiVersionId
        INNER JOIN snapshots ON snapshots.id = apiReleaseSetSnapshots.snapshotId
        INNER JOIN snapshotSources ON snapshotSources.snapshotId = snapshots.id
        INNER JOIN releases ON releases.id = snapshotSources.resourceReleaseId
        INNER JOIN sourceReleases
          ON sourceReleases.id = releases.sourceReleaseId
        INNER JOIN datasets ON datasets.id = releases.datasetId
        WHERE ${sourceCondition}
        AND datasets.regionCode = ?
        AND releases.status IN ('published', 'superseded')
        AND releases.revokedAt IS NULL
        AND sourceReleases.status IN ('published', 'superseded')
        AND sourceReleases.revokedAt IS NULL
        ${datasetCondition}
        ORDER BY datasets.code ASC, releases.code ASC, snapshots.code ASC`,
      )
      .bind(...values)
      .all<SourceReleaseDiscoveryRow>(),
  )
  return result.results
}
