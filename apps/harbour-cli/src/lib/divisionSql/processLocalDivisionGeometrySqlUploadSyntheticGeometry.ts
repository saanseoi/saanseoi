import { resolvePublishedSnapshotForResourceTypeRegionCohortKey } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import {
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
} from '@repo/core/pipeline/services/divisionGeometry'
import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'
import { currentSchema } from '@repo/db'
import { and, eq } from 'drizzle-orm'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import type Geometry from 'jsts/org/locationtech/jts/geom/Geometry.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import UnionOp from 'jsts/org/locationtech/jts/operation/union/UnionOp.js'
import type { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'
import {
  overtureHongKongAreaDivisionId,
  overtureHongKongAreas,
} from '@repo/core/pipeline/services/overtureHongKongAreas'
import type {
  GeometryUploadPlan,
  NormalisedGeometry,
} from './processLocalDivisionGeometrySqlUploadTypes.ts'
import { isString } from './processLocalDivisionGeometrySqlUploadPreparation.ts'

type SyntheticOvertureHongKongArea = {
  code: string
  districtDivisionIds: string[]
  divisionId: string
}

const SHENZHEN_BAY_PORT_EXCLUSION = {
  coordinates: [
    [
      [113.935, 22.485],
      [113.96, 22.485],
      [113.96, 22.51],
      [113.935, 22.51],
      [113.935, 22.485],
    ],
  ],
  type: 'Polygon',
} as const satisfies GeoJsonGeometry

export async function resolveSyntheticOvertureHongKongAreas(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
): Promise<SyntheticOvertureHongKongArea[]> {
  if (plan.source !== 'overture' || plan.regionCode !== 'hk') return []
  const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    metaDb,
    'division',
    plan.regionCode,
    plan.cohortKey,
    { variant: 'overture' },
  )
  if (!snapshot) return []
  const rows = await currentDb
    .select({
      id: currentSchema.divisions.id,
      identifiers: currentSchema.divisions.identifiers,
      level: currentSchema.divisions.level,
    })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshot.id))
    .all()
  const i18nRows = await currentDb
    .select({
      divisionId: currentSchema.divisionsI18n.divisionId,
      name: currentSchema.divisionsI18n.name,
    })
    .from(currentSchema.divisionsI18n)
    .where(
      and(
        eq(currentSchema.divisionsI18n.snapshotId, snapshot.id),
        eq(currentSchema.divisionsI18n.locale, 'en'),
      ),
    )
    .all()
  const byId = new Map(rows.map(row => [row.id, row]))
  const districtIds = new Set(rows.filter(row => row.level === 2).map(row => row.id))
  const districtIdsByName = new Map<string, string[]>()
  for (const row of i18nRows) {
    if (!row.name || !districtIds.has(row.divisionId)) continue
    const ids = districtIdsByName.get(row.name) ?? []
    ids.push(row.divisionId)
    districtIdsByName.set(row.name, ids)
  }
  return overtureHongKongAreas.flatMap(area => {
    const divisionId = overtureHongKongAreaDivisionId(area.code)
    if (!divisionId) return []
    const division = byId.get(divisionId)
    if (!division) return []
    const identifiers = division.identifiers
    const correction =
      identifiers && typeof identifiers === 'object' && !Array.isArray(identifiers)
        ? (identifiers as Record<string, unknown>).saanseoiCorrection
        : null
    const correctionDistrictIds =
      correction && typeof correction === 'object' && !Array.isArray(correction)
        ? (correction as Record<string, unknown>).districtDivisionIds
        : null
    const districtDivisionIds =
      Array.isArray(correctionDistrictIds) && correctionDistrictIds.every(isString)
        ? correctionDistrictIds
        : area.districtNames.map(name => {
            const ids = districtIdsByName.get(name) ?? []
            if (ids.length !== 1) {
              throw new Error(
                `Cannot derive Overture ${area.code} geometry: expected one English district named ${name}, found ${ids.length}.`,
              )
            }
            return ids[0]!
          })
    return [
      {
        code: area.code,
        districtDivisionIds,
        divisionId,
      },
    ]
  })
}

