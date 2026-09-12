import {
  buildStatisticsApiStats,
  listStatisticsStatsReleases,
} from './statisticsApiReleaseSetStats'
import { listApiReleaseSetSnapshots } from '@repo/core/db/metaRegistry'
import { createHash } from 'node:crypto'
import {
  buildDivisionApiStats,
  type DivisionHistoryTarget,
} from './divisionApiReleaseSetStats'
import { buildAddressApiReleaseSetChurn } from './addressApiReleaseSetStats'

import {
  buildAddressApiReleaseSetStatsRows,
  createLocaleStatsAccumulator,
  type AddressDivisionQualityCounts,
  type StatsLocaleGroup,
} from '@repo/core/pipeline/services/metrics/releaseStats'
import {
  buildPlaceLocalisationStatistics,
  type PlaceLocaleConflict,
  type PlaceI18nRecord,
} from '@repo/core/pipeline/services/places/place'
import { replaceApiReleaseSetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { createD1ImportClient } from '@repo/core/d1ImportApi'
import type { PublishDatasetResult } from '@repo/core/pipeline/harbourClient'
import { and, currentSchema, eq, sql } from '@repo/db'
import type { ApiReleaseSetScopedStatsRow } from '@repo/db/metaSchema'
import type { AnyColumn } from 'drizzle-orm'

import type { OperationProgress } from '../cli/operationProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../pipeline/local/progressFormatting.ts'

type D1ExecBinding = {
  exec?(sql: string): Promise<unknown>
  batch?(statements: Array<{ run(): Promise<unknown> }>): Promise<unknown>
  prepare?(sql: string): {
    run(): Promise<unknown>
  }
}

export type ApiReleaseSetStatsImportOptions = {
  accountId?: string
  apiToken?: string
  isLocal: boolean
  metaBinding?: D1ExecBinding
  metaDatabaseId?: string | null
  pollIntervalMs?: number
}

export type ApiReleaseSetStatsTarget = {
  apiReleaseSetId?: string
  snapshotId?: string
}

type CalculateApiReleaseSetStatsOptions = {
  currentDb: HarbourReadableDb
  historyTargets?: DivisionHistoryTarget[]
  family: 'address' | 'division' | 'place' | 'statistics'
  harbourClient: HarbourClient
  importOptions: ApiReleaseSetStatsImportOptions
  metaDb: HarbourReadableDb & HarbourWritableDb
  progress: OperationProgress
  releaseCode?: string
  releaseId: string
  target: ApiReleaseSetStatsTarget
  addressQuality?: AddressDivisionQualityCounts
}

type GroupCountRow = {
  count: number
  groupValue: string | number | null
}

const API_RELEASE_SET_STATS_PHASE = 'calculateApiReleaseSetStats'

export function resolveApiReleaseSetStatsTarget(
  publishResult: PublishDatasetResult | void | null | undefined,
): ApiReleaseSetStatsTarget {
  return {
    apiReleaseSetId: publishResult?.apiReleaseSetId,
    snapshotId: publishResult?.snapshotId,
  }
}

/** A source snapshot may publish before the required API companion snapshots. */
export function isApiReleaseSetStatsReady(
  result: PublishDatasetResult | void | null | undefined,
) {
  return Boolean(
    result?.apiReleaseSetId &&
      result.snapshotId &&
      result.apiReleaseSetStatus !== 'draft',
  )
}

/** A compilation upload can publish several reference periods at once. */
export async function calculateAndStorePublishedStatisticsStats(
  options: Omit<CalculateApiReleaseSetStatsOptions, 'family' | 'target'>,
  published: PublishDatasetResult | void,
) {
  if (!published) return
  const codes = new Set(
    published.apiReleaseSetPublications?.map(row => row.apiReleaseSetCode) ?? [],
  )
  if (isApiReleaseSetStatsReady(published) && published.apiReleaseSetCode)
    codes.add(published.apiReleaseSetCode)
  const releases = (await listStatisticsStatsReleases(options.metaDb)).filter(
    row =>
      codes.has(row.code) ||
      (isApiReleaseSetStatsReady(published) && row.id === published.apiReleaseSetId),
  )
  for (const release of releases) {
    const snapshots = (
      await listApiReleaseSetSnapshots(options.metaDb, release.id)
    ).filter(row => row.snapshotResourceType === 'divisionStatistic')
    const snapshot =
      snapshots.find(row => row.snapshotId === published.snapshotId) ?? snapshots[0]
    if (!snapshot) throw new Error(`No Statistics snapshot for ${release.code}`)
    await calculateAndStoreApiReleaseSetStats({
      ...options,
      family: 'statistics',
      target: { apiReleaseSetId: release.id, snapshotId: snapshot.snapshotId },
    })
  }
}

export async function calculateAndStoreApiReleaseSetStats(
  options: CalculateApiReleaseSetStatsOptions,
) {
  const { apiReleaseSetId, snapshotId } = options.target

  if (!apiReleaseSetId || !snapshotId) {
    throw new Error(
      'Cannot calculate API release set stats without apiReleaseSetId and snapshotId.',
    )
  }

  const startedAt = Date.now()

  options.progress.beginPhase(
    formatRunningPhaseLabel(colorTeal('Calculate'), colorRed('stats'), 0, 2),
    {
      current: 0,
      max: 2,
    },
  )
  await options.harbourClient.stageRunning(
    options.releaseId,
    API_RELEASE_SET_STATS_PHASE,
    {
      apiReleaseSetId,
      snapshotId,
      step: 'count',
    },
    options.releaseCode,
  )

  try {
    const rows =
      options.family === 'statistics'
        ? await buildStatisticsApiStats(
            options.metaDb,
            options.historyTargets ?? [],
            apiReleaseSetId,
          )
        : options.family === 'address'
          ? await (async () => {
              const churn = await buildAddressApiReleaseSetChurn(
                options.metaDb,
                options.historyTargets ?? [],
                apiReleaseSetId,
              )
              return buildAddressApiReleaseSetStatsForSnapshot(
                options.currentDb,
                snapshotId,
                options.addressQuality,
                churn,
              )
            })()
          : options.family === 'division'
            ? await buildDivisionApiStats(
                options.metaDb,
                options.historyTargets ?? [],
                apiReleaseSetId,
              )
            : await buildPlaceStatsRows(
                options.currentDb,
                snapshotId,
                await readPlaceLocaleConflicts(options.metaDb, options.releaseId),
              )

    options.progress.update(1, {
      label: formatRunningPhaseLabel(colorTeal('Calculate'), colorRed('stats'), 1, 2),
    })
    await options.harbourClient.stageRunning(
      options.releaseId,
      API_RELEASE_SET_STATS_PHASE,
      {
        apiReleaseSetId,
        snapshotId,
        statsRows: rows.length,
        step: 'write',
      },
      options.releaseCode,
    )

    await storeApiReleaseSetStats(
      options.metaDb,
      options.importOptions,
      apiReleaseSetId,
      rows,
    )

    const stats = {
      apiReleaseSetId,
      durationMs: Date.now() - startedAt,
      snapshotId,
      statsRows: rows.length,
    }

    options.progress.update(2, {
      label: formatRunningPhaseLabel(colorTeal('Calculate'), colorRed('stats'), 2, 2),
    })
    options.progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(
          colorTeal('Calculate'),
          colorRed('stats'),
          rows.length,
        ),
        [formatDurationMs(stats.durationMs)],
      ),
    )
    await options.harbourClient.stageCompleted(
      options.releaseId,
      API_RELEASE_SET_STATS_PHASE,
      stats,
      options.releaseCode,
    )

    return stats
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    await options.harbourClient.stageFailed(
      options.releaseId,
      API_RELEASE_SET_STATS_PHASE,
      errorMessage,
      {
        apiReleaseSetId,
        durationMs: Date.now() - startedAt,
        snapshotId,
      },
      options.releaseCode,
    )
    throw error
  }
}

