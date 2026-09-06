import { createHash } from 'node:crypto'

export type SourceGroup = {
  estate: string
  building: string
  csu: string
  district: string
  unitCount: number
  inventoryCount: number
  reviewReasons: string[]
  occurrences: Array<{
    featureIndexOneBased: number
    enStreet?: unknown
    zhStreet?: unknown
    coordinates: number[]
    unitCount: number
    inventoryHash: string
  }>
}
export type SourceReport = {
  release: string
  estates2d: Array<{ name: string; records: number; buildingCount: number }>
  groups: SourceGroup[]
}

// Ignore JSON key ordering and source feature order, but preserve multiplicity.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
const hash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex')

function groupStates(groups: SourceGroup[]) {
  const grouped = new Map<string, SourceGroup[]>()
  for (const group of groups) {
    // A comparison bucket is not an ownership/equivalence decision. Distinct
    // upstream block groups and repeated occurrences remain separate assertions.
    const key = canonical([group.district, group.building, group.csu])
    grouped.set(key, [...(grouped.get(key) ?? []), group])
  }
  return [...grouped]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, assertions]) => {
      const sources = assertions
        .map(group => ({
          unitCount: group.unitCount,
          inventoryCount: group.inventoryCount,
          reviewReasons: [...group.reviewReasons].sort(),
          occurrences: group.occurrences
            .map(({ featureIndexOneBased: _, ...occurrence }) => occurrence)
            .sort((a, b) => canonical(a).localeCompare(canonical(b))),
        }))
        .sort((a, b) => canonical(a).localeCompare(canonical(b)))
      const first = assertions[0]!
      return {
        key,
        building: first.building,
        csu: first.csu,
        district: first.district,
        fingerprint: hash(sources),
        assertions: sources,
      }
    })
}

function changedFields(
  before: ReturnType<typeof groupStates>[number],
  after: ReturnType<typeof groupStates>[number],
) {
  const fields = [
    'coordinates',
    'street_components',
    'unit_inventory',
    'source_occurrence_count',
  ] as const
  const projection = (group: typeof before, field: (typeof fields)[number]) => {
    const occurrences = group.assertions.flatMap(assertion => assertion.occurrences)
    if (field === 'source_occurrence_count')
      return [group.assertions.length, occurrences.length]
    return occurrences
      .map(row =>
        field === 'coordinates'
          ? row.coordinates
          : field === 'street_components'
            ? [row.enStreet, row.zhStreet]
            : [row.unitCount, row.inventoryHash],
      )
      .map(canonical)
      .sort()
  }
  return fields.filter(
    field => hash(projection(before, field)) !== hash(projection(after, field)),
  )
}

export function buildEstateChronology(input: SourceReport[]) {
  const reports = [...input].sort((a, b) => a.release.localeCompare(b.release))
  if (
    !reports.length ||
    new Set(reports.map(row => row.release)).size !== reports.length
  )
    throw new Error('Expected unique, nonempty ALS release inventory')
  const names = [
    ...new Set(
      reports.flatMap(report =>
        report.groups.map(group => group.estate).filter(Boolean),
      ),
    ),
  ].sort()
  const estates = names
    .map(name => {
      let previous: ReturnType<typeof state> | undefined
      function state(report: SourceReport) {
        const premise = report.estates2d.find(estate => estate.name === name)
        const groups = report.groups.filter(group => group.estate === name)
        return {
          present2d: Boolean(premise),
          records2d: premise?.records ?? 0,
          buildingNames2d: premise?.buildingCount ?? 0,
          present3d: groups.length > 0,
          nonempty3d: groups.some(group => group.unitCount > 0),
          groups: groupStates(groups),
        }
      }
      const timeline = []
      const sourceReleases2d: string[] = []
      const sourceReleases3d: string[] = []
      for (const report of reports) {
        const current = state(report)
        if (current.present2d) sourceReleases2d.push(report.release)
        if (current.present3d) sourceReleases3d.push(report.release)
        if (!previous && !current.present2d && !current.present3d) continue
        if (previous && hash(previous) === hash(current)) continue
        const before = new Map(previous?.groups.map(group => [group.key, group]) ?? [])
        const after = new Map(current.groups.map(group => [group.key, group]))
        const changed = current.groups
          .filter(
            group =>
              before.has(group.key) &&
              before.get(group.key)?.fingerprint !== group.fingerprint,
          )
          .map(group => ({
            before: before.get(group.key)!,
            after: group,
            fields: changedFields(before.get(group.key)!, group),
          }))
        const added = current.groups.filter(group => !before.has(group.key))
        const removed = previous?.groups.filter(group => !after.has(group.key)) ?? []
        const requiresChangeReview = Boolean(
          previous &&
            (added.length ||
              removed.length ||
              current.records2d !== previous.records2d ||
              current.buildingNames2d !== previous.buildingNames2d ||
              changed.some(group =>
                group.fields.some(field => field !== 'coordinates'),
              )),
        )
        timeline.push({
          release: report.release,
          kind: previous ? ('change' as const) : ('baseline' as const),
          fingerprint: hash(current),
          present2d: current.present2d,
          records2d: current.records2d,
          buildingNames2d: current.buildingNames2d,
          present3d: current.present3d,
          nonempty3d: current.nonempty3d,
          added,
          removed,
          changed,
          requiresChangeReview,
          reviewReasons: [
            ...new Set(
              current.groups.flatMap(group =>
                group.assertions.flatMap(assertion =>
                  assertion.unitCount > 0 ? assertion.reviewReasons : [],
                ),
              ),
            ),
          ].sort(),
          reviewStatus: 'pending' as const,
        })
        previous = current
      }
      return {
        name,
        first3dSourceRelease: sourceReleases3d[0]!,
        sourceReleases2d,
        sourceReleases3d,
        timeline,
      }
    })
    .sort(
      (a, b) =>
        a.first3dSourceRelease.localeCompare(b.first3dSourceRelease) ||
        a.name.localeCompare(b.name),
    )
  const cohort = new Set(names)
  const all2dNames = [
    ...new Set(reports.flatMap(report => report.estates2d.map(estate => estate.name))),
  ].sort()
  return {
    estates,
    excluded2dOnly: all2dNames
      .filter(name => !cohort.has(name))
      .map(name => {
        const releases = reports
          .filter(report => report.estates2d.some(estate => estate.name === name))
          .map(report => report.release)
        return {
          name,
          sourceReleases: releases,
          reason: 'never_present_in_retained_als_3d_files',
        }
      }),
  }
}