export function selectOvertureHongKongAreasWithoutSourceGeometry(
  areas: readonly SyntheticOvertureHongKongArea[],
  normalised: readonly NonNullable<NormalisedGeometry>[],
) {
  const sourceAreaDivisionIds = new Set(
    normalised.flatMap(row =>
      'divisionId' in row.canonical ? [row.canonical.divisionId] : [],
    ),
  )
  return areas.filter(area => !sourceAreaDivisionIds.has(area.divisionId))
}

export function buildSyntheticOvertureHongKongAreaRows(
  areas: readonly SyntheticOvertureHongKongArea[],
  normalised: readonly NonNullable<NormalisedGeometry>[],
) {
  return areas.map(area => {
    const geometries = normalised.flatMap(row => {
      if (!('divisionId' in row.canonical)) return []
      if (!isGeoJsonPolygon(row.canonical.geometry)) {
        throw new Error(
          `Overture district ${row.canonical.divisionId} is not polygonal.`,
        )
      }
      return area.districtDivisionIds.includes(row.canonical.divisionId) &&
        row.canonical.isLand === true
        ? [row.canonical.geometry]
        : []
    })
    if (geometries.length !== area.districtDivisionIds.length) {
      throw new Error(
        `Cannot synthesise ${area.code}: expected ${area.districtDivisionIds.length} district land geometries, found ${geometries.length}.`,
      )
    }
    const normalisedArea = normaliseDivisionAreaGeometryRow(
      syntheticOvertureHongKongAreaSourceRow(
        area,
        unionHongKongAreaGeometries(geometries),
      ),
      'overture',
      { variant: 'overture' },
    )
    if (!normalisedArea)
      throw new Error(`Failed to normalise synthetic ${area.code} area.`)
    return normalisedArea
  })
}

async function buildSyntheticOvertureHongKongBoundaryRows(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  areas: readonly SyntheticOvertureHongKongArea[],
) {
  const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    metaDb,
    'divisionArea',
    plan.regionCode,
    plan.cohortKey,
    { variant: 'overture' },
  )
  if (!snapshot) {
    throw new Error(
      `Cannot synthesise Overture boundaries: no published Overture divisionArea snapshot exists for ${plan.cohortKey}.`,
    )
  }
  const rows = await currentDb
    .select({
      divisionId: currentSchema.divisionAreas.divisionId,
      geometry: currentSchema.divisionAreas.geometry,
    })
    .from(currentSchema.divisionAreas)
    .where(eq(currentSchema.divisionAreas.snapshotId, snapshot.id))
    .all()
  const geometryByDivisionId = new Map(rows.map(row => [row.divisionId, row.geometry]))
  return areas.map(area => {
    const areaGeometry = geometryByDivisionId.get(area.divisionId)
    if (!isGeoJsonPolygon(areaGeometry)) {
      throw new Error(
        `Cannot synthesise ${area.code} boundary: its synthetic divisionArea is absent.`,
      )
    }
    const boundary = geoJsonBoundary(areaGeometry)
    const normalisedBoundary = normaliseDivisionBoundaryGeometryRow(
      {
        class: 'land',
        division_ids: [area.divisionId, 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d'],
        geometry: boundary,
        id: `SAANSEOI:OVERTURE:HK:AREA:${area.code}:boundary`,
        is_land: true,
        is_territorial: false,
        perspectives: null,
        sources: [
          {
            dataset: 'SaanSeoi corrective processing',
            property: 'synthetic:boundary-from-unioned-overture-district-areas',
            record_id: `overture:hk:area:${area.code}`,
          },
        ],
      },
      'overture',
      { variant: 'overture' },
    )
    if (!normalisedBoundary) {
      throw new Error(`Failed to normalise synthetic ${area.code} boundary.`)
    }
    return normalisedBoundary
  })
}