export async function buildAddressApiReleaseSetStatsForSnapshot(
  db: HarbourReadableDb,
  snapshotId: string,
  quality?: AddressDivisionQualityCounts,
  churn?: Parameters<typeof buildAddressApiReleaseSetStatsRows>[0]['churn'],
): Promise<ApiReleaseSetScopedStatsRow[]> {
  const [
    address2dCount,
    address2dI18nCount,
    address3dCount,
    address3dI18nCount,
    streetLinkedCount,
    districtLinkedCount,
    areaLinkedCount,
    componentCounts,
    byDistrict,
    unmatchedAreaCount,
    unmatchedDistrictCount,
  ] = await Promise.all([
    countRows(
      db,
      currentSchema.address2d,
      currentSchema.address2d.snapshotId,
      snapshotId,
    ),
    countRows(
      db,
      currentSchema.address2dI18n,
      currentSchema.address2dI18n.snapshotId,
      snapshotId,
    ),
    countRows(
      db,
      currentSchema.address3d,
      currentSchema.address3d.snapshotId,
      snapshotId,
    ),
    countRows(
      db,
      currentSchema.address3dI18n,
      currentSchema.address3dI18n.snapshotId,
      snapshotId,
    ),
    countWhere(
      db,
      currentSchema.address2d,
      and(
        eq(currentSchema.address2d.snapshotId, snapshotId),
        sql`${currentSchema.address2d.streetId} IS NOT NULL`,
      ),
    ),
    countWhere(
      db,
      currentSchema.address2d,
      and(
        eq(currentSchema.address2d.snapshotId, snapshotId),
        sql`${currentSchema.address2d.districtId} IS NOT NULL`,
      ),
    ),
    countWhere(
      db,
      currentSchema.address2d,
      and(
        eq(currentSchema.address2d.snapshotId, snapshotId),
        sql`${currentSchema.address2d.areaId} IS NOT NULL`,
      ),
    ),
    buildAddressComponentCounts(db, snapshotId),
    countGrouped(
      db,
      currentSchema.address2d,
      currentSchema.address2d.snapshotId,
      snapshotId,
      currentSchema.address2d.districtId,
    ),
    countWhere(
      db,
      currentSchema.address2d,
      and(
        eq(currentSchema.address2d.snapshotId, snapshotId),
        sql`${currentSchema.address2d.areaId} IS NULL`,
      ),
    ),
    countWhere(
      db,
      currentSchema.address2d,
      and(
        eq(currentSchema.address2d.snapshotId, snapshotId),
        sql`${currentSchema.address2d.districtId} IS NULL`,
      ),
    ),
  ])
  const localeStats = await buildAddressLocaleStats(db, snapshotId, address2dCount)
  const unitStats = await db
    .select({
      count: sql<number>`COALESCE(SUM(${currentSchema.address3d.unitCount}), 0)`,
    })
    .from(currentSchema.address3d)
    .where(eq(currentSchema.address3d.snapshotId, snapshotId))
    .get()

  return buildAddressApiReleaseSetStatsRows({
    address2dCount,
    address2dI18nCount,
    address3dCount,
    address3dI18nCount,
    address3dUnitCount: Number(unitStats?.count ?? 0),
    areaLinkedCount,
    byDistrict,
    componentCounts,
    churn,
    districtLinkedCount,
    localeStats,
    missingStreetCount: Math.max(0, address2dCount - streetLinkedCount),
    quality: quality ?? {
      ambiguous_area_count: 0,
      ambiguous_district_count: 0,
      unmatched_area_count: unmatchedAreaCount,
      unmatched_district_count: unmatchedDistrictCount,
    },
    streetLinkedCount,
  })
}

