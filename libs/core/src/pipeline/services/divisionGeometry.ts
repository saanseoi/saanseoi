import type { NewDivisionAreaRow, NewDivisionBoundaryRow } from '@repo/db/currentSchema'
import type {
  NewDivisionAreaVersionRow,
  NewDivisionBoundaryVersionRow,
} from '@repo/db/historySchema'
import type {
  NewSourceDivisionAreaRow,
  NewSourceDivisionBoundaryRow,
} from '@repo/db/sourceSchema'

import type { GeoJsonGeometry } from '../geojson'
import { parseWkbGeometry } from './division'
import { asNonEmptyString, createHash, stableJsonStringify } from '../utils'

export type DivisionGeometryKind = 'divisionArea' | 'divisionBoundary'

type GeometryBase = {
  bbox: unknown
  geometry: GeoJsonGeometry
  id: string
  isLand: boolean | null
  isTerritorial: boolean | null
  sourceKeys: { overture: Record<string, unknown> }
  sources: { overture: unknown } | undefined
  type: 'land' | 'maritime'
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
): NormalizedDivisionArea | null {
  if (row.region === 'CN-GD') {
    return null
  }

  const id = asNonEmptyString(row.id)
  if (!id) {
    throw new Error('Division area row requires a non-empty `id`.')
  }
  const divisionId = asNonEmptyString(row.division_id)
  const geometry = requireGeometry(row.geometry, ['Polygon', 'MultiPolygon'], id)
  const type = resolveGeometryType(row.class, id)

  if (!divisionId) {
    throw new Error('Division area row requires non-empty `id` and `division_id`.')
  }

  const sourceKeys = buildSourceKeys(row)
  const sources = normalizeSources(row.sources)
  const rawProperties = {
    country: row.country ?? null,
    region: row.region ?? null,
    names: row.names ?? null,
    admin_level: row.admin_level ?? null,
    theme: row.theme ?? null,
    type: row.type ?? null,
  }
  const base: GeometryBase = {
    bbox: row.bbox ?? null,
    geometry,
    id,
    isLand: asOptionalBoolean(row.is_land),
    isTerritorial: asOptionalBoolean(row.is_territorial),
    sourceKeys,
    sources,
    type,
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
      rawProperties,
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
): NormalizedDivisionBoundary | null {
  if (row.region === 'CN-GD') {
    return null
  }

  const id = asNonEmptyString(row.id)
  if (!id) {
    throw new Error('Division boundary row requires a non-empty `id`.')
  }
  const divisionIds = normalizeDivisionIds(row.division_ids, id)
  const geometry = requireGeometry(row.geometry, ['LineString', 'MultiLineString'], id)
  const type = resolveGeometryType(row.class, id)

  if (row.perspectives !== null && row.perspectives !== undefined) {
    throw new Error(`Division boundary ${id} contains dropped perspectives data.`)
  }

  const sourceKeys = buildSourceKeys(row)
  const sources = normalizeSources(row.sources)
  const rawProperties = {
    country: row.country ?? null,
    region: row.region ?? null,
    admin_level: row.admin_level ?? null,
    theme: row.theme ?? null,
    type: row.type ?? null,
    is_disputed: row.is_disputed ?? null,
    perspectives: row.perspectives ?? null,
  }
  const base: GeometryBase = {
    bbox: row.bbox ?? null,
    geometry,
    id,
    isLand: asOptionalBoolean(row.is_land),
    isTerritorial: asOptionalBoolean(row.is_territorial),
    sourceKeys,
    sources,
    type,
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
      rawProperties,
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

function buildSourceKeys(row: Record<string, unknown>) {
  return {
    overture: {
      version: asOptionalInteger(row.version),
      subtype: asNonEmptyString(row.subtype),
      class: asNonEmptyString(row.class),
    },
  }
}

function normalizeSources(value: unknown) {
  return Array.isArray(value) && value.length > 0 ? { overture: value } : undefined
}

function resolveGeometryType(value: unknown, id: string): 'land' | 'maritime' {
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
) {
  const geometry = parseWkbGeometry(value)
  if (!geometry || !acceptedTypes.includes(geometry.type)) {
    throw new Error(
      `Division geometry ${id ?? '<unknown>'} has unsupported geometry type ${geometry?.type ?? 'null'}.`,
    )
  }

  return geometry
}

function asOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}
