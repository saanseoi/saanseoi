import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import UnionOp from 'jsts/org/locationtech/jts/operation/union/UnionOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import { buildDeterministicUuidV5, canonicalGeneratedId } from '@repo/db'
import { overtureHongKongAreas } from '@repo/core/pipeline/services/divisions/overtureHongKongAreas'
import { reviewAreaBounds } from '@repo/core/pipeline/services/divisions/geographicReview'
import type { Polygon, MultiPolygon } from 'geojson'

type Row = Record<string, any>
type Shape = Polygon | MultiPolygon
const object = (value: any): any =>
  typeof value === 'string' ? JSON.parse(value) : value
const namespace = '7a3c5e91-95c2-5c93-8e3c-7d5b5d3bb6e7'
export const isAdministrativeDivision = (row: Row) =>
  ['sar', 'area', 'district'].includes(row.class)

/** Territorial geometry is independent of curated neighbourhood drawing overrides. */
export function buildAdministrativeAreas(input: {
  divisions: Row[]
  names: Row[]
  overture: Row[]
  land: Row[]
  overtureRelease: string
  landRelease: string
}) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const writer = new GeoJSONWriter()
  const read = (value: unknown) => {
    const shape = object(value)
    if (!shape || !['Polygon', 'MultiPolygon'].includes(shape.type))
      throw Error('Administrative geometry must be polygonal.')
    const geometry = reader.read(shape)
    if (!IsValidOp.isValid(geometry))
      throw Error('Invalid administrative source polygon.')
    return geometry
  }
  const polygonOnly = (geometry: any) => {
    const polygons = (shape: any): number[][][][] =>
      shape.type === 'Polygon'
        ? [shape.coordinates]
        : shape.type === 'MultiPolygon'
          ? shape.coordinates
          : shape.type === 'GeometryCollection'
            ? shape.geometries.flatMap(polygons)
            : []
    return reader.read({
      type: 'MultiPolygon',
      coordinates: polygons(writer.write(geometry)),
    })
  }
  const union = (shapes: any[]) => {
    if (!shapes.length) throw Error('Missing administrative geometry.')
    let pending = shapes
    while (pending.length > 1) {
      const next = []
      for (let i = 0; i < pending.length; i += 2)
        next.push(
          pending[i + 1] ? UnionOp.union(pending[i], pending[i + 1]) : pending[i],
        )
      pending = next
    }
    return pending[0]!
  }
  const admin = input.divisions.filter(isAdministrativeDivision)
  const byName = new Map(
    input.names
      .filter(row => row.locale === 'en')
      .map(row => [row.name, row.divisionId]),
  )
  const native: Row[] = input.overture.map(row => ({
    ...row,
    properties: object(row.properties),
  }))
  const land = input.land
    .filter(row => object(row.properties)?.kind === 'coastline-land')
    .map(row => ({ id: row.sourceRecordId, geometry: read(row.sourceGeometry) }))
  if (!land.length) throw Error('Pinned Protomaps release has no coastline land mask.')
  const territories = new Map<
    string,
    { geometry: any; sourceIds: string[]; isLand: boolean }
  >()
  for (const division of admin.filter(row => row.class !== 'area')) {
    const rows = native.filter(
      row =>
        row.properties.divisionId === division.id &&
        row.properties.isTerritorial === true,
    )
    if (!rows.length)
      throw Error(`Missing Overture territorial geometry for ${division.id}`)
    territories.set(division.id, {
      geometry: union(rows.map(row => read(row.sourceGeometry))),
      sourceIds: rows.map(row => row.sourceRecordId).sort(),
      isLand: rows.every(row => row.properties.isLand === true),
    })
  }
  for (const division of admin.filter(row => row.class === 'area')) {
    const definition = overtureHongKongAreas.find(
      area => byName.get(area.names.en) === division.id,
    )
    if (!definition) throw Error(`Unknown administrative Area ${division.id}`)
    const members = definition.districtNames.map(name => {
      const member = territories.get(byName.get(name) ?? '')
      if (!member) throw Error(`Missing Overture territorial district ${name}`)
      return member
    })
    territories.set(division.id, {
      geometry: union(members.map(row => row.geometry)),
      sourceIds: members.flatMap(row => row.sourceIds).sort(),
      isLand: members.every(row => row.isLand),
    })
  }
  return admin.flatMap(division => {
    const territorial = territories.get(division.id)!
    const hits = land
      .filter(row =>
        territorial.geometry
          .getEnvelopeInternal()
          .intersects(row.geometry.getEnvelopeInternal()),
      )
      .map(row => ({
        ...row,
        intersection: OverlayOp.intersection(territorial.geometry, row.geometry),
      }))
      .filter(row => !row.intersection.isEmpty() && row.intersection.getArea() > 0)
    if (!hits.length) throw Error(`No coastline land intersects ${division.id}`)
    const clipped = union(hits.map(row => polygonOnly(row.intersection)))
    return [false, true].flatMap(isLand => {
      const geometry = writer.write(isLand ? clipped : territorial.geometry) as Shape
      if (
        !['Polygon', 'MultiPolygon'].includes(geometry.type) ||
        !IsValidOp.isValid(read(geometry))
      )
        throw Error(`Invalid derived administrative area ${division.id}`)
      const kind = isLand ? 'land' : 'territorial'
      return partitionAdministrativeArea({
        id: canonicalGeneratedId(
          buildDeterministicUuidV5(namespace, `administrative:${division.id}:${kind}`),
        ),
        divisionId: division.id,
        variant: 'saanseoi',
        geometry: JSON.stringify(geometry),
        bbox: JSON.stringify(reviewAreaBounds(geometry)),
        type: isLand ? 'land' : territorial.isLand ? 'mixed' : 'maritime',
        isLand: Number(isLand || territorial.isLand),
        isTerritorial: Number(!isLand),
        identifiers: null,
        sources: JSON.stringify({
          saanseoi: [
            {
              method: isLand
                ? 'intersect-territory-with-coastline-land'
                : division.class === 'area'
                  ? 'union-overture-district-territories'
                  : 'overture-territorial',
              contributions: ['geometry'],
            },
          ],
          overture: territorial.sourceIds.map(id => ({
            dataset: 'ds-hk-overture-division',
            record_id: id,
            contributions: ['geometry'],
          })),
          ...(isLand
            ? {
                protomaps: hits.map(row => ({
                  dataset: 'ds-hk-protomaps-island',
                  record_id: row.id,
                  contributions: ['land-mask'],
                })),
              }
            : {}),
        }),
      })
    })
  })
}