async function buildAddressComponentCounts(db: HarbourReadableDb, snapshotId: string) {
  const row = await db
    .select({
      block: countDistinctAddressComponent(currentSchema.address2dI18n.blockExpression),
      building_name: countDistinctAddressComponent(
        currentSchema.address2dI18n.buildingName,
      ),
      building_number: countDistinctAddressComponent(
        currentSchema.address2dI18n.buildingNumberExpression,
      ),
      estate_name: countDistinctAddressComponent(
        currentSchema.address2dI18n.estateName,
      ),
      phase: countDistinctAddressComponent(currentSchema.address2dI18n.phaseExpression),
      street_name: countDistinctAddressComponent(
        currentSchema.address2dI18n.streetName,
      ),
    })
    .from(currentSchema.address2dI18n)
    .where(eq(currentSchema.address2dI18n.snapshotId, snapshotId))
    .get()

  return Object.fromEntries(
    Object.entries(row ?? {}).map(([component, count]) => [
      component,
      Number(count ?? 0),
    ]),
  )
}

function countDistinctAddressComponent(column: unknown) {
  return sql<number>`count(distinct case when ${column} is not null then ${currentSchema.address2dI18n.addressId} end)`
}

async function buildPlaceStatsRows(
  db: HarbourReadableDb,
  snapshotId: string,
  localeConflictsByPlace: Map<string, PlaceLocaleConflict[]> = new Map(),
): Promise<ApiReleaseSetScopedStatsRow[]> {
  const [placeRows, i18nRows, addressLinkedCount, divisionLinkCount, localeCounts] =
    await Promise.all([
      db
        .select({ id: currentSchema.places.id })
        .from(currentSchema.places)
        .where(eq(currentSchema.places.snapshotId, snapshotId))
        .all(),
      db
        .select()
        .from(currentSchema.placesI18n)
        .where(eq(currentSchema.placesI18n.snapshotId, snapshotId))
        .all(),
      countWhere(
        db,
        currentSchema.places,
        and(
          eq(currentSchema.places.snapshotId, snapshotId),
          sql`${currentSchema.places.address2dId} IS NOT NULL OR ${currentSchema.places.address3dId} IS NOT NULL`,
        ),
      ),
      countRows(
        db,
        currentSchema.placesDivision,
        currentSchema.placesDivision.placeSnapshotId,
        snapshotId,
      ),
      countGrouped(
        db,
        currentSchema.placesI18n,
        currentSchema.placesI18n.snapshotId,
        snapshotId,
        currentSchema.placesI18n.locale,
      ),
    ])

  const timestamp = new Date().toISOString()
  const typedPlaceRows = placeRows as Array<{ id: string }>
  const typedI18nRows = i18nRows as Array<{
    placeId: string
    locale: string
    name: string | null
    nameAlts: string | null
    nameVariant: unknown
    brandName: string | null
    brandNameAlts: string | null
    brandNameVariant: unknown
    freeformAddress: string | null
    provenance: unknown
  }>
  const placeCount = typedPlaceRows.length
  const i18nCount = typedI18nRows.length
  const i18nByPlace = new Map<string, typeof typedI18nRows>()
  for (const row of typedI18nRows) {
    const rows = i18nByPlace.get(row.placeId) ?? []
    rows.push(row)
    i18nByPlace.set(row.placeId, rows)
  }
  const localisationStats = buildPlaceLocalisationStatistics(
    typedPlaceRows.map(place => ({
      id: place.id,
      localeConflicts: localeConflictsByPlace.get(place.id) ?? [],
      i18n: (i18nByPlace.get(place.id) ?? []).map(row => ({
        locale: row.locale,
        name: row.name,
        nameAlts: row.nameAlts,
        nameVariant: row.nameVariant as string[] | null,
        brandName: row.brandName,
        brandNameAlts: row.brandNameAlts,
        brandNameVariant: row.brandNameVariant as string[] | null,
        freeformAddress: row.freeformAddress,
        provenance: (row.provenance ?? {
          isMachineTranslated: [],
          isHumanVerified: [],
          isLocaleInferred: false,
        }) as PlaceI18nRecord['provenance'],
      })),
    })),
  )
  const localisedPlaceCount = typedPlaceRows.filter(
    place => (i18nByPlace.get(place.id)?.length ?? 0) > 0,
  ).length
  const rows: ApiReleaseSetScopedStatsRow[] = [
    placeStatsRow('records', 'count', 'count', placeCount, timestamp),
    placeStatsRow(
      'localised_records',
      'count',
      'count',
      localisedPlaceCount,
      timestamp,
    ),
    placeStatsRow('localised_rows', 'count', 'count', i18nCount, timestamp),
    placeStatsRow('address_links', 'count', 'count', addressLinkedCount, timestamp),
    placeStatsRow('division_links', 'count', 'count', divisionLinkCount, timestamp),
  ]
  for (const [locale, count] of localeCounts) {
    rows.push(
      placeStatsRow('localised_records', 'count', 'count', count, timestamp, {
        groupBy: 'locale',
        groupValue: locale,
      }),
    )
  }
  for (const [fieldLocale, stats] of localisationStats.fields) {
    const [field, locale] = fieldLocale.split('\u0000')
    const groupValue = `${field}:${locale}`
    rows.push(
      placeStatsRow(
        'localisation_value_count',
        'count',
        'count',
        stats.valueCount,
        timestamp,
        {
          groupBy: 'field_locale',
          groupValue,
        },
      ),
      placeStatsRow(
        'localisation_coverage',
        'coverage',
        'percentage',
        percentage(stats.valueCount, placeCount),
        timestamp,
        {
          groupBy: 'field_locale',
          groupValue,
        },
      ),
      placeStatsRow(
        'localisation_provided_coverage',
        'coverage',
        'percentage',
        percentage(stats.providedCount, placeCount),
        timestamp,
        {
          groupBy: 'field_locale',
          groupValue,
        },
      ),
      placeStatsRow(
        'localisation_inferred_coverage',
        'coverage',
        'percentage',
        percentage(stats.inferredCount, placeCount),
        timestamp,
        {
          groupBy: 'field_locale',
          groupValue,
        },
      ),
      placeStatsRow(
        'localisation_ai_translated_coverage',
        'coverage',
        'percentage',
        percentage(stats.aiTranslatedCount, placeCount),
        timestamp,
        {
          groupBy: 'field_locale',
          groupValue,
        },
      ),
      placeStatsRow(
        'localisation_human_translated_coverage',
        'coverage',
        'percentage',
        percentage(stats.humanTranslatedCount, placeCount),
        timestamp,
        {
          groupBy: 'field_locale',
          groupValue,
        },
      ),
      placeStatsRow(
        'localisation_conflict_count',
        'count',
        'count',
        stats.conflictCount,
        timestamp,
        {
          groupBy: 'field_locale',
          groupValue,
        },
      ),
      placeStatsRow(
        'localisation_missing_value_count',
        'count',
        'count',
        stats.missingCount,
        timestamp,
        {
          groupBy: 'field_locale',
          groupValue,
        },
      ),
    )
  }
  rows.push(
    placeStatsRow(
      'reference_name_count',
      'count',
      'count',
      localisationStats.referenceNameCount,
      timestamp,
    ),
    placeStatsRow(
      'reference_name_coverage',
      'coverage',
      'percentage',
      percentage(localisationStats.referenceNameCount, placeCount),
      timestamp,
    ),
    placeStatsRow(
      'bilingual_reference_name_count',
      'count',
      'count',
      localisationStats.bilingualReferenceNameCount,
      timestamp,
    ),
    placeStatsRow(
      'bilingual_reference_name_coverage',
      'coverage',
      'percentage',
      percentage(localisationStats.bilingualReferenceNameCount, placeCount),
      timestamp,
    ),
  )
  return rows
}

