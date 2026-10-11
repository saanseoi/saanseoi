import { AsyncLocalStorage } from 'node:async_hooks'
import { sql, and, type SQL } from '@repo/db'

/** Request-owned membership sets. Empty groups mean no geographic restriction. */
export type GeographicFilterContext = {
  releaseSet: string
  groups: ReadonlyArray<ReadonlySet<string>>
  targetClasses?: string[]
  divisionClasses?: ReadonlyMap<string, string>
  crosswalkSelections?: Array<{
    sourceDomain: string
    sourceCohort: string
    sourceSnapshotId: string
  }>
  crosswalkGroups?: Array<
    Array<{ id: string; snapshotId: string; domain: string; cohort: string }>
  >
}
const storage = new AsyncLocalStorage<GeographicFilterContext>()
export const withGeographicFilters = <T>(
  context: GeographicFilterContext,
  run: () => T,
): T => storage.run(context, run)
export const geographicFilterContext = () => storage.getStore()
export function matchesGeographicMembership(
  ids: Iterable<string | null | undefined>,
  scope?: { snapshotId: string },
) {
  const context = storage.getStore()
  if (!context) return true
  const values = new Set(ids)
  return context.groups.every((group, index) => {
    const direct =
      context.targetClasses?.[index] === 'district'
        ? [...values].filter(
            id => id && context.divisionClasses?.get(id) === 'district',
          )
        : []
    const candidates = direct.length ? direct : [...values]
    return candidates.some(
      id =>
        id != null &&
        (group.has(id) ||
          (scope &&
            context.crosswalkGroups?.[index]?.some(
              row => row.id === id && row.snapshotId === scope.snapshotId,
            ))),
    )
  })
}
/** The SQL argument returns a JSON array of the resource's actual Division IDs. */
export function geographicMembershipSql(
  ids: SQL,
  scope?: { snapshotId?: SQL; domain?: SQL; cohort?: SQL },
  selectIds?: (targetClass: string) => SQL,
): SQL | undefined {
  const context = storage.getStore()
  if (!context?.groups.length) return undefined
  return and(
    ...context.groups.map((group, index) => {
      const selectedIds =
        selectIds && context.targetClasses?.[index]
          ? selectIds(context.targetClasses[index]!)
          : ids
      const direct = sql`exists (select 1 from json_each(${selectedIds}) membership join json_each(${JSON.stringify([...group])}) allowed on allowed.value = membership.value)`
      const crosswalk = context.crosswalkGroups?.[index]
      if (!scope || !crosswalk?.length) return direct
      const version = scope.snapshotId
        ? sql`json_extract(link.value, '$.snapshotId') = ${scope.snapshotId}`
        : sql`json_extract(link.value, '$.domain') = ${scope.domain} and json_extract(link.value, '$.cohort') = ${scope.cohort}`
      return sql`(${direct} or exists (select 1 from json_each(${selectedIds}) membership join json_each(${JSON.stringify(crosswalk)}) link on json_extract(link.value, '$.id') = membership.value where ${version}))`
    }),
  )
}
export function geographicMembershipRaw(
  idsExpression: string,
  bind: (value: string) => string,
  snapshotExpression?: string,
) {
  const context = storage.getStore()
  return (
    context?.groups
      .map((group, index) => {
        const direct = `EXISTS (SELECT 1 FROM json_each(${idsExpression}) membership JOIN json_each(${bind(JSON.stringify([...group]))}) allowed ON allowed.value = membership.value)`
        const links = context.crosswalkGroups?.[index]
        if (!snapshotExpression || !links?.length) return ` AND ${direct}`
        return ` AND (${direct} OR EXISTS (SELECT 1 FROM json_each(${idsExpression}) membership JOIN json_each(${bind(JSON.stringify(links))}) link ON json_extract(link.value, '$.id') = membership.value WHERE json_extract(link.value, '$.snapshotId') = ${snapshotExpression}))`
      })
      .join('') ?? ''
  )
}

export class GeographicCrosswalkUnavailableError extends Error {}

/** Dedicated address roles take precedence over inferred membership through a hood. */
export function matchesAddressGeographicMembership(
  relationships: Array<{ role: string; divisionId: string }>,
) {
  const context = storage.getStore()
  if (!context) return true
  return context.groups.every((group, index) => {
    const role = context.targetClasses?.[index]
    const direct = relationships.filter(row => row.role === role)
    const candidates = direct.length ? direct : relationships
    return candidates.some(row => group.has(row.divisionId))
  })
}
