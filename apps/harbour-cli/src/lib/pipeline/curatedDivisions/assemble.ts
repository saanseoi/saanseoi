import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import { buildDeterministicUuidV5, geographicDivisionClassification } from '@repo/db'
import {
  reviewAreaBounds,
  containsReviewPoint,
} from '@repo/core/pipeline/services/divisions/geographicReview'
import type { Polygon, MultiPolygon } from 'geojson'

type Row = Record<string, any>
const namespace = '7a3c5e91-95c2-5c93-8e3c-7d5b5d3bb6e7'
const uuid = (key: string) => buildDeterministicUuidV5(namespace, key)
export function assembleCuratedDivisions(input: {
  excludedIds?: string[]
  classificationPatches?: Row[]
  divisions: Row[]
  names: Row[]
  areas: Row[]
  hierarchy: Row
  stubs: Row
  islands: Row[]
}) {
  const excluded = new Set(input.excludedIds ?? [])
  const divisions = new Map(
    input.divisions
      .filter(row => !excluded.has(row.id))
      .map(row => [row.id, { ...row }]),
  )
  for (const patch of input.classificationPatches ?? []) {
    const division = divisions.get(patch.divisionId)
    if (!division || division.class === patch.replacement.class) continue
    if (division.class !== patch.expected.subtype)
      throw Error(`Canonical classification patch mismatch for ${patch.divisionId}`)
    const classification = geographicDivisionClassification(patch.replacement.class)
    if (!classification) throw Error(`Unknown classification for ${patch.divisionId}`)
    Object.assign(division, classification, {
      class: patch.replacement.class,
      level: patch.replacement.level,
    })
  }
  const names = input.names
    .filter(row => !excluded.has(row.divisionId))
    .map(row => ({ ...row }))
  const aliases = new Map<string, string>()
  for (const island of input.islands) {
    if (excluded.has(island.id) || excluded.has(uuid(island.id))) continue
    const candidates = (island.matches ?? [])
      .map((m: Row) => divisions.get(m.id))
      .filter((d: Row) => d && ['major_island', 'minor_island'].includes(d.class))
    if (candidates.length > 1) throw Error(`Ambiguous island identity: ${island.name}`)
    const id = candidates[0]?.id ?? uuid(island.id)
    aliases.set(island.id, id)
    if (!divisions.has(id)) {
      divisions.set(id, {
        id,
        category: 'landform',
        class: island.areaKm2 >= 1 ? 'major_island' : 'minor_island',
        level: null,
        geometry: island.point
          ? JSON.stringify({ type: 'Point', coordinates: island.point })
          : null,
        hierarchies: '{}',
        bbox: null,
        identifiers: JSON.stringify({ saanseoiIsland: { sourceId: island.id } }),
        sources: JSON.stringify({
          saanseoi: [{ dataset: 'curated-island-areas', record_id: island.id }],
        }),
      })
      for (const [locale, name] of [
        ['en', island.name],
        ['zh-hant', island.zh],
      ])
        if (name) names.push({ divisionId: id, locale, name, isLocaleInferred: 0 })
    }
  }
  const remap = (v: any): any =>
    Array.isArray(v)
      ? v.map(remap)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v).map(([k, x]) => [
              k,
              k === 'id' && typeof x === 'string' ? (aliases.get(x) ?? x) : remap(x),
            ]),
          )
        : v
  for (const entry of input.hierarchy.entries) {
    const id = aliases.get(entry.divisionId) ?? entry.divisionId
    if (excluded.has(id) || excluded.has(entry.divisionId)) continue
    const division = divisions.get(id)
    if (!division) throw Error(`Missing curated division ${entry.divisionId}`)
    if (division.class !== entry.expectedClass)
      throw Error(
        `Curated class mismatch for ${id}: ${division.class} / ${entry.expectedClass}`,
      )
    const hierarchy = remap(entry.hierarchies)
    for (const island of input.islands.filter(i => i.restrictHierarchyToGeometry)) {
      const parentId = aliases.get(island.id)
      if (
        !Object.values(hierarchy).some((paths: any) =>
          paths.some((path: Row[]) => path.some(parent => parent.id === parentId)),
        )
      )
        continue
      if (!entry.point)
        throw Error(`Missing point for island ancestry validation: ${id}`)
      if (!containsReviewPoint(entry.point, island.geometry)) {
        for (const key of Object.keys(hierarchy))
          hierarchy[key] = hierarchy[key]
            .map((path: Row[]) => path.filter(parent => parent.id !== parentId))
            .filter((path: Row[]) => path.length)
      }
    }
    for (const paths of Object.values(hierarchy) as Row[][][])
      for (const path of paths)
        for (const parent of path)
          if (!divisions.has(parent.id)) throw Error(`Missing ancestor ${parent.id}`)
    division.hierarchies = JSON.stringify(hierarchy)
  }
  const areas = new Map<string, Row[]>()
  for (const area of input.areas)
    if (divisions.has(area.divisionId))
      areas.set(area.divisionId, [
        ...(areas.get(area.divisionId) ?? []),
        { ...area, variant: 'saanseoi' },
      ])
  const put = (
    id: string,
    geometry: Polygon | MultiPolygon,
    source: string,
    originalId: string,
  ) => {
    if (excluded.has(id) || excluded.has(originalId)) return
    if (!divisions.has(id)) throw Error(`Area references unknown division ${id}`)
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type))
      throw Error(`Expected polygon for ${id}`)
    const polygons =
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    if (
      !polygons.length ||
      polygons.some(
        polygon =>
          !polygon.length ||
          polygon.some(
            ring =>
              ring.length < 4 ||
              ring.some(
                p =>
                  p.length < 2 ||
                  !Number.isFinite(p[0]) ||
                  !Number.isFinite(p[1]) ||
                  Math.abs(p[0]!) > 180 ||
                  Math.abs(p[1]!) > 90,
              ) ||
              JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1)),
          ),
      )
    )
      throw Error(`Invalid polygon rings for ${id}`)
    if (!IsValidOp.isValid(new GeoJSONReader(new GeometryFactory()).read(geometry)))
      throw Error(`Invalid polygon topology for ${id}`)
    areas.set(id, [
      {
        id: uuid(`area:${id}`),
        divisionId: id,
        variant: 'saanseoi',
        geometry: JSON.stringify(geometry),
        bbox: JSON.stringify(reviewAreaBounds(geometry)),
        type: 'land',
        isLand: 1,
        isTerritorial: 0,
        identifiers: JSON.stringify({ curation: { source, originalId } }),
        sources: JSON.stringify({
          saanseoi: [{ dataset: source, record_id: originalId }],
        }),
      },
    ])
  }
  for (const island of input.islands)
    if (
      aliases.has(island.id) &&
      ['Polygon', 'MultiPolygon'].includes(island.geometry?.type)
    )
      put(aliases.get(island.id)!, island.geometry, 'island-areas', island.id)
  for (const feature of input.stubs.features)
    put(
      aliases.get(feature.properties.divisionId) ?? feature.properties.divisionId,
      feature.geometry,
      'stub-areas',
      feature.properties.divisionId,
    )
  const outputAreas: Row[] = [...areas.values()]
    .flat()
    .map(row => ({ ...row, id: uuid(`saanseoi:${row.id}`) }))
  return {
    divisions: [...divisions.values()],
    names,
    areas: outputAreas,
    aliases: Object.fromEntries(aliases),
  }
}
