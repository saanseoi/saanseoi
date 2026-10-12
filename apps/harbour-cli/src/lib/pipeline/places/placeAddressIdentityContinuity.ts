import type { PlaceIdentityDecision } from '@repo/core/pipeline/services/places/placeIdentity'
import type { PlaceHistoryState } from './processLocalPlaceSqlUploadTypes'
import type {
  SupplementaryCuration,
  SupplementaryDecision,
} from './supplementaryPlaceAddress'

/** Reconcile disposable defaults and generated entries against the exact canonical predecessor. */
export function reconcilePlaceAddressIdentityContinuity(input: {
  fixture: SupplementaryCuration
  defaults: SupplementaryDecision[]
  identities: ReadonlyMap<string, PlaceIdentityDecision>
  historyRows: PlaceHistoryState[]
  sourceRelease: string
  officialIds: ReadonlySet<string>
}) {
  const previous = new Map(input.historyRows.map(state => [state.row.id, state.row]))
  const active = new Map(
    input.fixture.entries
      .filter(
        entry =>
          entry.firstSeen <= input.sourceRelease &&
          (!entry.revokedAt || entry.revokedAt > input.sourceRelease),
      )
      .map(entry => [entry.placeId, entry]),
  )
  for (const [sourceId, identity] of input.identities) {
    if (active.has(sourceId)) continue
    const row = previous.get(identity.id)
    const priorIdentity = (
      row?.sources as { placeIdentity?: PlaceIdentityDecision } | null
    )?.placeIdentity
    if (!row?.address2dId || !priorIdentity) continue
    const entry = active.get(priorIdentity.sourceId)
    if (!entry || entry.addressId !== row.address2dId) continue
    // The analyser still requires identical address evidence and a reproducible base.
    const carried = {
      ...entry,
      placeId: sourceId,
      firstSeen: input.sourceRelease,
      acceptanceMode: 'automatic' as const,
    }
    input.fixture.entries.push(carried)
    active.set(sourceId, carried)
  }
  return input.defaults.filter(decision => {
    if (decision.sourceRelease !== input.sourceRelease) return true
    const identity = input.identities.get(decision.placeId)
    if (!identity) return true
    const row = previous.get(identity.id)
    const entry = active.get(decision.placeId)
    const expected = row?.address2dId ?? entry?.addressId ?? null
    if (decision.previousAddressId !== expected) return false
    return (
      !decision.addressId ||
      !!decision.address ||
      input.officialIds.has(decision.addressId) ||
      entry?.addressId === decision.addressId
    )
  })
}
