import type { NewDivisionAreaRow, NewDivisionBoundaryRow } from '@repo/db/currentSchema'
import type {
  NewSourceDivisionAreaRow,
  NewSourceDivisionBoundaryRow,
} from '@repo/db/sourceSchema'

import type { GeoJsonGeometry, GeoJsonPosition } from '../geojson'
import { parseWkbGeometry } from './division'
import { asNonEmptyString, createHash, stableJsonStringify } from '../utils'
import { isReferentOnlyDivisionId } from './divisionFixtures'

export type DivisionGeometryKind = 'divisionArea' | 'divisionBoundary'

export type GeometryNormalizationOptions = {
  validateGeometry?: boolean
  variant?: string
}

type GeometryBase = {
  bbox: unknown
  geometry: GeoJsonGeometry
  id: string
  isLand: boolean | null
  isTerritorial: boolean | null
  sourceKeys: Record<string, Record<string, unknown>>
  sources: Record<string, unknown> | undefined
  type: 'land' | 'maritime' | 'mixed'
  variant: string
}

export type NormalizedDivisionArea = {
  canonical: Omit<NewDivisionAreaRow, 'snapshotId' | 'createdAt' | 'updatedAt'>
  source: Omit<
    NewSourceDivisionAreaRow,
    | 'versionHash'
    | 'releaseId'
    | 'validFromRelease'
    | 'validToRelease'
    | 'isCurrent'
    | 'createdAt'
    | 'updatedAt'
  >
}

export type NormalizedDivisionBoundary = {
  canonical: Omit<NewDivisionBoundaryRow, 'snapshotId' | 'createdAt' | 'updatedAt'>
  source: Omit<
    NewSourceDivisionBoundaryRow,
    | 'versionHash'
    | 'releaseId'
    | 'validFromRelease'
    | 'validToRelease'
    | 'isCurrent'
    | 'createdAt'
    | 'updatedAt'
  >
}

export function normalizeDivisionAreaGeometryRow(
  row: Record<string, unknown>,
  source = 'overture',
  options: GeometryNormalizationOptions = {},
): NormalizedDivisionArea | null {
  if (row.region === 'CN-GD') {
    return null
  }

  const id = asNonEmptyString(row.id)
  if (!id) {
    throw new Error('Division area row requires a non-empty `id`.')
  }
  const divisionId = asNonEmptyString(row.division_id)
  if (isReferentOnlyDivisionId(divisionId)) {
    return null
  }
  const geometry = requireGeometry(
    row.geometry,
    ['Polygon', 'MultiPolygon'],
    id,
    options.validateGeometry,
  )
  const isLand =
    source === 'hkgov-had' ||
    source === 'hkgov-censtatd' ||
    source === 'hkgov-pland-pu' ||
    source === 'hkgov-pland-new-town'
      ? true
      : asOptionalBoolean(row.is_land)
  const isTerritorial =
    source === 'hkgov-had' ||
    source === 'hkgov-censtatd' ||
    source === 'hkgov-pland-pu' ||
    source === 'hkgov-pland-new-town'
      ? true
      : asOptionalBoolean(row.is_territorial)
  const type = resolveGeometryType(row.class, id, { isLand, isTerritorial })

  if (!divisionId) {
    throw new Error('Division area row requires non-empty `id` and `division_id`.')
  }

  const sourceKeys = buildSourceKeys(row, source)
  const sources = normalizeSources(row.sources, source)
  const base: GeometryBase = {
    bbox: row.bbox ?? null,
    geometry,
    id,
    isLand,
    isTerritorial,
    sourceKeys,
    sources,
    type,
    variant: options.variant ?? source,
  }

  return {
    canonical: {
      ...base,
      divisionId,
    },
    source: {
      bbox: row.bbox ?? null,
      divisionId,
      geometry,
      isLand: base.isLand,
      isTerritorial: base.isTerritorial,
      rawProperties: { ...row },
      sources: Array.isArray(row.sources) ? row.sources : null,
      sourceRecordId: id,
      subtype: asNonEmptyString(row.subtype),
      class: asNonEmptyString(row.class),
      version: asOptionalInteger(row.version),
    },
  }
}

