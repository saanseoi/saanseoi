import { requireDefined } from '@repo/core/requireDefined'
import { datasetVariantForSource } from '@repo/core'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { createHash } from '@repo/core/pipeline/utils'
import type { NormalisedDivisionArea } from '@repo/core/pipeline/services/divisionGeometry'
import { calculateGeoJsonBbox, type GeoJsonGeometry } from '@repo/core/pipeline/geojson'
import { currentSchema, metaSchema } from '@repo/db'
import { and, desc, eq } from 'drizzle-orm'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import type { resolveLocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import { simplifyPolygonCoverageCached } from '../../geometry/simplifyPolygonCoverage.ts'
import type {
  GeometryUploadPlan,
  NormalisedGeometry,
} from './processLocalDivisionGeometrySqlUploadTypes.ts'
import { decodeStoredGeoJsonGeometry } from './processLocalDivisionGeometrySqlUploadStatistics.ts'
import { HKGOV_DISPLAY_SIMPLIFICATION_TOLERANCE_METRES } from './processLocalDivisionGeometrySqlUploadConfig.ts'

export function normaliseHkgovHadInputRow(
  row: Record<string, unknown>,
  bridge: Map<string, string> | null,
) {
  const areaId = typeof row.area_id === 'string' ? row.area_id.trim() : ''
  const divisionId = areaId ? bridge?.get(areaId) : undefined
  if (!areaId || !divisionId) {
    throw new Error(
      `HAD district area ${areaId || '<unknown>'} has no reviewed administrative identifier bridge.`,
    )
  }
  const sources = normaliseJsonArray(row.sources)
  return {
    ...row,
    id: typeof row.id === 'string' && row.id.trim() ? row.id : `HAD:${areaId}`,
    division_id: divisionId,
    sources: sources?.length ? sources : [{ dataset: 'hkgov-had', areaId }],
  }
}

export function normaliseHkgovCenstatdInputRow(
  row: Record<string, unknown>,
  bridge: Map<string, string> | null,
) {
  const suppliedDivisionId =
    typeof row.division_id === 'string' ? row.division_id.trim() : ''
  if (suppliedDivisionId) {
    return {
      ...row,
      geometry: parseJsonGeometryValue(row.geometry, 'geometry'),
      id:
        typeof row.id === 'string' && row.id.trim()
          ? row.id
          : `CENSTATD:${suppliedDivisionId}`,
      source_geometry: parseJsonGeometryValue(row.source_geometry, 'source_geometry'),
      source_properties: parseJsonValue(row.source_properties, 'source_properties'),
      sources: normaliseJsonArray(row.sources),
      division_id: suppliedDivisionId,
    }
  }
  const districtClass =
    typeof row.district_class === 'string' ? row.district_class.trim() : ''
  const districtCode =
    typeof row.district_code === 'number' || typeof row.district_code === 'string'
      ? String(row.district_code).trim()
      : ''
  const bridgeKey = districtClass || districtCode
  const divisionId = bridgeKey ? bridge?.get(bridgeKey) : undefined
  if (!bridgeKey || !divisionId) {
    throw new Error(
      `C&SD district area ${bridgeKey || '<unknown>'} has no reviewed administrative identifier bridge.`,
    )
  }
  const sources = normaliseJsonArray(row.sources)
  return {
    ...row,
    id: typeof row.id === 'string' && row.id.trim() ? row.id : `CENSTATD:${bridgeKey}`,
    division_id: divisionId,
    sources: sources?.length
      ? sources
      : [
          {
            dataset: 'hkgov-censtatd',
            ...(districtClass ? { districtClass } : { districtCode }),
          },
        ],
  }
}

export function geometryVariant(plan: GeometryUploadPlan) {
  const withTransform = (variant: string) =>
    plan.transform ? `${variant}:${plan.transform}` : variant
  if (
    plan.datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'
  ) {
    return withTransform('hkgov-censtatd-landclipped')
  }
  if (
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district' ||
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district' ||
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district'
  ) {
    return withTransform('hkgov-censtatd')
  }
  if (
    plan.datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
  ) {
    return withTransform('hkgov-censtatd')
  }
  if (
    plan.datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  ) {
    return withTransform('hkgov-censtatd-hma')
  }
  return datasetVariantForSource('divisionArea', plan.source, {
    cohortKey: plan.cohortKey,
    sourceVersion: plan.sourceVersion,
    transform: plan.transform,
  })
}

/**
 * Area simplification is a display derivative. Its division references remain
 * anchored to the exact-source division snapshot, which has no transform
 * suffix.
 */
export function divisionReferenceVariant(plan: GeometryUploadPlan) {
  return geometryVariant({ ...plan, transform: undefined })
}

/**
 * C&SD companion provenance accumulates its contributing source releases, but
 * a lookup only records a division-reference dependency for one materialisation.
 * Carrying that lookup forward turns it into an API input and can combine it
 * with a later release of the same dataset.
 */
export function selectCenstatdInheritedSnapshotSources<
  T extends { role: 'primary' | 'geometry' | 'enrichment' | 'fallback' | 'lookup' },
>(sources: readonly T[]) {
  return sources.filter(source => source.role !== 'lookup')
}

export function isCenstatdGeometryCompanionPlan(plan: GeometryUploadPlan) {
  return (
    plan.source === 'hkgov-censtatd' &&
    plan.type === 'divisionArea' &&
    ['hkgov-censtatd', 'hkgov-censtatd:simplified'].includes(geometryVariant(plan))
  )
}

/**
 * Returns a C&SD companion snapshot only when every canonical geometry record
 * in this source release has already been materialised for the same cohort.
 * Source records remain independent; this avoids mistaking a
 * source-level archive match for an identical geometry snapshot.
 */
export async function findIdenticalCenstatdGeometrySnapshot(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  rows: readonly NonNullable<NormalisedGeometry>[],
) {
  if (rows.length === 0) return null

  const candidates = await metaDb
    .select({
      cohortKey: metaSchema.metaSnapshots.cohortKey,
      id: metaSchema.metaSnapshots.id,
      parentSnapshotId: metaSchema.metaSnapshots.parentSnapshotId,
      resourceType: metaSchema.metaSnapshots.resourceType,
      snapshotLineageId: metaSchema.metaSnapshots.snapshotLineageId,
      status: metaSchema.metaSnapshots.status,
    })
    .from(metaSchema.metaSnapshots)
    .innerJoin(
      metaSchema.metaSnapshotLineages,
      eq(
        metaSchema.metaSnapshots.snapshotLineageId,
        metaSchema.metaSnapshotLineages.id,
      ),
    )
    .where(
      and(
        eq(metaSchema.metaSnapshots.resourceType, plan.type),
        eq(metaSchema.metaSnapshots.cohortKey, plan.cohortKey),
        eq(metaSchema.metaSnapshotLineages.regionCode, plan.regionCode),
        eq(metaSchema.metaSnapshotLineages.variant, geometryVariant(plan)),
      ),
    )
    .orderBy(desc(metaSchema.metaSnapshots.revision))
    .all()
  const expected = await Promise.all(
    rows.map(async row => ({
      hash: await hashGeometryMaterialisation(row.canonical),
      id: row.canonical.id,
    })),
  )

  for (const candidate of candidates) {
    if (candidate.status === 'archived') continue
    const materialisedRows =
      plan.type === 'divisionArea'
        ? await currentDb
            .select()
            .from(currentSchema.divisionAreas)
            .where(eq(currentSchema.divisionAreas.snapshotId, candidate.id))
            .all()
        : await currentDb
            .select()
            .from(currentSchema.divisionBoundaries)
            .where(eq(currentSchema.divisionBoundaries.snapshotId, candidate.id))
            .all()
    const actual = await Promise.all(
      materialisedRows.map(async row => ({
        hash: await hashGeometryMaterialisation({
          ...row,
          geometry: decodeStoredGeoJsonGeometry(row.geometry),
        }),
        id: row.id,
      })),
    )
    if (hasIdenticalGeometryMaterialisation(expected, actual)) return candidate
  }
  return null
}

/**
 * Hashes only materialised geometry semantics. Publisher source records and
 * derived bounding boxes are intentionally excluded: those can differ without
 * changing the geometry snapshot selected by the Divisions API.
 */
async function hashGeometryMaterialisation(row: Record<string, unknown>) {
  return createHash({
    divisionId: row.divisionId,
    geometry: row.geometry,
    id: row.id,
    isLand: row.isLand,
    isTerritorial: row.isTerritorial,
    leftDivisionId: row.leftDivisionId,
    rightDivisionId: row.rightDivisionId,
    type: row.type,
  })
}

export function hasIdenticalGeometryMaterialisation(
  expected: readonly { hash: string; id: string }[],
  actual: readonly { hash: string; id: string }[],
) {
  const expectedHashes = new Map(expected.map(row => [row.id, row.hash]))
  if (expectedHashes.size !== expected.length) return false
  const actualHashes = new Map(actual.map(row => [row.id, row.hash]))
  if (actualHashes.size !== actual.length) return false
  return [...expectedHashes].every(([id, hash]) => actualHashes.get(id) === hash)
}

export function isCenstatdPermanentLivingQuartersPlan(plan: GeometryUploadPlan) {
  return (
    plan.source === 'hkgov-censtatd' &&
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
  )
}

export function resolveProviderBridgeConfig(plan: GeometryUploadPlan) {
  if (plan.source === 'hkgov-had') {
    return { authority: 'hkgov-had' }
  }
  if (
    plan.source === 'hkgov-censtatd' &&
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'
  ) {
    return { authority: 'hkgov-censtatd', cohortKey: plan.cohortKey }
  }
  if (
    plan.source === 'hkgov-censtatd' &&
    (plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district' ||
      plan.datasetCode ===
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district' ||
      plan.datasetCode ===
        'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district')
  ) {
    // The reviewed 2021 C&SD-to-canonical bridge has the same district
    // identifiers as the annual and PLQ publications. It is deliberately an
    // identity bridge, not a source record that their geometries are the 2021
    // land-clipped geometry.
    return { authority: 'hkgov-censtatd', cohortKey: '2021' }
  }
  return null
}

export function normaliseHkgovPlandNewTownInputRow(row: Record<string, unknown>) {
  const newTownId = typeof row.newtown_id === 'string' ? row.newtown_id.trim() : ''
  const divisionId = typeof row.division_id === 'string' ? row.division_id.trim() : ''
  if (!newTownId || !divisionId) {
    throw new Error(
      `Planning Department New Town ${newTownId || '<unknown>'} has no cohort-scoped planning division ID.`,
    )
  }
  const sources = normaliseJsonArray(row.sources)
  return {
    ...row,
    id:
      typeof row.id === 'string' && row.id.trim()
        ? row.id
        : `PLAND:NEWTOWN:${divisionId}`,
    division_id: divisionId,
    sources: sources?.length
      ? sources
      : [{ dataset: 'hkgov-pland-new-town', newTownId }],
  }
}

function normaliseJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseJsonValue(value: unknown, field: string): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`C&SD ${field} must be valid JSON.`)
  }
}

