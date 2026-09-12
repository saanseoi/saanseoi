import { readDivisionSnapshot } from './readDivisionSnapshot.ts'
import { readGeometrySnapshot } from './readGeometrySnapshot.ts'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay'
import { resolvePublishedSnapshotForResourceTypeRegionCohortKey } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import { hashDivisionGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { buildGeometryReleaseStatsRows } from '@repo/core/pipeline/services/metrics/releaseStats'
import {
  calculateDistrictGeometryStatistics,
  selectDistrictRelevantGeometryRecords,
} from '@repo/core/pipeline/services/metrics/geometryStats'
import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'
import {
  decompressJsonBrotli,
  MAX_BROTLI_QUALITY,
} from '@repo/core/pipeline/services/storage/brotliJson.ts'
import { currentSchema } from '@repo/db'
import { eq } from 'drizzle-orm'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import type { resolveLocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import type {
  GeometryUploadPlan,
  NormalisedGeometry,
} from './processLocalDivisionGeometrySqlUploadTypes.ts'
import { resolveProviderBridgeConfig } from './processLocalDivisionGeometrySqlUploadPreparation.ts'
import { divisionReferenceIds } from './processLocalDivisionGeometrySqlUploadReferences.ts'
import { CENSTATD_2021_DISTRICT_VARIANT } from './processLocalDivisionGeometrySqlUploadConfig.ts'
import { isGeoJsonPolygon } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry.ts'

function geometryStatRow(
  dimension: string,
  metric: string,
  value: number,
  groupBy: string | null = null,
  groupValue: string | null = null,
) {
  return {
    dimension,
    metric,
    metricUnit: 'count',
    value,
    groupBy,
    groupValue,
  }
}

export function shouldCompressCanonicalGeometry(
  source: GeometryUploadPlan['source'],
  transform: GeometryUploadPlan['transform'],
) {
  return (
    source === 'hkgov-pland-pu' ||
    (source === 'hkgov-censtatd' && transform === undefined)
  )
}

/** Planning Unit display geometry can still contain large coastal coverages. */
export function canonicalGeometryBrotliQuality(source: GeometryUploadPlan['source']) {
  return source === 'hkgov-pland-pu' ? MAX_BROTLI_QUALITY : undefined
}

/** Only the exact source pass owns release-level geometry measurements. */
export function shouldWriteExactGeometryReleaseStats(
  transform: GeometryUploadPlan['transform'],
) {
  return transform !== 'simplified'
}

type GeometryChurnCounts = {
  added: number
  byType: Map<string, GeometryChurnCounts>
  changed: number
  count: number
  removed: number
  unchanged: number
}

function createEmptyGeometryChurnCounts(): GeometryChurnCounts {
  return { added: 0, byType: new Map(), changed: 0, count: 0, removed: 0, unchanged: 0 }
}

function churnCountsForType(churn: GeometryChurnCounts, type: string) {
  const existing = churn.byType.get(type)
  if (existing) return existing
  const counts = createEmptyGeometryChurnCounts()
  churn.byType.set(type, counts)
  return counts
}

export function createGeometryChurnCounts(
  rows: Array<NonNullable<NormalisedGeometry>>,
  hashes: Map<string, string>,
  previousById: Map<string, { id: string; type: string; versionHash: string }>,
  options: { merge?: boolean } = {},
) {
  const churn = createEmptyGeometryChurnCounts()

  for (const row of rows) {
    const previous = previousById.get(row.canonical.id)
    const typeCounts = churnCountsForType(churn, row.canonical.type)
    churn.count += 1
    typeCounts.count += 1

    if (!previous) {
      churn.added += 1
      typeCounts.added += 1
    } else if (previous.versionHash === hashes.get(row.canonical.id)) {
      churn.unchanged += 1
      typeCounts.unchanged += 1
    } else {
      churn.changed += 1
      typeCounts.changed += 1
    }
  }

  for (const previous of previousById.values()) {
    // Merge uploads carry absent parent members into the resulting snapshot.
    // Release counts describe incoming rows, not the shared snapshot inventory.
    if (options.merge) continue
    if (hashes.has(previous.id)) continue
    churn.removed += 1
    churnCountsForType(churn, previous.type).removed += 1
  }

  return churn
}

export async function getGeometryChurnBaseline(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  resourceType: GeometryUploadPlan['resourceType'],
  parentSnapshotId: string | null,
) {
  if (!parentSnapshotId) {
    return new Map<string, { id: string; type: string; versionHash: string }>()
  }

  const parentRows =
    resourceType === 'divisionArea'
      ? await currentDb
          .select()
          .from(currentSchema.divisionAreas)
          .where(eq(currentSchema.divisionAreas.snapshotId, parentSnapshotId))
          .all()
      : await currentDb
          .select()
          .from(currentSchema.divisionBoundaries)
          .where(eq(currentSchema.divisionBoundaries.snapshotId, parentSnapshotId))
          .all()

  return new Map(
    await Promise.all(
      parentRows.map(
        async row =>
          [
            row.id,
            {
              id: row.id,
              type: row.type,
              versionHash: await hashDivisionGeometryRow({
                ...row,
                geometry: decodeStoredGeoJsonGeometry(row.geometry),
              }),
            },
          ] as const,
      ),
    ),
  )
}

export async function buildGeometryStats(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  _historyDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  rows: Array<NonNullable<NormalisedGeometry>>,
  churn: GeometryChurnCounts,
  historyTargets: readonly ReplayShard[] = [],
) {
  const churnStats = buildGeometryChurnStatRows(plan.resourceType, churn)
  if (isHousingMarketAreaPlan(plan)) {
    // Housing Market Areas are their own geographic domain. Their records are
    // shown on the district map only after a positive-area spatial
    // intersection with the official C&SD district geometry; they must not
    // contribute their full geometry measurements to every district they cross.
    return [
      ...churnStats,
      ...buildHousingMarketAreaDistrictDistributionRows(
        rows,
        await resolveHousingMarketAreaDistrictGeometries(
          currentDb,
          metaDb,
          historyTargets,
        ),
      ),
    ]
  }
  if (!supportsDistrictGeometryStatistics(plan)) {
    // Statistics geography, Planning Units/Subunits, and New Towns are
    // separate division domains. Their geometry needs a domain-specific
    // grouping contract rather than a misleading district assignment, while
    // lifecycle churn remains useful.
    return churnStats
  }
  const districts = await resolveGeometryDistricts(
    currentDb,
    metaDb,
    plan,
    historyTargets,
  )
  if (resolveProviderBridgeConfig(plan)) {
    for (const row of rows) {
      for (const divisionId of divisionReferenceIds(plan.resourceType, row)) {
        // HAD and C&SD bridges resolve these canonical identifiers directly to
        // districts, including historical cohorts whose generic hierarchy has
        // no matching snapshot entry.
        if (!districts.has(divisionId)) districts.set(divisionId, divisionId)
      }
    }
  }
  const geometryRows =
    plan.source === 'overture'
      ? selectDistrictRelevantGeometryRecords(
          plan.resourceType,
          rows.map(row => ({
            ...row.canonical,
            geometry: row.canonical.geometry as GeoJsonGeometry,
          })),
          districts,
        ).records
      : rows.map(row => ({
          ...row.canonical,
          geometry: row.canonical.geometry as GeoJsonGeometry,
        }))
  return [
    ...churnStats,
    ...buildGeometryReleaseStatsRows(
      plan.resourceType,
      calculateDistrictGeometryStatistics(plan.resourceType, geometryRows, districts),
    ),
    ...buildGeometryDistrictDistributionRows(plan.resourceType, rows, districts),
  ]
}

function isHousingMarketAreaPlan(plan: GeometryUploadPlan) {
  return (
    plan.resourceType === 'divisionArea' &&
    plan.source === 'hkgov-censtatd' &&
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  )
}

export function supportsDistrictGeometryStatistics(plan: GeometryUploadPlan) {
  return (
    plan.source === 'hkgov-had' ||
    plan.source === 'overture' ||
    (plan.source === 'hkgov-censtatd' &&
      (plan.datasetCode ===
        'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district'))
  )
}

function buildGeometryChurnStatRows(
  _type: GeometryUploadPlan['resourceType'],
  churn: GeometryChurnCounts,
) {
  const rows = [
    geometryStatRow('count', 'churn', churn.count),
    geometryStatRow('added_count', 'churn', churn.added),
    geometryStatRow('changed_count', 'churn', churn.changed),
    geometryStatRow('removed_count', 'churn', churn.removed),
    geometryStatRow('unchanged_count', 'churn', churn.unchanged),
  ]

  for (const [groupValue, counts] of [...churn.byType].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    rows.push(
      geometryStatRow('count', 'churn', counts.count, 'type', groupValue),
      geometryStatRow('added_count', 'churn', counts.added, 'type', groupValue),
      geometryStatRow('changed_count', 'churn', counts.changed, 'type', groupValue),
      geometryStatRow('removed_count', 'churn', counts.removed, 'type', groupValue),
      geometryStatRow('unchanged_count', 'churn', counts.unchanged, 'type', groupValue),
    )
  }

  return rows
}

async function resolveGeometryDistricts(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  historyTargets: readonly ReplayShard[],
) {
  if (resolveProviderBridgeConfig(plan)) {
    // HAD and C&SD geometries are normalised through cohort-scoped identifier
    // bridges to canonical district IDs. No unrelated division snapshot may
    // replace that reviewed source mapping.
    return new Map<string, string>()
  }
  const snapshot =
    (await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      metaDb,
      'division',
      plan.regionCode,
      plan.cohortKey,
      { variant: plan.source },
    )) ??
    (await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      metaDb,
      'division',
      plan.regionCode,
      plan.cohortKey,
    ))
  if (!snapshot) {
    throw new Error(
      `No published division snapshot exists for ${plan.regionCode}/${plan.cohortKey}; geometry statistics require versioned district assignments.`,
    )
  }

  const { divisions } = await readDivisionSnapshot(
    currentDb as never,
    metaDb,
    snapshot.id,
    historyTargets,
  )

  return new Map(
    divisions.flatMap(division => {
      if (division.class === 'district') return [[division.id, division.id]]
      const ids = [
        ...new Set(
          division.hierarchies.administrative
            .flat()
            .filter(entry => entry.class === 'district')
            .map(entry => entry.id),
        ),
      ]
      return ids.length === 1 && ids[0] ? [[division.id, ids[0]]] : []
    }),
  )
}

