import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import hierarchyFixture from '../../../../../../fixtures/meta/processing-rules/assembly/native-administrative-hierarchy.json'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'
import proj4 from 'proj4'
import type { DivisionHierarchies, DivisionHierarchyEntry } from '@repo/db'
import {
  containmentGeometryHash,
  type ContainmentArea,
} from '@repo/core/pipeline/services/divisions/containmentGeometry'

export const nativeAdministrativeHierarchyAction =
  'native_administrative_hierarchy_inferred'
export const nativeAdministrativeHierarchyPolicy =
  'hk80-covered-districts-v1:inclusive-0.05'
export type AdministrativeReference = {
  id: string
  class: string
  name: string | null
  hierarchies: DivisionHierarchies
  areas: ContainmentArea[]
}
const hk80 =
  '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs'

/** Infer administrative paths only; a polygon label point never selects a branch. */
export function createNativeAdministrativeHierarchy(
  references: AdministrativeReference[],
) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const writer = new GeoJSONWriter()
  const project = (coordinates: any): any =>
    typeof coordinates[0] === 'number'
      ? proj4('EPSG:4326', hk80, coordinates.slice(0, 2))
      : coordinates.map(project)
  const metric = (shape: any) =>
    reader.read({ ...shape, coordinates: project(shape.coordinates) })
  const prepare = (areas: ContainmentArea[]) => {
    if (!areas.length)
      throw Error('Administrative inference requires polygon geometry.')
    const shapes = areas.map(metric)
    if (shapes.some(shape => shape.isEmpty() || !IsValidOp.isValid(shape)))
      throw Error('Invalid polygon in administrative hierarchy inference.')
    const geometry = UnaryUnionOp.union(
      reader.read({
        type: 'GeometryCollection',
        geometries: shapes.map(shape => writer.write(shape)),
      }),
    )
    if (geometry.isEmpty() || !IsValidOp.isValid(geometry))
      throw Error('Invalid administrative polygon union.')
    const original = UnaryUnionOp.union(
      reader.read({ type: 'GeometryCollection', geometries: areas }),
    )
    if (original.isEmpty() || !IsValidOp.isValid(original))
      throw Error('Invalid original administrative polygon union.')
    return { geometry, original, hash: containmentGeometryHash(areas) }
  }
  const byId = new Map(
    references.map(row => [row.id, { ...row, ...prepare(row.areas) }]),
  )
  if (byId.size !== references.length)
    throw Error('Duplicate administrative reference.')
  const districts = [...byId.values()]
    .filter(row => row.class === 'district')
    .sort((a, b) => a.id.localeCompare(b.id))
  if (!districts.length)
    throw Error('No administrative districts for hierarchy inference.')
  const districtUnion = UnaryUnionOp.union(
    reader.read({
      type: 'GeometryCollection',
      geometries: districts.map(row => writer.write(row.geometry)),
    }),
  )
  const paths = new Map(
    districts.map(district => {
      const candidates = district.hierarchies.full.map(path => [
        ...path.filter(row => ['sar', 'area'].includes(row.class)),
        district,
      ])
      if (
        candidates.length !== 1 ||
        candidates[0]!.map(row => row.class).join(',') !== 'sar,area,district' ||
        candidates[0]!.some(row => !byId.has(row.id))
      )
        throw Error(`Incomplete administrative reference path for ${district.id}.`)
      return [district.id, candidates[0]!.map(row => byId.get(row.id)!)] as const
    }),
  )
  return (id: string, shape: any) => {
    if (!shape || !['Point', 'Polygon', 'MultiPolygon'].includes(shape.type))
      throw Error(`No usable source geometry for administrative ancestry: ${id}.`)
    const point = shape.type === 'Point'
    const child = point
      ? { geometry: metric(shape), original: reader.read(shape), hash: null }
      : prepare([shape])
    const totalArea = point ? null : child.geometry.getArea()
    const coveredArea = point
      ? null
      : OverlayOp.intersection(child.geometry, districtUnion).getArea()
    if (!point && (!totalArea || !Number.isFinite(totalArea)))
      throw Error(`Invalid inference area for ${id}.`)
    const decisions = districts.map(district => {
      const intersects = district.geometry
        .getEnvelopeInternal()
        .intersects(child.geometry.getEnvelopeInternal())
      const covers = RelateOp.covers(district.original, child.original)
      const overlap = point
        ? null
        : !intersects
          ? 0
          : OverlayOp.intersection(child.geometry, district.geometry).getArea()
      const coveredFraction = point || !coveredArea ? null : overlap / coveredArea
      return {
        districtId: district.id,
        geometryHash: district.hash,
        overlapSquareMetres: overlap,
        sourceFraction: point ? null : overlap / totalArea!,
        coveredFraction,
        selected: point ? covers : coveredFraction !== null && coveredFraction >= 0.05,
        fullyContained: covers,
      }
    })
    const selected = decisions.filter(row => row.selected)
    // A source outside every district remains explicitly unmatched, never nearest-neighbour filled.
    const full: DivisionHierarchyEntry[][] = selected.map(row =>
      paths.get(row.districtId)!.map(parent => ({
        id: parent.id,
        class: parent.class,
        name: parent.name,
        full_containment: point
          ? null
          : RelateOp.covers(parent.original, child.original),
      })),
    )
    return {
      hierarchies: {
        full,
        ...(full.length ? { administrative: structuredClone(full) } : {}),
      } satisfies DivisionHierarchies,
      action: {
        action: nativeAdministrativeHierarchyAction,
        affectedRecordCount: 1,
        mode: 'automatic' as const,
        summary:
          'Infer HKSAR, Area and District ancestry from pinned administrative polygons.',
        evidence: {
          divisionId: id,
          policy: nativeAdministrativeHierarchyPolicy,
          method: point ? 'point-covered-by-district' : 'polygon-covered-area-overlap',
          sourceGeometryHash: child.hash,
          sourcePoint: point ? shape.coordinates : null,
          totalSquareMetres: totalArea,
          coveredSquareMetres: coveredArea,
          uncoveredSquareMetres: point ? null : Math.max(0, totalArea! - coveredArea!),
          decisions,
          paths: full,
          ancestorGeometryHashes: Object.fromEntries(
            full.flat().map(parent => [parent.id, byId.get(parent.id)!.hash]),
          ),
          outcome: full.length ? 'matched' : 'unmatched',
        },
      },
    }
  }
}

export type NativeAdministrativeHierarchy = ReturnType<
  typeof createNativeAdministrativeHierarchy
>

const nativeAdministrativeHierarchyRule = registerRule(
  ruleDeclarationFromFixture(hierarchyFixture),
  (references: AdministrativeReference[]) =>
    createNativeAdministrativeHierarchy(references),
)
export const nativeAdministrativeHierarchyDeclaration =
  nativeAdministrativeHierarchyRule.declaration
Object.assign(createNativeAdministrativeHierarchy, nativeAdministrativeHierarchyRule)
