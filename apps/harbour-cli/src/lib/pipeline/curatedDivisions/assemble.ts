import { applyDivisionClassificationPatch } from '@repo/core/pipeline/services/divisions/divisionClassificationPatch'
import {
  canonicalDivisionPoint,
  createDivisionPointGuard,
  divisionAreaUnion,
} from '@repo/core/pipeline/services/divisions/divisionPoint'
import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'
import type { ProtomapsIslandSelection } from '@repo/core/pipeline/services/sources/protomapsSourceViews'
import {
  curatedSourceIdentifiers,
  protomapsIdentifiers,
  mergeDivisionIdentifiers,
} from '@repo/core/pipeline/services/sources/curatedIdentifiers'
import assemblyFixture from '../../../../../../fixtures/meta/processing-rules/assembly/curated-division-assembly.json'
import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import { resolveCuratedHierarchies } from './resolveHierarchies'
import {
  deriveIslandGroupGeometry,
  type IslandGroupDefinition,
} from './islandGroupGeometry'
import { isAdministrativeDivision } from './administrativeAreas'
import { createAliasAudit, recordAliasAudit } from './nameAliasAudit'
import {
  applyCuratedDivisionNames,
  curatedDivisionPolicy,
  curatedDivisionClassification,
} from '@repo/core/pipeline/services/divisions/curatedDivisionPolicy'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import {
  buildDeterministicUuidV5,
  canonicalGeneratedId,
  geographicDivisionClassification,
  classifyIslandArea,
} from '@repo/db'
import {
  reviewAreaBounds,
  containsReviewPoint,
} from '@repo/core/pipeline/services/divisions/geographicReview'
import type { Polygon, MultiPolygon } from 'geojson'
import { createFullContainmentAnnotator } from '@repo/core/pipeline/services/divisions/fullContainment.ts'
import {
  curateIslands,
  assertIslandCurationReady,
  type IslandReviewFixture,
  type IslandInventoryEntry,
} from '../islands/islandCuration'

type Row = Record<string, any>
const namespace = '7a3c5e91-95c2-5c93-8e3c-7d5b5d3bb6e7'
const uuid = (key: string) =>
  canonicalGeneratedId(buildDeterministicUuidV5(namespace, key))