async function resolveHousingMarketAreaDistrictGeometries(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  historyTargets: readonly ReplayShard[],
) {
  const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    metaDb,
    'divisionArea',
    'hk',
    '2021',
    { variant: CENSTATD_2021_DISTRICT_VARIANT },
  )
  const rows = snapshot
    ? await readGeometrySnapshot(
        { currentDb, metaDb: metaDb as never, historyTargets: historyTargets as never },
        'divisionArea',
        snapshot.id,
      )
    : []

  const districts = new Map<string, GeoJsonGeometry>()
  for (const row of rows) {
    if (!('divisionId' in row)) continue
    if (districts.has(row.divisionId)) continue
    const geometry = decodeStoredGeoJsonGeometry(row.geometry)
    if (!isGeoJsonPolygon(geometry)) {
      throw new Error(
        `C&SD district ${row.divisionId} is not polygonal; Housing Market Area coverage cannot be calculated.`,
      )
    }
    districts.set(row.divisionId, geometry)
  }
  if (districts.size === 0) {
    throw new Error(
      `No C&SD 2021 district geometry is available; Housing Market Area coverage requires ${CENSTATD_2021_DISTRICT_VARIANT}.`,
    )
  }
  return districts
}

/** Decodes the Brotli BLOB used for exact C&SD canonical geometry in DB_CURRENT. */
export function decodeStoredGeoJsonGeometry(value: unknown): GeoJsonGeometry {
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return decompressJsonBrotli(value) as GeoJsonGeometry
  }
  if (typeof value === 'string') return JSON.parse(value) as GeoJsonGeometry
  if (value && typeof value === 'object') return value as GeoJsonGeometry
  throw new Error('Stored geometry could not be decoded.')
}