async function readPlaceLocaleConflicts(metaDb: HarbourReadableDb, releaseId: string) {
  const rows = await readReleaseAuditDecisions(
    metaDb,
    [releaseId],
    'overture_place_locale_conflict',
  )
  const conflictsByPlace = new Map<string, PlaceLocaleConflict[]>()
  for (const row of rows) {
    const evidence = row.evidence
    if (!evidence || typeof evidence !== 'object') continue
    const value = evidence as Record<string, unknown>
    const placeId = typeof value.placeId === 'string' ? value.placeId : null
    const field =
      value.field === 'brandName'
        ? 'brand'
        : value.field === 'name' || value.field === 'freeformAddress'
          ? value.field
          : null
    const script =
      value.script === 'han' ||
      value.script === 'latin' ||
      value.script === 'mixed' ||
      value.script === 'other'
        ? value.script
        : null
    if (
      !placeId ||
      !field ||
      typeof value.resolvedLocale !== 'string' ||
      !script ||
      value.conflict !== true ||
      typeof value.sourceText !== 'string'
    )
      continue
    const conflict: PlaceLocaleConflict = {
      field,
      sourceLocale: typeof value.sourceLocale === 'string' ? value.sourceLocale : null,
      resolvedLocale: value.resolvedLocale,
      script,
      conflict: true,
      reason: typeof value.reason === 'string' ? value.reason : null,
      sourceText: value.sourceText,
    }
    const existing = conflictsByPlace.get(placeId) ?? []
    existing.push(conflict)
    conflictsByPlace.set(placeId, existing)
  }
  return conflictsByPlace
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2))
}

