import { stableJsonStringify } from '@repo/core/pipeline/utils'
import { createHash } from 'node:crypto'
import proj4 from 'proj4'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'
import {
  containmentGeometryHash,
  type ContainmentArea,
} from '@repo/core/pipeline/services/divisions/containmentGeometry'

const hkGrid =
  '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs'
export const geographicCrosswalkPolicy = 'hk-grid-overlap-v1:min-1m2:min-fraction-1e-8'
export type CrosswalkDivision = { id: string; areas: ContainmentArea[] }
export type CrosswalkSelection = {
  geographicReleaseSet: string
  geographicSnapshotId: string
  geographicAreaSnapshotId: string
  sourceReleaseSet: string
  sourceSnapshotId: string
  sourceAreaSnapshotId: string
  sourceDomain: string
  sourceCohort: string
}
const hash = (value: unknown) => {
  const serialised = stableJsonStringify(value)
  if (serialised === null) throw Error('Crosswalk input is not serialisable')
  return `sha256:${createHash('sha256').update(serialised).digest('hex')}`
}

/** Whole-polygon intersection in metres. Boundary-only contact never creates membership. */
export function buildGeographicCrosswalk(
  selection: CrosswalkSelection,
  sources: CrosswalkDivision[],
  targets: CrosswalkDivision[],
) {
  for (const [key, value] of Object.entries(selection))
    if (!value) throw Error(`Missing crosswalk selection: ${key}`)
  const reader = new GeoJSONReader(new GeometryFactory())
  const project = (coordinates: any): any =>
    typeof coordinates[0] === 'number'
      ? proj4('EPSG:4326', hkGrid, coordinates.slice(0, 2))
      : coordinates.map(project)
  function prepare(row: CrosswalkDivision) {
    if (!row.areas.length) throw Error(`No polygon for crosswalk division ${row.id}`)
    const original = UnaryUnionOp.union(
      reader.read({ type: 'GeometryCollection', geometries: row.areas }),
    )
    if (!IsValidOp.isValid(original))
      throw Error(`Invalid WGS84 crosswalk polygon ${row.id}`)
    const parts = row.areas.map(area => ({
      ...area,
      coordinates: project(area.coordinates),
    }))
    if (parts.some(area => !IsValidOp.isValid(reader.read(area))))
      throw Error(`Invalid crosswalk polygon ${row.id}`)
    const geometry = UnaryUnionOp.union(
      reader.read({ type: 'GeometryCollection', geometries: parts }),
    )
    if (!IsValidOp.isValid(geometry) || geometry.isEmpty() || geometry.getArea() <= 0)
      throw Error(`Invalid crosswalk union ${row.id}`)
    return {
      id: row.id,
      geometry,
      original,
      hash: containmentGeometryHash(row.areas),
      area: geometry.getArea() as number,
    }
  }
  const sorted = (rows: CrosswalkDivision[]) => {
    if (new Set(rows.map(r => r.id)).size !== rows.length)
      throw Error('Duplicate crosswalk identity')
    return [...rows].sort((a, b) => a.id.localeCompare(b.id)).map(prepare)
  }
  const sourcePolygons = sorted(sources),
    targetPolygons = sorted(targets)
  const memberships: Array<{
    divisionId: string
    geographicDivisionId: string
    sourceGeometryHash: string
    geographicGeometryHash: string
    overlapSquareMetres: number
    sourceFraction: number
    fullyContained: boolean
  }> = []
  for (const source of sourcePolygons)
    for (const target of targetPolygons) {
      if (
        !source.geometry
          .getEnvelopeInternal()
          .intersects(target.geometry.getEnvelopeInternal())
      )
        continue
      const fullyContained = RelateOp.covers(target.original, source.original)
      if (
        !fullyContained &&
        OverlayOp.intersection(source.original, target.original).getArea() === 0
      )
        continue
      const overlap = fullyContained
        ? source.area
        : OverlayOp.intersection(source.geometry, target.geometry).getArea()
      const fraction = Math.min(1, overlap / source.area)
      if (overlap <= 1 || fraction <= 1e-8) continue
      memberships.push({
        divisionId: source.id,
        geographicDivisionId: target.id,
        sourceGeometryHash: source.hash,
        geographicGeometryHash: target.hash,
        overlapSquareMetres: overlap,
        sourceFraction: fraction,
        fullyContained,
      })
    }
  const inputHashes = {
    sources: sourcePolygons.map(r => [r.id, r.hash]),
    targets: targetPolygons.map(r => [r.id, r.hash]),
  }
  const contentHash = hash({
    selection,
    policy: geographicCrosswalkPolicy,
    inputHashes,
    memberships,
  })
  return {
    ...selection,
    id: hash({ selection, policy: geographicCrosswalkPolicy }),
    policy: geographicCrosswalkPolicy,
    contentHash,
    inputHashes,
    memberships,
  }
}

/** Reapplying the same artefact is harmless; a changed immutable selection is rejected. */
export function geographicCrosswalkStatements(
  result: ReturnType<typeof buildGeographicCrosswalk>,
) {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  const fields = [
    'id',
    'geographicReleaseSet',
    'geographicSnapshotId',
    'geographicAreaSnapshotId',
    'sourceReleaseSet',
    'sourceSnapshotId',
    'sourceAreaSnapshotId',
    'sourceDomain',
    'sourceCohort',
    'policy',
    'contentHash',
  ] as const
  return [
    `INSERT INTO divisionGeographicCrosswalks (${fields.join(',')}) VALUES (${fields.map(k => quote(result[k])).join(',')}) ON CONFLICT(id) DO UPDATE SET contentHash = CASE WHEN divisionGeographicCrosswalks.contentHash = excluded.contentHash THEN excluded.contentHash ELSE NULL END;`,
    ...result.memberships.map(
      row =>
        `INSERT INTO divisionGeographicMemberships(crosswalkId,divisionId,geographicDivisionId,sourceGeometryHash,geographicGeometryHash,overlapSquareMetres,sourceFraction,fullyContained) VALUES (${[result.id, row.divisionId, row.geographicDivisionId, row.sourceGeometryHash, row.geographicGeometryHash].map(quote).join(',')},${row.overlapSquareMetres},${row.sourceFraction},${Number(row.fullyContained)}) ON CONFLICT DO NOTHING;`,
    ),
  ]
}

export function verifyGeographicCrosswalk(
  result: ReturnType<typeof buildGeographicCrosswalk>,
) {
  const {
    geographicReleaseSet,
    geographicSnapshotId,
    geographicAreaSnapshotId,
    sourceReleaseSet,
    sourceSnapshotId,
    sourceAreaSnapshotId,
    sourceDomain,
    sourceCohort,
  } = result
  const selection = {
    geographicReleaseSet,
    geographicSnapshotId,
    geographicAreaSnapshotId,
    sourceReleaseSet,
    sourceSnapshotId,
    sourceAreaSnapshotId,
    sourceDomain,
    sourceCohort,
  }
  if (
    result.policy !== geographicCrosswalkPolicy ||
    result.id !== hash({ selection, policy: result.policy }) ||
    result.contentHash !==
      hash({
        selection,
        policy: result.policy,
        inputHashes: result.inputHashes,
        memberships: result.memberships,
      })
  )
    throw Error('Crosswalk artefact hash or policy mismatch')
}