function buildGeometryDistrictDistributionRows(
  resourceType: GeometryUploadPlan['resourceType'],
  rows: Array<NonNullable<NormalisedGeometry>>,
  districtsByDivisionId: Map<string, string>,
) {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const districts = new Set(
      divisionReferenceIds(resourceType, row)
        .map(id => districtsByDivisionId.get(id))
        .filter((id): id is string => Boolean(id)),
    )
    for (const districtId of districts) {
      counts.set(districtId, (counts.get(districtId) ?? 0) + 1)
    }
  }

  return buildDistrictDistributionRows(counts)
}

function buildHousingMarketAreaDistrictDistributionRows(
  rows: Array<NonNullable<NormalisedGeometry>>,
  districtGeometries: ReadonlyMap<string, GeoJsonGeometry>,
) {
  return buildDistrictDistributionRows(
    calculateHousingMarketAreaDistrictCoverage(
      rows.map(row => ({
        geometry: row.canonical.geometry as GeoJsonGeometry,
        id: row.canonical.id,
      })),
      districtGeometries,
    ),
  )
}

/**
 * Counts an HMA in every official C&SD district with which its polygon has a
 * positive-area intersection. Boundary-only contact is deliberately excluded.
 * The coordinate reference system is sufficient here because area is used as a
 * non-zero predicate only, not reported as a measurement.
 */