function placeStatsRow(
  dimension: string,
  metric: string,
  metricUnit: string,
  value: number,
  timestamp: string,
  grouping?: { groupBy: string; groupValue: string },
): ApiReleaseSetScopedStatsRow {
  return {
    createdAt: timestamp,
    dimension,
    groupBy: grouping?.groupBy ?? null,
    groupValue: grouping?.groupValue ?? null,
    metric,
    metricUnit,

    updatedAt: timestamp,
    value,
  }
}

async function buildAddressLocaleStats(
  db: HarbourReadableDb,
  snapshotId: string,
  total: number,
) {
  const stats = createLocaleStatsAccumulator()
  stats.total = total

  const rows = await db
    .select({
      count: sql<number>`count(distinct ${currentSchema.address2dI18n.addressId})`,
      groupValue: currentSchema.address2dI18n.locale,
    })
    .from(currentSchema.address2dI18n)
    .where(eq(currentSchema.address2dI18n.snapshotId, snapshotId))
    .groupBy(currentSchema.address2dI18n.locale)
    .all()

  for (const row of rows) {
    const group = toStatsLocaleGroup(String(row.groupValue))

    if (!group) {
      continue
    }

    const count = Number(row.count ?? 0)
    stats.count.set(group, count)
    stats.providedCoverage.set(group, count)
  }

  return stats
}

