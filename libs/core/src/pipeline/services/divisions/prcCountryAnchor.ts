import type { GeoJsonGeometry } from '../../geojson'
import anchor from '../../../../../../fixtures/divisions/overture/hk-prc-country-anchor.json'

/** Reviewed canonical metadata, separate from the native Overture reference. */
export function prcCountryAnchor(id: string) {
  if (id !== anchor.id) return null
  const canonical = structuredClone(anchor.canonical)
  return { ...canonical, geometry: canonical.geometry as GeoJsonGeometry }
}
