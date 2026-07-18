import type { HkgovAlsPremiseIdentityDescriptor } from './hkgovAlsIdentity.ts'

export type HkgovAlsIdentityRecord = HkgovAlsPremiseIdentityDescriptor & {
  id: string
  sourceVersion: string
}

export type HkgovAlsIdentityHistory = {
  authority: 'hkgov-dpo'
  entries: HkgovAlsIdentityRecord[]
  version: 1
}

export type HkgovAlsIdentityDecision = {
  currentIdentityKey: string
  previousIdentityKey: string
  resolution: 'keep-existing-id' | 'new-id'
}

export type HkgovAlsIdentityDecisions = {
  authority: 'hkgov-dpo'
  decisions: HkgovAlsIdentityDecision[]
  version: 1
}

export type HkgovAlsIdentityDriftCandidate = {
  current: HkgovAlsIdentityRecord
  previous: HkgovAlsIdentityRecord
}

export function emptyHkgovAlsIdentityHistory(): HkgovAlsIdentityHistory {
  return { authority: 'hkgov-dpo', entries: [], version: 1 }
}

export function emptyHkgovAlsIdentityDecisions(): HkgovAlsIdentityDecisions {
  return { authority: 'hkgov-dpo', decisions: [], version: 1 }
}

export function parseHkgovAlsIdentityHistory(value: unknown): HkgovAlsIdentityHistory {
  const history = value as Partial<HkgovAlsIdentityHistory>
  if (
    history?.authority !== 'hkgov-dpo' ||
    history.version !== 1 ||
    !Array.isArray(history.entries)
  ) {
    throw new Error('Invalid HKGov ALS identity-history file.')
  }
  return history as HkgovAlsIdentityHistory
}

export function parseHkgovAlsIdentityDecisions(
  value: unknown,
): HkgovAlsIdentityDecisions {
  const decisions = value as Partial<HkgovAlsIdentityDecisions>
  if (
    decisions?.authority !== 'hkgov-dpo' ||
    decisions.version !== 1 ||
    !Array.isArray(decisions.decisions)
  ) {
    throw new Error('Invalid HKGov ALS identity-decisions file.')
  }
  return decisions as HkgovAlsIdentityDecisions
}

/**
 * Finds a likely renamed/re-described premise without silently treating it as the
 * old record. A match is only surfaced when the previous continuity key identifies
 * exactly one historic premise. The caller must obtain a decision before assigning
 * that premise's ID.
 */
export function resolveHkgovAlsIdentityDrift(
  records: HkgovAlsIdentityRecord[],
  history: HkgovAlsIdentityHistory,
  decisions: HkgovAlsIdentityDecisions,
) {
  const historyByIdentity = new Map(
    history.entries.map(entry => [entry.identityKey, entry]),
  )
  const historyByContinuity = new Map<string, HkgovAlsIdentityRecord[]>()
  for (const entry of history.entries) {
    const entries = historyByContinuity.get(entry.continuityKey) ?? []
    entries.push(entry)
    historyByContinuity.set(entry.continuityKey, entries)
  }
  const decisionByPair = new Map(
    decisions.decisions.map(decision => [
      `${decision.previousIdentityKey}\u0000${decision.currentIdentityKey}`,
      decision,
    ]),
  )
  const candidates: HkgovAlsIdentityDriftCandidate[] = []
  const resolvedIds = new Map<string, string>()

  for (const record of records) {
    if (historyByIdentity.has(record.identityKey)) continue
    const previous = historyByContinuity.get(record.continuityKey) ?? []
    if (previous.length !== 1) continue
    const prior = previous[0]
    if (!prior || prior.identityKey === record.identityKey) continue
    const decision = decisionByPair.get(
      `${prior.identityKey}\u0000${record.identityKey}`,
    )
    if (decision?.resolution === 'keep-existing-id') {
      resolvedIds.set(record.identityKey, prior.id)
      continue
    }
    if (decision?.resolution === 'new-id') continue
    candidates.push({ current: record, previous: prior })
  }

  return { candidates, resolvedIds }
}

export function mergeHkgovAlsIdentityHistory(
  history: HkgovAlsIdentityHistory,
  records: HkgovAlsIdentityRecord[],
): HkgovAlsIdentityHistory {
  const entries = new Map(history.entries.map(entry => [entry.identityKey, entry]))
  for (const record of records) entries.set(record.identityKey, record)
  return {
    authority: 'hkgov-dpo',
    entries: [...entries.values()].sort((left, right) =>
      left.identityKey.localeCompare(right.identityKey),
    ),
    version: 1,
  }
}
