import {
  curationApplies,
  scopedExclusions,
  type CurationApplicability,
} from './curationApplicability'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import InteriorPoint from 'jsts/org/locationtech/jts/algorithm/InteriorPoint.js'
import additions from '../../../../../../fixtures/meta/curations/saanseoi-division/division-additions.json'
import classifications from '../../../../../../fixtures/meta/curations/saanseoi-division/division-classifications.json'
import names from '../../../../../../fixtures/meta/curations/saanseoi-division/division-names.json'
import decisions from '../../../../../../fixtures/meta/curations/saanseoi-division/division-hierarchy.json'
import exclusions from '../../../../../../fixtures/meta/curations/saanseoi-division/division-exclusions.json'
import matches from '../../../../../../fixtures/meta/curations/saanseoi-division/division-identity-matches.json'
import { geographicDivisionClassification } from '../../../../../db/src/divisionTaxonomy'
import type {
  ReviewArea,
  ReviewInventory,
  ReviewDivision,
  HierarchyPatch,
} from './geographicReview'
import {
  overtureHongKongAreas,
  overtureHongKongAreaDivisionId,
} from './overtureHongKongAreas'

type Row = Record<string, any>
export function sourceDivisionClass(row: Row) {
  return (
    row.class ??
    ({ region: 'district', dependency: 'sar', neighborhood: 'neighbourhood' } as Row)[
      row.subtype
    ] ??
    row.subtype
  )
}
export function sourceDivisionNames(row: Row): Record<string, string> {
  const common = row.names?.common ?? {}
  const entries = Array.isArray(common)
    ? common.map((value: Row | string[]) =>
        Array.isArray(value) ? value : [value.language, value.value],
      )
    : Object.entries(common)
  const result = Object.fromEntries(
    entries
      .filter(
        ([locale, name]: any) =>
          locale &&
          locale !== 'suffix' &&
          !locale.includes('-t-') &&
          typeof name === 'string',
      )
      .map(([locale, name]: any) => [
        locale === 'zh' || locale === 'zh-Hant' ? 'zh-hant' : locale.toLowerCase(),
        name,
      ]),
  )
  return Object.keys(result).length ? result : { en: row.names?.primary ?? row.id }
}
export function curatedPrimaryNames(
  id: string,
  source: Record<string, string | null | undefined>,
) {
  const result: Record<string, string | null> = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string | null] => entry[1] !== undefined,
    ),
  )
  const patch = names.entries.find(row => row.divisionId === id)
  for (const [locale, change] of Object.entries(patch?.names ?? {}) as Array<
    [string, { name?: string; remove?: boolean }]
  >)
    if (change.remove) delete result[locale]
    else if (change.name) result[locale] = change.name
  return result
}