export function calculateHousingMarketAreaDistrictCoverage(
  housingMarketAreas: ReadonlyArray<{ geometry: GeoJsonGeometry; id: string }>,
  districtGeometries: ReadonlyMap<string, GeoJsonGeometry>,
) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const districts = [...districtGeometries.entries()].map(([districtId, geometry]) => {
    if (!isGeoJsonPolygon(geometry)) {
      throw new Error(
        `C&SD district ${districtId} is not polygonal; Housing Market Area coverage cannot be calculated.`,
      )
    }
    const parsed = reader.read(JSON.stringify(geometry))
    // C&SD's authoritative 2021 CENSTATD:T ring self-intersects. Keep the
    // publisher geometry in storage, but make a valid temporary polygon for
    // the positive-area overlay predicate.
    const overlayGeometry = IsValidOp.isValid(parsed)
      ? parsed
      : BufferOp.bufferOp(parsed, 0)
    if (!IsValidOp.isValid(overlayGeometry)) {
      throw new Error(
        `C&SD district ${districtId} could not be repaired for Housing Market Area coverage.`,
      )
    }
    return { districtId, geometry: overlayGeometry }
  })
  const counts = new Map<string, number>()

  for (const housingMarketArea of housingMarketAreas) {
    if (!isGeoJsonPolygon(housingMarketArea.geometry)) {
      throw new Error(`Housing Market Area ${housingMarketArea.id} is not polygonal.`)
    }
    const geometry = reader.read(JSON.stringify(housingMarketArea.geometry))
    for (const district of districts) {
      if (OverlayOp.intersection(geometry, district.geometry).getArea() <= 0) {
        continue
      }
      counts.set(district.districtId, (counts.get(district.districtId) ?? 0) + 1)
    }
  }

  return counts
}

function buildDistrictDistributionRows(counts: ReadonlyMap<string, number>) {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupValue, value]) =>
      geometryStatRow('records', 'distribution', value, 'district', groupValue),
    )
}

export function buildOvertureGeometryProcessingActions(
  plan: GeometryUploadPlan,
  excludedRecords: Array<{
    divisionId: string | null
    divisionIds: string[] | null
    id: string | null
  }>,
): ReleaseProcessingAction[] {
  if (plan.source !== 'overture' || excludedRecords.length === 0) {
    return []
  }

  const examples = excludedRecords.slice(0, 10)
  return [
    {
      action: 'overture_division_geometry_cn_gd_excluded',
      affectedRecordCount: excludedRecords.length,
      evidence: {
        filter: {
          field: 'region',
          equals: 'CN-GD',
        },
        resourceType: plan.resourceType,
        sourceVersion: plan.sourceVersion,
        examples,
        omittedExampleCount: excludedRecords.length - examples.length,
      },
      mode: 'automatic',
      summary:
        'Excluded Guangdong spillover geometry from the Hong Kong Overture release.',
    },
  ]
}