async function countRows(
  db: HarbourReadableDb,
  table: unknown,
  snapshotIdColumn: AnyColumn,
  snapshotId: string,
) {
  return countWhere(db, table, eq(snapshotIdColumn, snapshotId))
}

async function countWhere(db: HarbourReadableDb, table: unknown, condition: unknown) {
  const row = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(table)
    .where(condition)
    .get()

  return Number(row?.count ?? 0)
}

async function countGrouped(
  db: HarbourReadableDb,
  table: unknown,
  snapshotIdColumn: AnyColumn,
  snapshotId: string,
  groupColumn: AnyColumn,
) {
  const rows = await db
    .select({
      count: sql<number>`count(*)`,
      groupValue: groupColumn,
    })
    .from(table)
    .where(eq(snapshotIdColumn, snapshotId))
    .groupBy(groupColumn)
    .all()

  return new Map(
    (rows as GroupCountRow[])
      .filter(row => row.groupValue != null)
      .map(row => [String(row.groupValue), Number(row.count ?? 0)]),
  )
}

async function storeApiReleaseSetStats(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  options: ApiReleaseSetStatsImportOptions,
  apiReleaseSetId: string,
  rows: ApiReleaseSetScopedStatsRow[],
) {
  if (options.isLocal) {
    await replaceApiReleaseSetStats(metaDb, apiReleaseSetId, rows)
    return
  }

  if (!options.accountId || !options.apiToken || !options.metaDatabaseId) {
    throw new Error('Remote API release set stats import requires DB_META credentials.')
  }

  const sqlText = buildStatsSql(apiReleaseSetId, rows)
  // D1's import endpoint validates the uploaded object using its MD5 ETag.
  // Keep this aligned with the regular SQL import path; SHA-256 is used for
  // provenance hashes, not for the import upload contract.
  const etag = createHash('md5').update(new TextEncoder().encode(sqlText)).digest('hex')
  const client = createD1ImportClient({
    accountId: options.accountId,
    apiToken: options.apiToken,
    databaseId: options.metaDatabaseId,
  })

  await client.importSql({
    etag,
    pollIntervalMs: options.pollIntervalMs,
    sql: sqlText,
  })
}

function buildStatsSql(apiReleaseSetId: string, rows: ApiReleaseSetScopedStatsRow[]) {
  return [
    `DELETE FROM stats WHERE apiReleaseSetId = ${sqlLiteral(apiReleaseSetId)};`,
    ...rows.map(row =>
      [
        'INSERT INTO stats (id, releaseId, apiReleaseSetId, dimension, metric, metricUnit, value, groupBy, groupValue, createdAt, updatedAt) VALUES (',
        [
          crypto.randomUUID(),
          null,
          apiReleaseSetId,
          row.dimension,
          row.metric,
          row.metricUnit,
          row.value,
          row.groupBy,
          row.groupValue,
          row.createdAt,
          row.updatedAt,
        ]
          .map(sqlLiteral)
          .join(', '),
        ');',
      ].join(''),
    ),
  ].join('\n')
}

function toStatsLocaleGroup(locale: string): StatsLocaleGroup | null {
  if (locale === 'en') {
    return 'en'
  }

  if (['zh', 'zh-hant', 'zh-hk', 'zh-mo', 'zh-tw'].includes(locale)) {
    return 'zh-hant'
  }

  if (['zh-hans', 'zh-cn', 'zh-sg'].includes(locale)) {
    return 'zh-hans'
  }

  return null
}

function sqlLiteral(value: boolean | number | string | null | undefined) {
  if (value == null) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialise non-finite SQL number: ${value}`)
    }

    return String(value)
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  return `'${value.replaceAll("'", "''")}'`
}
import { readReleaseAuditDecisions } from '@repo/core/pipeline/db/processingActionStorage'