/** Reference inventories are generated; only editorial changes live in curation JSON. */
export function buildCurationInventory(
  source: Row[],
  context: { cohort: string; releaseSet: string; releaseVersion?: string },
  applyExplicitHierarchy = true,
  pointOverrides: Array<{ divisionId: string; point: number[] | null }> = [],
  authoredAreas: ReviewArea[] = [],
): ReviewInventory {
  const omitted = new Set(
    scopedExclusions(exclusions.entries, 'overture', context.releaseVersion).map(
      row => row.divisionId,
    ),
  )
  const classes = new Map(
    classifications.entries.map(row => [row.divisionId, row.class]),
  )
  const points = new Map(pointOverrides.map(row => [row.divisionId, row.point]))
  const areas = new Map(
    authoredAreas.map(feature => [feature.properties.divisionId, feature]),
  )
  const reader = new GeoJSONReader(new GeometryFactory())
  const activeAdditions = additions.entries.filter(row =>
    curationApplies(row as CurationApplicability, context.releaseVersion),
  )
  const authored = new Map(activeAdditions.map(row => [row.id, row]))
  const rows: Array<{
    id: string
    class: string
    names: Record<string, string | null | undefined>
    point: number[] | null
    paths: string[][]
  }> = [
    ...source
      .filter(row => !omitted.has(row.id) && !authored.has(row.id))
      .map(row => ({
        id: row.id,
        class: classes.get(row.id) ?? sourceDivisionClass(row),
        names: sourceDivisionNames(row),
        point: row.geometry?.coordinates ?? null,
        paths: (row.hierarchies ?? []).map((path: Row[]) =>
          path.map(parent => parent.division_id).filter((id: string) => id !== row.id),
        ),
      })),
    ...activeAdditions.map(row => ({ ...row, paths: [] as string[][] })),
  ]
  if (new Set(rows.map(row => row.id)).size !== rows.length)
    throw Error('Duplicate source division identity.')
  const byId = new Map(rows.map(row => [row.id, row]))
  const areaByDistrict = new Map<string, string>()
  for (const area of overtureHongKongAreas)
    for (const district of area.districtNames) {
      const id = rows.find(row => row.names.en === district)?.id
      if (id) areaByDistrict.set(id, overtureHongKongAreaDivisionId(area.code)!)
    }
  const nativePaths = (row: (typeof rows)[number]) =>
    row.paths.map(path => {
      const ancestors = path.filter(id => byId.get(id)?.class !== 'country')
      return ancestors.flatMap(id => {
        const area = areaByDistrict.get(id)
        return area && !ancestors.includes(area) ? [area, id] : [id]
      })
    })
  const explicit = new Map(decisions.entries.map(row => [row.divisionId, row.paths]))
  const divisions: ReviewDivision[] = rows.map(row => {
    const classification = geographicDivisionClassification(row.class)
    if (!classification) throw Error(`Unknown source division class: ${row.class}`)
    const full = (
      (applyExplicitHierarchy ? explicit.get(row.id) : undefined) ?? nativePaths(row)
    )
      .map(path =>
        path
          .filter(id => byId.has(id))
          .map(id => {
            const parent = byId.get(id)!
            return {
              id,
              class: parent.class,
              name: curatedPrimaryNames(id, parent.names).en ?? null,
            }
          }),
      )
      .filter(path => path.length)
    const select = (categories: string[]) =>
      full
        .map(path =>
          path.filter(parent =>
            categories.includes(
              geographicDivisionClassification(parent.class)!.category,
            ),
          ),
        )
        .filter(path => path.length)
    return {
      id: row.id,
      class: row.class,
      ...classification,
      names: curatedPrimaryNames(row.id, row.names),
      point: (() => {
        const area = areas.get(row.id)
        if (area?.properties.corePoint) return area.properties.corePoint
        const existing = points.get(row.id) ?? row.point
        if (existing || !area) return existing
        const centre = InteriorPoint.getInteriorPoint(reader.read(area.geometry))
        if (!centre || !Number.isFinite(centre.x) || !Number.isFinite(centre.y))
          throw Error(`Cannot derive an interior point for ${row.id}`)
        return [centre.x, centre.y]
      })(),
      hierarchies: {
        full,
        administrative: select(['administrative']),
        locality: select(['locality', 'hood']),
        landform: select(['landform']),
      },
    }
  })
  return { schemaVersion: 1, region: 'hk', domain: 'geographic', ...context, divisions }
}

/** Resolve ID-only editorial branches against the final identity set, including islands. */
export function curationHierarchy(inventory: ReviewInventory): HierarchyPatch {
  const byId = new Map(inventory.divisions.map(row => [row.id, row]))
  const entries = decisions.entries
    .filter(row => byId.has(row.divisionId))
    .map(row => {
      const child = byId.get(row.divisionId)!
      const full = row.paths.map(path =>
        path.map(id => {
          const parent = byId.get(id)
          if (!parent)
            throw Error(`Unknown curated ancestor ${id} for ${row.divisionId}`)
          return { id, class: parent.class, name: parent.names.en ?? null }
        }),
      )
      const select = (categories: string[]) =>
        full
          .map(path =>
            path.filter(parent => categories.includes(byId.get(parent.id)!.category!)),
          )
          .filter(path => path.length)
      return {
        divisionId: child.id,
        expectedClass: child.class,
        point: child.point,
        status: 'provisional' as const,
        parentIds: [...new Set(full.flat().map(row => row.id))],
        competingParentIds: [],
        evidence: [],
        hierarchies: {
          full,
          administrative: select(['administrative']),
          locality: select(['locality', 'hood']),
          landform: select(['landform']),
        },
      }
    })
  return {
    schemaVersion: 1,
    kind: 'geographic-hierarchy-patch',
    region: inventory.region,
    domain: inventory.domain,
    cohort: inventory.cohort,
    releaseSet: inventory.releaseSet,
    entries,
  }
}

export const divisionCuration = {
  additions,
  classifications,
  names,
  decisions,
  exclusions,
  matches,
}
