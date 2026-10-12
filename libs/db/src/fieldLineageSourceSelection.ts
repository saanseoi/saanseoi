import type { ApiFieldInput } from './apiFieldInputs'

/** Select a producer resource without confusing its siblings with alternatives. */
export function selectFieldLineageSources<
  T extends { source: { resourceType?: string } },
>(
  resourceType: string,
  dataset: string,
  inputs: ApiFieldInput[],
  available: T[] | undefined,
): T[] {
  const companion =
    resourceType === 'place'
      ? inputs.find(
          input =>
            input.origin === 'registry' &&
            ['selectedDivisionSnapshot', 'selectedAddressSnapshot'].includes(
              input.fieldPath,
            ),
        )
      : undefined
  const expectedResource =
    companion && 'fieldPath' in companion
      ? companion.fieldPath === 'selectedDivisionSnapshot'
        ? 'division'
        : 'address'
      : resourceType.startsWith('statistic')
        ? 'divisionStatistic'
        : resourceType
  const matching = available?.filter(
    scope =>
      !scope.source.resourceType || scope.source.resourceType === expectedResource,
  )
  // Explicit companion datasets can supply a different resource (Addresses for
  // Places). Do not guess between several unmatched resource types.
  const sources = matching?.length
    ? matching
    : new Set(available?.map(scope => scope.source.resourceType)).size === 1
      ? available
      : []
  if (!sources?.length)
    throw new Error(
      `Source schema version missing for dataset ${dataset} (${expectedResource}).`,
    )
  return sources
}
