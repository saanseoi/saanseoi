import type { ReleaseScopedStatsRow } from '@repo/db/metaSchema'
import { publicSaanseoiDivisionProperties } from '../../../publicSaanseoiDivisionProperties'
import {
  buildChurnStatsRows,
  buildDistrictDistributionStatsRows,
} from '../metrics/releaseStats'
import { buildSourceChurnCounts, type SourceChurnRecord } from './sourceChurn'

/** Count source-view content changes; retain internal evidence separately. */
export function buildSaanseoiDivisionSourceStats(
  previous: ReadonlyMap<string, SourceChurnRecord>,
  current: ReadonlyMap<string, SourceChurnRecord>,
): ReleaseScopedStatsRow[] {
  const project = (rows: ReadonlyMap<string, SourceChurnRecord>) =>
    new Map(
      [...rows].map(([id, row]) => [
        id,
        {
          ...row,
          properties: publicSaanseoiDivisionProperties(
            typeof row.properties === 'string'
              ? JSON.parse(row.properties)
              : (row.properties as Record<string, unknown> | null),
          ),
        },
      ]),
    )
  const before = project(previous)
  const after = project(current)
  const churn = buildSourceChurnCounts(before, after, properties =>
    String(properties?.class ?? 'unknown'),
  )
  const levels = buildSourceChurnCounts(before, after, properties =>
    properties?.level === null
      ? 'not_applicable'
      : String(properties?.level ?? 'unknown'),
  )
  const districts = new Map<string, number>()
  let localisedRecords = 0
  for (const [id, row] of current) {
    const properties =
      typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties
    localisedRecords += Object.values(properties.names ?? {}).filter(
      value =>
        value && typeof value === 'object' && 'name' in value && Boolean(value.name),
    ).length
    const ids = new Set<string>()
    if (properties.class === 'district') ids.add(id)
    for (const path of properties.hierarchies?.administrative ?? []) {
      for (const ancestor of path) {
        if (ancestor.class === 'district' && ancestor.id) ids.add(ancestor.id)
      }
    }
    for (const district of ids)
      districts.set(district, (districts.get(district) ?? 0) + 1)
  }
  const count = (
    category: string,
    value: number,
    table: string | null,
  ): ReleaseScopedStatsRow => ({
    category,
    measure: 'count',
    unit: 'count',
    value,
    dimension: table ? 'table' : null,
    dimensionValue: table,
  })
  return [
    ...buildChurnStatsRows(churn).map(row => ({
      ...row,
      dimension: row.dimension ? 'divisionType' : null,
    })),
    ...buildChurnStatsRows(levels)
      .filter(row => row.dimension)
      .map(row => ({ ...row, dimension: 'level' })),
    ...buildDistrictDistributionStatsRows(districts),
    count('records', current.size, null),
    count('records', current.size, 'divisions'),
    count('localised_records', localisedRecords, 'divisionsI18n'),
  ]
}