export function normalizeDivisionBoundaryGeometryRow(
  row: Record<string, unknown>,
  source = 'overture',
  options: GeometryNormalizationOptions = {},
): NormalizedDivisionBoundary | null {
  if (row.region === 'CN-GD') {
    return null
  }

  const id = asNonEmptyString(row.id)
  if (!id) {
    throw new Error('Division boundary row requires a non-empty `id`.')
  }
  const divisionIds = normalizeDivisionIds(row.division_ids, id)
  const geometry = requireGeometry(
    row.geometry,
    ['LineString', 'MultiLineString'],
    id,
    options.validateGeometry,
  )
  const isLand = asOptionalBoolean(row.is_land)
  const isTerritorial = asOptionalBoolean(row.is_territorial)
  const type = resolveGeometryType(row.class, id, { isLand, isTerritorial })

  if (row.perspectives !== null && row.perspectives !== undefined) {
    throw new Error(`Division boundary ${id} contains dropped perspectives data.`)
  }

  const sourceKeys = buildSourceKeys(row, source)
  const sources = normalizeSources(row.sources, source)
  const base: GeometryBase = {
    bbox: row.bbox ?? null,
    geometry,
    id,
    isLand,
    isTerritorial,
    sourceKeys,
    sources,
    type,
    variant: options.variant ?? source,
  }

  return {
    canonical: {
      ...base,
      leftDivisionId: divisionIds[0],
      rightDivisionId: divisionIds[1],
    },
    source: {
      bbox: row.bbox ?? null,
      divisionIds,
      geometry,
      isLand: base.isLand,
      isTerritorial: base.isTerritorial,
      rawProperties: { ...row },
      sources: Array.isArray(row.sources) ? row.sources : null,
      sourceRecordId: id,
      subtype: asNonEmptyString(row.subtype),
      class: asNonEmptyString(row.class),
      version: asOptionalInteger(row.version),
    },
  }
}

export function buildDivisionGeometryHashInput(
  row: NormalizedDivisionArea['canonical'] | NormalizedDivisionBoundary['canonical'],
) {
  return {
    ...row,
    createdAt: undefined,
    snapshotId: undefined,
    updatedAt: undefined,
  }
}

export function hashDivisionGeometryRow(
  row: NormalizedDivisionArea['canonical'] | NormalizedDivisionBoundary['canonical'],
) {
  return createHash(stableJsonStringify(buildDivisionGeometryHashInput(row)))
}

export function hashDivisionGeometrySourceRow(
  row: NormalizedDivisionArea['source'] | NormalizedDivisionBoundary['source'],
) {
  return createHash(stableJsonStringify(row))
}

function buildSourceKeys(
  row: Record<string, unknown>,
  source: string,
): Record<string, Record<string, unknown>> {
  if (source === 'hkgov-had') {
    return {
      hkgov: {
        objectId: asOptionalInteger(row.object_id),
        cdsiAdminAreaId: asOptionalInteger(row.csdi_admin_area_id),
        areaType: asNonEmptyString(row.area_type),
        areaId: asNonEmptyString(row.area_id),
        areaCode: asNonEmptyString(row.area_code),
      },
    }
  }

  if (source === 'hkgov-pland-pu') {
    return {
      hkgovPland: {
        planningLevel: asNonEmptyString(row.planning_level),
        ppu: asNonEmptyString(readIdentifier(row.identifiers, 'PLAND:PPU')),
        spu: asNonEmptyString(readIdentifier(row.identifiers, 'PLAND:SPU')),
        tpu: asNonEmptyString(readIdentifier(row.identifiers, 'PLAND:TPU')),
        subunit: asNonEmptyString(readIdentifier(row.identifiers, 'PLAND:SUBUNIT')),
      },
    }
  }

  if (source === 'hkgov-censtatd') {
    return {
      hkgovCenstatd: {
        class: asNonEmptyString(row.district_class),
        code: asOptionalInteger(row.district_code),
      },
    }
  }

  if (source === 'hkgov-pland-new-town') {
    return {
      hkgovPlandNewTown: {
        id: asNonEmptyString(row.newtown_id),
        name: asNonEmptyString(readIdentifier(row.identifiers, 'PLAND:NEWTOWN')),
      },
    }
  }

  return {
    overture: {
      version: asOptionalInteger(row.version),
      subtype: asNonEmptyString(row.subtype),
      class: asNonEmptyString(row.class),
    },
  }
}

function normalizeSources(value: unknown, source: string) {
  return Array.isArray(value) && value.length > 0
    ? {
        [source === 'hkgov-had'
          ? 'hkgovHad'
          : source === 'hkgov-censtatd'
            ? 'hkgovCenstatd'
            : source === 'hkgov-pland-pu'
              ? 'hkgovPland'
              : source === 'hkgov-pland-new-town'
                ? 'hkgovPlandNewTown'
                : 'overture']: value,
      }
    : undefined
}