/** Split only along existing polygon components; coordinates and holes remain exact. */
export function partitionAdministrativeArea(
  row: Row,
  maxGeometryBytes = 750_000,
): Row[] {
  const geometry = object(row.geometry) as Shape
  if (Buffer.byteLength(JSON.stringify(geometry)) <= maxGeometryBytes) return [row]
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const groups: (typeof polygons)[] = []
  let group: typeof polygons = []
  let size = 50
  for (const polygon of polygons) {
    const bytes = Buffer.byteLength(JSON.stringify(polygon)) + 1
    if (bytes + 50 > maxGeometryBytes)
      throw Error(
        `Administrative polygon component exceeds the storage budget: ${row.divisionId}`,
      )
    if (size + bytes > maxGeometryBytes) {
      groups.push(group)
      group = []
      size = 50
    }
    group.push(polygon)
    size += bytes
  }
  if (group.length) groups.push(group)
  return groups.map((coordinates, index) => {
    const part: MultiPolygon = { type: 'MultiPolygon', coordinates }
    return {
      ...row,
      id: canonicalGeneratedId(
        buildDeterministicUuidV5(namespace, `${row.id}:part:${index + 1}`),
      ),
      geometry: JSON.stringify(part),
      bbox: JSON.stringify(reviewAreaBounds(part)),
      sources: JSON.stringify({
        ...object(row.sources),
        saanseoi: [
          ...(object(row.sources)?.saanseoi ?? []),
          {
            method: 'existing-polygon-components',
            contributions: ['geometry'],
            geometryPartition: { of: row.id, part: index + 1, count: groups.length },
          },
        ],
      }),
    }
  })
}