function parseJsonGeometryValue(value: unknown, field: string) {
  const parsed = parseJsonValue(value, field)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`C&SD ${field} must be a GeoJSON geometry.`)
  }
  return parsed
}

/**
 * Produces the shared map-display representation for every Hong Kong Government
 * area publisher. Exact publisher geometry remains in the source record and
 * in the exact snapshot; this pass only writes the named display snapshot.
 */
export async function simplifyHkgovDivisionAreas(rows: NormalisedDivisionArea[]) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const simplified = await simplifyPolygonCoverageCached(
    rows.map(row => requireAreaGeometry(row.canonical.geometry, row.canonical.id)),
    HKGOV_DISPLAY_SIMPLIFICATION_TOLERANCE_METRES,
  )

  return rows.map((row, index) => {
    const geometry = requireAreaGeometry(
      requireDefined(simplified.geometries[index]),
      row.canonical.id,
    )
    const parsed = reader.read(geometry)
    if (!IsValidOp.isValid(parsed)) {
      const error = new IsValidOp(parsed).getValidationError()
      throw new Error(
        `Shapely coverage simplification produced invalid geometry for ${row.canonical.id}: ${error?.getMessage() ?? 'unknown validation error'}.`,
      )
    }
    return {
      ...row,
      canonical: {
        ...row.canonical,
        bbox: calculateGeoJsonBbox(geometry),
        geometry,
      },
      source: {
        ...row.source,
        derivation: {
          inputGeometryProjection: 'EPSG:4326',
          method: 'topology-preserving-simplification',
          toleranceMetres: HKGOV_DISPLAY_SIMPLIFICATION_TOLERANCE_METRES,
          workingProjection: 'wgs84-interface-local-equirectangular',
          sharedBoundaryPolicy: 'geos-coverage-simplification',
          engine: simplified.engine,
          engineVersion: simplified.engineVersion,
          ...(simplified.inputValidationRepairIndexes.includes(index)
            ? { inputValidationRepair: 'make-valid' }
            : {}),
        },
      },
    }
  })
}

function requireAreaGeometry(value: unknown, id: string): GeoJsonGeometry {
  if (
    !value ||
    typeof value !== 'object' ||
    !('type' in value) ||
    ((value as { type?: unknown }).type !== 'Polygon' &&
      (value as { type?: unknown }).type !== 'MultiPolygon')
  ) {
    throw new Error(`Display simplification did not produce an area for ${id}.`)
  }
  return value as GeoJsonGeometry
}

export function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function asOptionalInteger(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value !== 'string' || !/^-?\d+(?:\.0+)?$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function requireInteger(value: unknown, name: string) {
  const integer = asOptionalInteger(value)
  if (integer === null) throw new Error(`Missing ${name}.`)
  return integer
}

export function isString(value: string | null): value is string {
  return value !== null
}

export function requireString(value: unknown, name: string) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`Missing ${name}.`)
  return value
}
