import type { PlaceIdentityDecision } from '@repo/core/pipeline/services/places/placeIdentity'
import type { PlaceHistoryState } from './processLocalPlaceSqlUploadTypes'
import type {
  SupplementaryCuration,
  SupplementaryDecision,
} from './supplementaryPlaceAddress'
import { addressFingerprint } from './supplementaryPlaceAddress'

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
  const byAddress = new Map<string, typeof input.fixture.entries>()
  for (const entry of active.values()) {
    const entries = byAddress.get(entry.addressId) ?? []
    entries.push(entry)
    byAddress.set(entry.addressId, entries)
  }
  for (const [sourceId, identity] of input.identities) {
    if (active.has(sourceId)) continue
    const row = previous.get(identity.id)
    if (!row?.address2dId || !Array.isArray(row.addresses)) continue
    const fingerprint = addressFingerprint(row.addresses)
    const candidates = (byAddress.get(row.address2dId) ?? [])
      .filter(entry => entry.fingerprint === fingerprint)
      .sort((a, b) => a.placeId.localeCompare(b.placeId))
    const entry = candidates[0]
    if (!entry) continue
    // Exact predecessor membership and unchanged accepted Address evidence establish
    // continuity independently of public source-attribution representation.
    const contents = (value: typeof entry) =>
      JSON.stringify([value.identityKey, value.baseAddressId, value.values])
    if (candidates.some(candidate => contents(candidate) !== contents(entry))) continue
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
    // A prior attempt can persist the retirement before Place publication. The
    // same observation must replay that decision after its entry becomes inactive.
    if (
      expected === null &&
      decision.resolution === 'leave_unlinked' &&
      input.fixture.entries.some(
        retired =>
          retired.placeId === decision.placeId &&
          retired.addressId === decision.previousAddressId &&
          retired.firstSeen <= input.sourceRelease &&
          retired.revokedAt === input.sourceRelease,
      )
    )
      return true
    if (decision.previousAddressId !== expected) return false
    return (
      !decision.addressId ||
      !!decision.address ||
      input.officialIds.has(decision.addressId) ||
      entry?.addressId === decision.addressId
    )
  })
}
