import { runWithD1ReadRetry } from '../lib/d1'
import type { AppBindings, AppEnv } from '../types'

const DEFAULT_PAGE_LIMIT = 100
const MAX_PAGE_LIMIT = 500
const DOWNLOAD_PAGE_LIMIT = 500

type SourceFamily = 'divisions'

type SourceRecordCatalogueEntry = {
  geometryColumn?: 'sourceGeometry'
  tableName: string
}

type SourceReleaseRow = {
  datasetCode: string
  releaseId: string
  resourceType: string
  sourceReleaseCode: string
  sourceVariant: string
}

type SourceReleaseWithShard = SourceReleaseRow & {
  bindingName: string
}

type SourceRecordRow = {
  rawProperties: string | null
  sourceGeometry?: string | null
  sourceRecordId: string
  versionHash: string
}

export type SourceRecord = {
  geometry?: unknown
  rawProperties: Record<string, unknown> | null
  resourceType: string
  sourceRecordId: string
  variant: string
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

export type SourceReleaseDiscoveryEntry = Omit<SourceReleaseRow, 'releaseId'> & {
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

const DIVISION_SOURCE_RECORD_CATALOGUE = {
  'ds-hk-hkgov-censtatd-division-area-district': {
    geometryColumn: 'sourceGeometry',
    tableName: 'hkgovCenstatdDivisionAreas',
  },
  'ds-hk-hkgov-had-division-area-district': {
    geometryColumn: 'sourceGeometry',
    tableName: 'hkgovHadDivisionAreas',
  },
  'ds-hk-hkgov-landsd-division': {
    geometryColumn: 'sourceGeometry',
    tableName: 'hkgovLandsdPlaceNames',
  },
  'ds-hk-hkgov-pland-division-new-town': {
    geometryColumn: 'sourceGeometry',
    tableName: 'hkgovPlandNewTowns',
  },
  'ds-hk-hkgov-pland-division-pu': {
    geometryColumn: 'sourceGeometry',
    tableName: 'hkgovPlandPlanningCells',
  },
  'ds-hk-overture-division': {
    tableName: 'overtureDivisions',
  },
  'ds-hk-overture-division-area': {
    geometryColumn: 'sourceGeometry',
    tableName: 'overtureDivisionAreas',
  },
  'ds-hk-overture-division-boundary': {
    geometryColumn: 'sourceGeometry',
    tableName: 'overtureDivisionBoundaries',
  },
} as const satisfies Record<string, SourceRecordCatalogueEntry>

function sourceCatalogueFor(
  family: SourceFamily,
): Record<string, SourceRecordCatalogueEntry> {
  switch (family) {
    case 'divisions':
      return DIVISION_SOURCE_RECORD_CATALOGUE
  }
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
): Promise<SourceReleaseWithShard | null> {
  const result = await runWithD1ReadRetry(() =>
    metaDb.$client
      .prepare(
        `SELECT
          datasets.code AS datasetCode,
          releases.id AS releaseId,
          releases.resourceType AS resourceType,
          releases.code AS sourceReleaseCode,
          datasets.sourceVariant AS sourceVariant,
          dataShards.bindingName AS bindingName
        FROM releases
        INNER JOIN datasets ON datasets.id = releases.datasetId
        INNER JOIN releaseShardAssignments
          ON releaseShardAssignments.releaseId = releases.id
        INNER JOIN dataShards
          ON dataShards.id = releaseShardAssignments.dataShardId
        WHERE releases.code = ?
          AND dataShards.shardType = 'source'
          AND dataShards.status = 'active'`,
      )
      .bind(sourceReleaseCode)
      .all<SourceReleaseWithShard>(),
  )

  const rows = [...new Map(result.results.map(row => [row.bindingName, row])).values()]
  return rows.length === 1 ? (rows[0] ?? null) : null
}

async function readSourceRecordPage(args: {
  cursor: Cursor | null
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
  const cursorCondition = args.cursor
    ? 'AND (sourceRecordId > ? OR (sourceRecordId = ? AND versionHash > ?))'
    : ''
  const statement = args.sourceDb
    .prepare(
      `SELECT sourceRecordId, versionHash, rawProperties, ${geometrySelection}
       FROM ${args.entry.tableName}
       WHERE releaseId = ?
       ${cursorCondition}
       ORDER BY sourceRecordId ASC, versionHash ASC
       LIMIT ?`,
    )
    .bind(
      args.release.releaseId,
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

function toSourceRecord(
  row: SourceRecordRow,
  release: SourceReleaseRow,
  includeGeometry: boolean,
): SourceRecord {
  const record: SourceRecord = {
    rawProperties: parseRawProperties(row.rawProperties),
    resourceType: release.resourceType,
    sourceRecordId: row.sourceRecordId,
    variant: release.sourceVariant,
  }

  if (
    includeGeometry &&
    row.sourceGeometry !== null &&
    row.sourceGeometry !== undefined
  ) {
    record.geometry = parseStoredJson(row.sourceGeometry)
  }

  return record
}

async function resolveRecordsRequest(args: {
  env: AppBindings
  family: SourceFamily
  metaDb: AppEnv['Variables']['metaDb']
  sourceReleaseCode: string
}) {
  const release = await resolveSourceRelease(args.metaDb, args.sourceReleaseCode)
  if (!release) return null

  const entry = sourceCatalogueFor(args.family)[release.datasetCode]
  const sourceDb = entry ? sourceBindingForName(args.env, release.bindingName) : null
  if (!entry || !sourceDb) return null

  return { entry, release, sourceDb }
}

export async function listSourceRecords(args: {
  cursor?: string
  env: AppBindings
  family: SourceFamily
  includeGeometry: boolean
  limit?: number
  metaDb: AppEnv['Variables']['metaDb']
  sourceReleaseCode: string
}): Promise<SourceRecordPage | null> {
  const resolved = await resolveRecordsRequest(args)
  if (!resolved) return null

  const cursor = decodeCursor(args.cursor)
  if (args.cursor && !cursor) {
    throw new SourceRecordRequestError(
      'invalid_cursor',
      'The source cursor is invalid.',
    )
  }
  const limit = Math.min(args.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT)
  const rows = await readSourceRecordPage({
    ...resolved,
    cursor,
    includeGeometry: args.includeGeometry,
    limit: limit + 1,
  })
  const pageRows = rows.slice(0, limit)
  const last = pageRows.at(-1)

  return {
    nextCursor:
      rows.length > limit && last
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
      toSourceRecord(row, resolved.release, args.includeGeometry),
    ),
  }
}

export async function streamSourceRecordsNdjson(args: {
  cursor?: string
  env: AppBindings
  family: SourceFamily
  includeGeometry: boolean
  metaDb: AppEnv['Variables']['metaDb']
  sourceReleaseCode: string
}): Promise<ReadableStream<Uint8Array> | null> {
  const resolved = await resolveRecordsRequest(args)
  if (!resolved) return null

  let cursor = decodeCursor(args.cursor)
  if (args.cursor && !cursor) {
    throw new SourceRecordRequestError(
      'invalid_cursor',
      'The source cursor is invalid.',
    )
  }
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const rows = await readSourceRecordPage({
          ...resolved,
          cursor,
          includeGeometry: args.includeGeometry,
          limit: DOWNLOAD_PAGE_LIMIT,
        })
        for (const row of rows) {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify(toSourceRecord(row, resolved.release, args.includeGeometry))}\n`,
            ),
          )
        }

        const last = rows.at(-1)
        if (!last || rows.length < DOWNLOAD_PAGE_LIMIT) {
          controller.close()
          return
        }

        cursor = {
          sourceRecordId: last.sourceRecordId,
          versionHash: last.versionHash,
        }
      } catch (error) {
        controller.error(error)
      }
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
        ? `/v0.1/divisions/sources?sourceRelease=${encodeURIComponent(row.sourceReleaseCode)}`
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
         WHERE apiVersions.familyType = ?
           AND apiReleaseSets.status = 'published'
           ${selectionCondition}
         ORDER BY coalesce(apiReleaseSets.publishedAt, apiReleaseSets.createdAt) DESC,
           apiReleaseSets.id DESC
         LIMIT 1`,
      )
      .bind(args.family, ...(selector ? [selector.value] : []))
      .first<{ id: string }>(),
  )
  if (!selectionResult) return []

  return querySourceReleaseDiscoveryRows(args.metaDb, {
    apiReleaseSetId: selectionResult.id,
    datasetCode: args.datasetCode,
  })
}

async function listSnapshotSourceReleases(
  args: {
    datasetCode?: string
    family: SourceFamily
    metaDb: AppEnv['Variables']['metaDb']
  },
  snapshotCode: string,
) {
  return querySourceReleaseDiscoveryRows(args.metaDb, {
    datasetCode: args.datasetCode,
    family: args.family,
    snapshotCode,
  })
}

async function querySourceReleaseDiscoveryRows(
  metaDb: AppEnv['Variables']['metaDb'],
  selector:
    | { apiReleaseSetId: string; datasetCode?: string }
    | { datasetCode?: string; family: SourceFamily; snapshotCode: string },
) {
  const byReleaseSet = 'apiReleaseSetId' in selector
  const sourceCondition = byReleaseSet
    ? 'apiReleaseSetSnapshots.apiReleaseSetId = ?'
    : "apiVersions.familyType = ? AND snapshots.code = ? AND apiReleaseSets.status = 'published'"
  const datasetCondition = selector.datasetCode ? 'AND datasets.code = ?' : ''
  const values = byReleaseSet
    ? [
        selector.apiReleaseSetId,
        ...(selector.datasetCode ? [selector.datasetCode] : []),
      ]
    : [
        selector.family,
        selector.snapshotCode,
        ...(selector.datasetCode ? [selector.datasetCode] : []),
      ]
  const result = await runWithD1ReadRetry(() =>
    metaDb.$client
      .prepare(
        `SELECT DISTINCT
          datasets.code AS datasetCode,
          releases.resourceType AS resourceType,
          releases.code AS sourceReleaseCode,
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
        INNER JOIN releases ON releases.id = snapshotSources.sourceReleaseId
        INNER JOIN datasets ON datasets.id = releases.datasetId
        WHERE ${sourceCondition}
        ${datasetCondition}
        ORDER BY datasets.code ASC, releases.code ASC, snapshots.code ASC`,
      )
      .bind(...values)
      .all<SourceReleaseDiscoveryRow>(),
  )
  return result.results
}