function assembleCuratedDivisionsInternal(input: {
  islandReview?: IslandReviewFixture
  excludedIds?: string[]
  classificationPatches?: Row[]
  divisions: Row[]
  names: Row[]
  areas: Row[]
  administrativeAreas?: Row[]
  hierarchy: Row
  estimatedAreas: Row
  islands: Row[]
  islandGroups?: IslandGroupDefinition[]
}) {
  const excluded = new Set(input.excludedIds ?? [])
  const nameAliasAudit = createAliasAudit(curatedDivisionPolicy.aliases.nameAliasRules)
  const mergedAliases = new Map<string, string>()
  const reclassifiedGroups = new Map<string, string>()
  let islands = input.islands
  if (input.islandReview) {
    const result = curateIslands(
      input.islands as IslandInventoryEntry[],
      input.islandReview,
    )
    assertIslandCurationReady(result)
    const accepted = new Set(result.islands.map(island => island.id))
    for (const group of input.islandReview.curationPolicy?.aliasGroups ?? []) {
      if (!accepted.has(group.canonicalId)) continue
      for (const aliasId of group.aliasIds)
        mergedAliases.set(aliasId, group.canonicalId)
    }
    // Carry curated geometry and its measured area into publication; acceptance
    // alone must not restore the uncorrected inventory polygon.
    const curated = new Map(result.islands.map(island => [island.id, island]))
    islands = input.islands
      .filter(island => accepted.has(island.id))
      .map(island => {
        const selected = curated.get(island.id)!
        return {
          ...island,
          geometry: selected.geometry,
          geometrySource: selected.geometrySource,
          protomapsFeatureId: selected.geometrySource?.sourceRecordId,
          areaKm2: selected.areaKm2,
        }
      })
    const acceptedMatches = new Set(
      islands.flatMap(island => (island.matches ?? []).map((match: Row) => match.id)),
    )
    for (const island of input.islands) {
      if (accepted.has(island.id)) continue
      // A group rejected by the individual-island review can still be an
      // explicitly curated division. Do not turn reclassification into deletion.
      const reclassification = input.islandReview.curationPolicy?.actions.find(
        action => action.id === island.id && action.action === 'reclassify',
      )
      if (
        reclassification?.class === 'island_group' &&
        !reclassification.reviewRequired &&
        !excluded.has(island.id) &&
        !excluded.has(uuid(island.id)) &&
        input.divisions.some(
          division =>
            division.id === uuid(island.id) && division.class === 'island_group',
        )
      ) {
        reclassifiedGroups.set(uuid(island.id), island.id)
        continue
      }
      excluded.add(island.id)
      excluded.add(uuid(island.id))
      for (const match of island.matches ?? []) {
        const division = input.divisions.find(row => row.id === match.id)
        if (
          division &&
          !acceptedMatches.has(division.id) &&
          ['major_island', 'minor_island', 'islet'].includes(division.class)
        )
          excluded.add(division.id)
      }
    }
  }
  const divisions = new Map(
    input.divisions
      .filter(row => !excluded.has(row.id))
      .map(row => [row.id, { ...row }]),
  )
  for (const [id, sourceId] of reclassifiedGroups) {
    const division = divisions.get(id)!
    const sources =
      typeof division.sources === 'string'
        ? JSON.parse(division.sources)
        : (division.sources ?? {})
    division.sources = JSON.stringify({
      ...sources,
      saanseoi: [
        ...(sources.saanseoi ?? []),
        {
          dataset: 'curated-island-areas',
          recordId: sourceId,
          contributions: ['identity', 'classification'],
        },
      ],
    })
  }
  for (const patch of input.classificationPatches ?? []) {
    const division = divisions.get(patch.divisionId)
    if (!division || division.class === patch.replacement.class) continue
    const classification = geographicDivisionClassification(patch.replacement.class)
    if (!classification) throw Error(`Unknown classification for ${patch.divisionId}`)
    Object.assign(division, classification, {
      class: patch.replacement.class,
      level: patch.replacement.level,
    })
  }
  let names = input.names
    .filter(row => !excluded.has(row.divisionId))
    .map(row => ({ ...row }))
  for (const patch of input.classificationPatches ?? []) {
    for (const [locale, additions] of [
      ['en', patch.replacement.nameAltsEn],
      ['zh-hant', patch.replacement.nameAltsZhHant],
    ] as const) {
      if (!Array.isArray(additions) || additions.length === 0) continue
      const name = names.find(
        row => row.divisionId === patch.divisionId && row.locale === locale,
      )
      if (!name) continue
      const alternatives = [
        ...(name.nameAlts?.split('|').filter(Boolean) ?? []),
        ...additions,
      ].filter(value => value !== name.name)
      const deduped = [...new Set(alternatives)]
      name.nameAlts = deduped.length > 0 ? deduped.join('|') : null
      const variants = Array.isArray(name.nameVariant)
        ? name.nameVariant
        : typeof name.nameVariant === 'string'
          ? JSON.parse(name.nameVariant)
          : []
      name.nameVariant = JSON.stringify([...new Set([...(variants ?? []), ...deduped])])
    }
  }
  const correctionFor = (id: string) =>
    input.classificationPatches?.find(patch => patch.divisionId === id)?.replacement ??
    applyDivisionClassificationPatch({ id })
  const aliases = new Map<string, string>()
  for (const island of islands) {
    if (excluded.has(island.id) || excluded.has(uuid(island.id))) continue
    const candidates = (island.matches ?? [])
      .map((m: Row) => divisions.get(m.id))
      .filter(
        (d: Row) =>
          d &&
          (['major_island', 'minor_island', 'islet'].includes(d.class) ||
            correctionFor(d.id)),
      )
    if (candidates.length > 1) throw Error(`Ambiguous island identity: ${island.name}`)
    const id = candidates[0]?.id ?? uuid(island.id)
    aliases.set(island.id, id)
    const islandClass =
      correctionFor(id)?.class ??
      correctionFor(island.id)?.class ??
      curatedDivisionClassification(island.id)?.class ??
      curatedDivisionClassification(id)?.class ??
      classifyIslandArea(island.areaKm2)
    const islandClassification = geographicDivisionClassification(islandClass)
    if (!islandClassification)
      throw Error(`Unknown island classification: ${islandClass}`)
    if (candidates[0]) {
      Object.assign(candidates[0], {
        ...islandClassification,
        class: islandClass,
      })
    }
    if (!divisions.has(id)) {
      divisions.set(id, {
        id,
        ...islandClassification,
        class: islandClass,
        geometry: island.point
          ? JSON.stringify({ type: 'Point', coordinates: island.point })
          : null,
        hierarchies: '{}',
        identifiers: JSON.stringify(
          mergeDivisionIdentifiers(
            curatedSourceIdentifiers(island.id),
            island.protomapsFeatureId
              ? protomapsIdentifiers(island.protomapsFeatureId)
              : null,
          ),
        ),
        sources: JSON.stringify({
          saanseoi: [{ dataset: 'curated-island-areas', recordId: island.id }],
        }),
      })
      for (const [locale, name] of [
        ['en', island.name],
        ['zh-hant', island.zh],
      ])
        if (name) names.push({ divisionId: id, locale, name, isLocaleInferred: 0 })
    }
    const selected = divisions.get(id)!
    selected.identifiers = JSON.stringify(
      mergeDivisionIdentifiers(
        selected.identifiers,
        curatedSourceIdentifiers(island.id),
        island.protomapsFeatureId
          ? protomapsIdentifiers(island.protomapsFeatureId)
          : null,
      ),
    )
  }
  // Include newly materialised island identities in the name inventory patches.
  for (const id of divisions.keys()) {
    if (!divisions.has(id)) continue
    const localised: Row[] = names
      .filter(row => row.divisionId === id)
      .map(row => ({
        ...row,
        nameVariant:
          typeof row.nameVariant === 'string'
            ? JSON.parse(row.nameVariant)
            : row.nameVariant,
        nameRules:
          typeof row.nameRules === 'string' ? JSON.parse(row.nameRules) : row.nameRules,
      }))
    const curated = applyCuratedDivisionNames(id, localised as never).map(row => ({
      ...row,
      nameVariant: row.nameVariant ? JSON.stringify(row.nameVariant) : null,
      nameRules: row.nameRules ? JSON.stringify(row.nameRules) : null,
    }))
    recordAliasAudit(nameAliasAudit, id, localised, curated)
    const hasAliasDecision =
      curatedDivisionPolicy.aliases.entries.some(entry => entry.divisionId === id) ||
      localised.some(row =>
        curatedDivisionPolicy.aliases.nameAliasRules.some(
          rule => row.locale === rule.locale && row.name?.endsWith(rule.suffix),
        ),
      )
    if (hasAliasDecision) {
      const division = divisions.get(id)!
      const sources =
        typeof division.sources === 'string'
          ? JSON.parse(division.sources)
          : (division.sources ?? {})
      const retained = (sources.saanseoi ?? []).filter(
        (source: Row) => source.curation !== 'division-names',
      )
      division.sources = JSON.stringify({
        ...sources,
        saanseoi: [
          ...retained,
          {
            dataset: 'ds-hk-saanseoi-division',
            recordId: id,
            curation: 'division-names',
            contributions: ['names'],
          },
        ],
      })
    }
    names = [...names.filter(row => row.divisionId !== id), ...curated]
  }
  for (const [aliasId, canonicalId] of mergedAliases) {
    const canonical = aliases.get(canonicalId)
    if (canonical) {
      aliases.set(aliasId, canonical)
      aliases.set(uuid(aliasId), canonical)
      const alias = input.islands.find(island => island.id === aliasId)
      for (const match of alias?.matches ?? [])
        if (excluded.has(match.id)) aliases.set(match.id, canonical)
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
    // Curated area determines island size class; other taxonomy changes still
    // require a matching hierarchy fixture.
    const curatedIslandClass =
      input.islandReview &&
      islands.some(island => aliases.get(island.id) === id) &&
      ['major_island', 'minor_island', 'islet'].includes(entry.expectedClass)
    if (!curatedIslandClass) {
      const classification = geographicDivisionClassification(entry.expectedClass)
      if (!classification)
        throw Error(`Unknown curated classification: ${entry.expectedClass}`)
      if (division.class !== entry.expectedClass)
        throw Error(
          `Hierarchy class mismatch for ${id}: classification resolved ${division.class}, hierarchy expects ${entry.expectedClass}. Update the explicit SaanSeoi classification or regenerate the hierarchy input.`,
        )
    }
    const hierarchy = remap(entry.hierarchies)
    for (const key of Object.keys(hierarchy))
      hierarchy[key] = hierarchy[key]
        .map((path: Row[]) => path.filter(parent => !excluded.has(parent.id)))
        .filter((path: Row[]) => path.length)
    for (const island of islands.filter(i => i.restrictHierarchyToGeometry)) {
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
        for (const parent of path) {
          const ancestor = divisions.get(parent.id)
          if (!ancestor) throw Error(`Missing ancestor ${parent.id}`)
          if (['major_island', 'minor_island', 'islet'].includes(ancestor.class))
            parent.class = ancestor.class
        }
    division.hierarchies = JSON.stringify(hierarchy)
  }
  const areas = new Map<string, Row[]>()
  for (const area of [
    ...input.areas.filter(
      area =>
        !input.administrativeAreas ||
        !isAdministrativeDivision(divisions.get(area.divisionId) ?? {}),
    ),
    ...(input.administrativeAreas ?? []),
  ])
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
    geometrySource?: ProtomapsIslandSelection,
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
        identifiers: JSON.stringify(
          mergeDivisionIdentifiers(
            divisions.get(id)?.identifiers,
            source === 'island-areas' ? curatedSourceIdentifiers(originalId) : null,
          ),
        ),
        ...(geometrySource ? { geometrySource } : {}),
        sources: JSON.stringify({
          saanseoi: [
            {
              dataset: source,
              recordId: originalId,
              contributions: [geometrySource ? 'selection' : 'geometry'],
            },
          ],
          ...(geometrySource
            ? {
                protomaps: [
                  {
                    dataset: 'ds-hk-protomaps-island',
                    recordId: geometrySource.sourceRecordId,
                    contributions: ['geometry'],
                  },
                ],
              }
            : {}),
        }),
      },
    ])
  }
  for (const island of islands)
    if (
      aliases.has(island.id) &&
      ['Polygon', 'MultiPolygon'].includes(island.geometry?.type)
    )
      put(
        aliases.get(island.id)!,
        island.geometry,
        'island-areas',
        island.id,
        island.geometrySource,
      )
  for (const feature of input.estimatedAreas.features) {
    if (excluded.has(feature.properties.divisionId)) continue
    const divisionId =
      aliases.get(feature.properties.divisionId) ?? feature.properties.divisionId
    if (
      input.administrativeAreas &&
      isAdministrativeDivision(divisions.get(divisionId) ?? {})
    )
      continue
    if (feature.properties.corePoint) {
      if (!containsReviewPoint(feature.properties.corePoint, feature.geometry))
        throw Error(`Core point is outside curated geometry for ${divisionId}`)
      const division = divisions.get(divisionId)
      if (!division) throw Error(`Core point references unknown division ${divisionId}`)
      division.geometry = JSON.stringify({
        type: 'Point',
        coordinates: feature.properties.corePoint,
      })
    }
    put(
      divisionId,
      feature.geometry,
      'division-geometry',
      feature.properties.divisionId,
    )
  }
  const groupGeometry = deriveIslandGroupGeometry(
    input.islandGroups ?? [],
    [...divisions.values()].flatMap(division => {
      const records = areas.get(division.id) ?? []
      const polygons = records
        .filter(row => row.isLand !== 0)
        .flatMap(row => {
          const geometry =
            typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry
          return geometry.type === 'Polygon'
            ? [geometry.coordinates]
            : geometry.coordinates
        })
      return polygons.length
        ? [
            {
              id: division.id,
              class: division.class,
              geometry: { type: 'MultiPolygon' as const, coordinates: polygons },
            },
          ]
        : []
    }),
    id => aliases.get(id) ?? id,
  )
  for (const group of groupGeometry) {
    if (divisions.get(group.divisionId)?.class !== 'island_group')
      throw Error(`Unknown island group ${group.divisionId}`)
    put(group.divisionId, group.geometry, 'island-groups', group.divisionId)
    for (const area of areas.get(group.divisionId)!) {
      const sources = JSON.parse(area.sources)
      sources.saanseoi[0].islandGroup = {
        memberIds: group.memberIds,
        seedBounds: group.seedBounds,
        method: 'seed-bounds-whole-island-v1',
      }
      area.sources = JSON.stringify(sources)
    }
  }
  const outputAreas: Row[] = [...areas.values()]
    .flat()
    .map(row => ({ ...row, id: uuid(`saanseoi:${row.id}`) }))
  // Publication can remap identities and replace editor polygons. Assertions must
  // describe the final geometry, never the geometry that happened to be curated.
  const containmentAreas = new Map<string, Array<Polygon | MultiPolygon>>()
  for (const area of outputAreas) {
    const geometry =
      typeof area.geometry === 'string' ? JSON.parse(area.geometry) : area.geometry
    containmentAreas.set(area.divisionId, [
      ...(containmentAreas.get(area.divisionId) ?? []),
      geometry,
    ])
  }
  const pointGuard = createDivisionPointGuard()
  for (const division of divisions.values()) {
    const geometry =
      typeof division.geometry === 'string'
        ? JSON.parse(division.geometry)
        : division.geometry
    const point = canonicalDivisionPoint(geometry ?? null, {
      id: division.id,
      class: division.class,
      area: divisionAreaUnion(
        (containmentAreas.get(division.id) ?? []) as GeoJsonGeometry[],
      ),
      guard: pointGuard,
    })
    division.geometry =
      typeof division.geometry === 'string' ? JSON.stringify(point) : point
  }
  resolveCuratedHierarchies(
    [...divisions.values()],
    outputAreas,
    names,
    new Map(groupGeometry.map(group => [group.divisionId, new Set(group.memberIds)])),
  )
  const annotateContainment = createFullContainmentAnnotator(containmentAreas)
  for (const division of divisions.values()) {
    const hierarchy =
      typeof division.hierarchies === 'string'
        ? JSON.parse(division.hierarchies)
        : division.hierarchies
    if (hierarchy)
      division.hierarchies = JSON.stringify(annotateContainment(division.id, hierarchy))
  }
  return {
    islandCount: islands.filter(
      island => !excluded.has(island.id) && !excluded.has(uuid(island.id)),
    ).length,
    divisions: [...divisions.values()],
    names,
    areas: outputAreas,
    islandGroups: groupGeometry.map(({ geometry: _, ...group }) => group),
    aliases: Object.fromEntries(aliases),
    nameAliasAudit,
    pointGuards: pointGuard.snapshot(),
  }
}

export const curatedDivisionAssemblyRule = registerRule(
  ruleDeclarationFromFixture(assemblyFixture),
  assembleCuratedDivisionsInternal,
)
export function assembleCuratedDivisions(
  input: Parameters<typeof assembleCuratedDivisionsInternal>[0],
) {
  return curatedDivisionAssemblyRule.execute(input)
}
