import { recordCacheKey, type PlaceRecordCache } from './placeRecordCache.ts'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import type {
  AddressObservation,
  AddressResolution,
  PreviousAddressLink,
  SupplementaryCuration,
} from './supplementaryPlaceAddress.ts'

export function reuseAddressAnalysis(
  analyse: (
    observation: AddressObservation,
    previous: PreviousAddressLink | null,
  ) => AddressResolution,
  definitions: PlaceAddressDefinition[],
  officialIds: Set<string>,
  geometry: Map<string, { lng: number; lat: number }>,
  fixture: SupplementaryCuration,
  recordCache?: PlaceRecordCache,
  compactResolved = false,
) {
  const resolve = (
    observation: AddressObservation,
    previous: PreviousAddressLink | null,
  ) => {
    const result = analyse(observation, previous)
    return compactResolved && result.tier !== 'review'
      ? { ...result, candidates: [], parsed: [] }
      : result
  }
  if (!recordCache) return resolve
  const context = recordCacheKey([
    definitions,
    [...officialIds].sort(),
    [...geometry].sort(([a], [b]) => a.localeCompare(b)),
    fixture.activePolicy,
    fixture.policies,
  ])
  let decisions = fixture.decisions
  let entries = fixture.entries
  let decisionCount = -1
  let entryCount = -1
  let byPlaceDecisions = new Map<string, typeof fixture.decisions>()
  let byPlaceEntries = new Map<string, typeof fixture.entries>()
  return (
    observation: AddressObservation,
    previous: PreviousAddressLink | null,
  ): AddressResolution => {
    if (decisions !== fixture.decisions || decisionCount !== fixture.decisions.length) {
      decisions = fixture.decisions
      decisionCount = decisions.length
      byPlaceDecisions = Map.groupBy(decisions, row => row.placeId)
    }
    if (entries !== fixture.entries || entryCount !== fixture.entries.length) {
      entries = fixture.entries
      entryCount = entries.length
      byPlaceEntries = Map.groupBy(entries, row => row.placeId)
    }
    const selectedDecisions = (byPlaceDecisions.get(observation.placeId) ?? []).filter(
      row => row.sourceRelease <= observation.sourceRelease,
    )
    // Same-release decisions can mutate the curation ledger. Always execute them.
    if (selectedDecisions.some(row => row.sourceRelease === observation.sourceRelease))
      return resolve(observation, previous)
    const selectedEntries = (byPlaceEntries.get(observation.placeId) ?? []).filter(
      row =>
        row.firstSeen <= observation.sourceRelease &&
        (!row.revokedAt || row.revokedAt > observation.sourceRelease),
    )
    const { sourceRelease: _, ...source } = observation
    const key = recordCacheKey([
      context,
      compactResolved,
      source,
      previous,
      selectedDecisions,
      selectedEntries,
    ])
    const cached = recordCache.get<AddressResolution>('address resolution', key)
    if (cached !== undefined) return cached
    const result = resolve(observation, previous)
    // Creating supplementary identities and checking shared identities has ledger side effects.
    if (
      result.tier !== 'supplementary' &&
      result.reason !== 'shared_address_base_drift'
    )
      recordCache.set('address resolution', key, result)
    return result
  }
}