function syntheticOvertureHongKongAreaSourceRow(
  area: SyntheticOvertureHongKongArea,
  geometry: GeoJsonGeometry,
) {
  return {
    class: 'land',
    division_id: area.divisionId,
    geometry,
    id: `SAANSEOI:OVERTURE:HK:AREA:${area.code}`,
    is_land: true,
    is_territorial: false,
    sources: [
      {
        dataset: 'SaanSeoi corrective processing',
        property: 'synthetic:union-overture-district-areas',
        record_id: `overture:hk:area:${area.code}`,
      },
    ],
  }
}

function unionHongKongAreaGeometries(geometries: readonly GeoJsonGeometry[]) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const writer = new GeoJSONWriter()
  const unioned = unionBalanced(
    geometries
      .map(geometry => reader.read(JSON.stringify(geometry)))
      .sort((left, right) =>
        left.getEnvelopeInternal().compareTo(right.getEnvelopeInternal()),
      ),
  )
  const corrected = OverlayOp.difference(
    unioned,
    reader.read(JSON.stringify(SHENZHEN_BAY_PORT_EXCLUSION)),
  )
  const geometry = writer.write(corrected) as GeoJsonGeometry
  if (!isGeoJsonPolygon(geometry)) {
    throw new Error('Synthetic Overture Hong Kong area union is not polygonal.')
  }
  return geometry
}

function geoJsonBoundary(geometry: GeoJsonGeometry) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const writer = new GeoJSONWriter()
  const boundary = writer.write(
    reader.read(JSON.stringify(geometry)).getBoundary(),
  ) as GeoJsonGeometry
  if (boundary.type !== 'LineString' && boundary.type !== 'MultiLineString') {
    throw new Error('Synthetic Overture Hong Kong area boundary is not linear.')
  }
  return boundary
}

function unionBalanced(geometries: Geometry[]) {
  if (geometries.length === 0) throw new Error('Cannot union empty Overture geometry.')
  let current = geometries
  while (current.length > 1) {
    const next: Geometry[] = []
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index]
      if (!left) throw new Error('Overture geometry union lost its left operand.')
      const right = current[index + 1]
      next.push(right ? UnionOp.union(left, right) : left)
    }
    current = next
  }
  const result = current[0]
  if (!result) throw new Error('Overture geometry union has no result.')
  return result
}

export function isGeoJsonPolygon(value: unknown): value is GeoJsonGeometry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    ((value as GeoJsonGeometry).type === 'Polygon' ||
      (value as GeoJsonGeometry).type === 'MultiPolygon')
  )
}

/**
 * Records `overture_hong_kong_area_synthesised`; keep the policy and this
 * implementation in sync.
 */
export function buildSyntheticOvertureHongKongAreaProcessingActions(
  plan: GeometryUploadPlan,
  areas: readonly SyntheticOvertureHongKongArea[],
): ReleaseProcessingAction[] {
  if (plan.source !== 'overture' || areas.length === 0) return []
  return areas.map(area => ({
    action: 'overture_hong_kong_area_synthesised',
    affectedRecordCount: 1,
    evidence: {
      area: area.code,
      districtDivisionIds: area.districtDivisionIds,
      geometryRule: {
        include: 'Lok Ma Chau Loop',
        exclude: 'Shenzhen Bay Port border-crossing enclave',
        exclusionBbox: [113.935, 22.485, 113.96, 22.51],
        method: 'union-district-land-geometries-then-difference-exclusion-bbox',
      },
      resourceType: plan.type,
      sourceVersion: plan.sourceVersion,
      syntheticDivisionId: area.divisionId,
    },
    mode: 'automatic',
    summary: `Derived Overture Hong Kong ${area.code} area geometry from its district geometries.`,
  }))
}