function readIdentifier(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return (value as Record<string, unknown>)[key]
}

function resolveGeometryType(
  value: unknown,
  id: string,
  flags: { isLand: boolean | null; isTerritorial: boolean | null },
): 'land' | 'maritime' | 'mixed' {
  if (flags.isLand === true && flags.isTerritorial === true) {
    return 'mixed'
  }

  if (value === 'land' || value === 'maritime') {
    return value
  }

  throw new Error(`Division geometry ${id} has unsupported class ${String(value)}.`)
}

function normalizeDivisionIds(value: unknown, id: string): [string, string] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`Division boundary ${id} must contain exactly two division IDs.`)
  }

  const ids = value.map(entry => asNonEmptyString(entry))
  if (!ids[0] || !ids[1] || ids[0] === ids[1]) {
    throw new Error(`Division boundary ${id} must contain two distinct division IDs.`)
  }

  return [ids[0], ids[1]]
}

function requireGeometry(
  value: unknown,
  acceptedTypes: GeoJsonGeometry['type'][],
  id: string | null,
  validateGeometry = false,
) {
  const geometry = parseWkbGeometry(value)
  if (!geometry || !acceptedTypes.includes(geometry.type)) {
    throw new Error(
      `Division geometry ${id ?? '<unknown>'} has unsupported geometry type ${geometry?.type ?? 'null'}.`,
    )
  }

  if (validateGeometry) {
    assertValidGeometry(geometry, id)
  }

  return geometry
}

function assertValidGeometry(geometry: GeoJsonGeometry, id: string | null) {
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    const lines: GeoJsonPosition[][] =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : (geometry as { coordinates: GeoJsonPosition[][] }).coordinates
    for (const line of lines) {
      if (line.length < 2 || line.some(position => !position.every(Number.isFinite))) {
        throw new Error(
          `Division geometry ${id ?? '<unknown>'} contains an empty or invalid line.`,
        )
      }
    }
    return
  }

  const polygons: GeoJsonPosition[][][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : (geometry as { coordinates: GeoJsonPosition[][][] }).coordinates
  for (const polygon of polygons) {
    if (polygon.length === 0) {
      throw new Error(
        `Division geometry ${id ?? '<unknown>'} contains an empty polygon.`,
      )
    }
    for (const ring of polygon) {
      if (ring.length < 4 || !samePosition(ring[0], ring.at(-1))) {
        throw new Error(
          `Division geometry ${id ?? '<unknown>'} contains an invalid ring.`,
        )
      }
      if (
        ring.some(position => !position.every(Number.isFinite)) ||
        ringArea(ring) === 0
      ) {
        throw new Error(
          `Division geometry ${id ?? '<unknown>'} contains a degenerate ring.`,
        )
      }
      for (let first = 0; first < ring.length - 1; first += 1) {
        for (let second = first + 1; second < ring.length - 1; second += 1) {
          if (second <= first + 1 || (first === 0 && second === ring.length - 2))
            continue
          const firstStart = ring[first]
          const firstEnd = ring[first + 1]
          const secondStart = ring[second]
          const secondEnd = ring[second + 1]
          if (!firstStart || !firstEnd || !secondStart || !secondEnd) continue
          if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
            throw new Error(
              `Division geometry ${id ?? '<unknown>'} contains a self-intersecting ring.`,
            )
          }
        }
      }
    }
  }
}

function samePosition(
  left: GeoJsonPosition | undefined,
  right: GeoJsonPosition | undefined,
) {
  return Boolean(left && right && left[0] === right[0] && left[1] === right[1])
}

function ringArea(ring: GeoJsonPosition[]) {
  let area = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += (ring[index]?.[0] ?? 0) * (ring[index + 1]?.[1] ?? 0)
    area -= (ring[index + 1]?.[0] ?? 0) * (ring[index]?.[1] ?? 0)
  }
  return Math.abs(area / 2)
}

function segmentsIntersect(
  a: GeoJsonPosition,
  b: GeoJsonPosition,
  c: GeoJsonPosition,
  d: GeoJsonPosition,
) {
  const orientation = (p: GeoJsonPosition, q: GeoJsonPosition, r: GeoJsonPosition) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  return abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0
}

function asOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}
