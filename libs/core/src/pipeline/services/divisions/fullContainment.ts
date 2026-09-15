import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import type {
  DivisionHierarchies,
  DivisionHierarchyEntry,
} from '../../../../../db/src/divisionTaxonomy'
import { containmentGeometryHash, type ContainmentArea } from './containmentGeometry'

/** Offline only: validate whole polygons, including holes, concavities and all parts. */
export function createFullContainmentAnnotator(areas: Map<string, ContainmentArea[]>) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const prepared = new Map<string, { geometry: any; hash: string } | null>()
  const assertions = new Map<
    string,
    Pick<DivisionHierarchyEntry, 'full_containment' | 'containment_geometry'>
  >()
  function prepare(id: string) {
    if (prepared.has(id)) return prepared.get(id)!
    let result = null
    const parts = areas.get(id)
    if (parts?.length) {
      try {
        const geometries = parts.map(part => reader.read(part))
        if (
          geometries.every(
            geometry => !geometry.isEmpty() && IsValidOp.isValid(geometry),
          )
        ) {
          const geometry = UnaryUnionOp.union(
            reader.read({
              type: 'GeometryCollection',
              geometries: parts,
            }),
          )
          if (!geometry.isEmpty() && IsValidOp.isValid(geometry))
            result = { geometry, hash: containmentGeometryHash(parts) }
        }
      } catch {
        // Invalid or numerically unresolved topology supplies no positive evidence.
      }
    }
    prepared.set(id, result)
    return result
  }
  return (divisionId: string, hierarchy: DivisionHierarchies): DivisionHierarchies => {
    const result = structuredClone(hierarchy)
    for (const paths of Object.values(result))
      for (const path of paths)
        for (const ancestor of path) {
          const key = JSON.stringify([divisionId, ancestor.id])
          let assertion = assertions.get(key)
          if (!assertion) {
            assertion = { full_containment: null }
            const child = prepare(divisionId)
            const parent = prepare(ancestor.id)
            if (child && parent && divisionId !== ancestor.id) {
              try {
                assertion = {
                  full_containment: RelateOp.covers(parent.geometry, child.geometry),
                  containment_geometry: { division: child.hash, ancestor: parent.hash },
                }
              } catch {
                // Preserve unknown instead of trusting an unproved relation.
              }
            }
            assertions.set(key, assertion)
          }
          delete ancestor.containment_geometry
          Object.assign(ancestor, assertion)
        }
    return result
  }
}
