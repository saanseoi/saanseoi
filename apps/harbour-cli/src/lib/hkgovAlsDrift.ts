import type { HkgovAlsPremiseIdentityDescriptor } from './hkgovAlsIdentity.ts'

export type HkgovAlsIdentityRecord = Omit<
  HkgovAlsPremiseIdentityDescriptor,
  'numberlessIdentityKey'
> & {
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
 * exactly one historic premise. The sole automatic case is withdrawal of a building
 * name while every other premise component remains unchanged.
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
  const resolvedMatchMethods = new Map<string, string>()

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
      resolvedMatchMethods.set(record.identityKey, 'als-drift-decision')
      continue
    }
    if (decision?.resolution === 'new-id') continue
    if (isBuildingNameWithdrawal(prior, record)) {
      resolvedIds.set(record.identityKey, prior.id)
      resolvedMatchMethods.set(record.identityKey, 'als-building-name-withdrawal')
      continue
    }
    if (isBuildingEstateReassignment(prior, record)) {
      resolvedIds.set(record.identityKey, prior.id)
      resolvedMatchMethods.set(record.identityKey, 'als-building-estate-reassignment')
      continue
    }
    if (isStructuredBlockQualificationChange(prior, record)) {
      continue
    }
    candidates.push({ current: record, previous: prior })
  }

  return { candidates, resolvedIds, resolvedMatchMethods }
}

function isBuildingEstateReassignment(
  previous: HkgovAlsIdentityRecord,
  current: HkgovAlsIdentityRecord,
) {
  const fields = new Set([
    ...Object.keys(previous.summary),
    ...Object.keys(current.summary),
  ])
  if (
    ![...fields].every(
      field =>
        field === 'buildingName' ||
        field === 'estateName' ||
        (previous.summary[field] ?? null) === (current.summary[field] ?? null),
    )
  ) {
    return false
  }

  const previousNames = [previous.summary.buildingName, previous.summary.estateName]
    .filter((value): value is string => value != null)
    .map(normalizeName)
    .sort()
  const currentNames = [current.summary.buildingName, current.summary.estateName]
    .filter((value): value is string => value != null)
    .map(normalizeName)
    .sort()
  return (
    previousNames.length > 0 &&
    previousNames.length === currentNames.length &&
    previousNames.every((value, index) => value === currentNames[index])
  )
}

function normalizeName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()
}

/** A qualified block/house/tower and an unqualified premise are different addresses. */
function isStructuredBlockQualificationChange(
  previous: HkgovAlsIdentityRecord,
  current: HkgovAlsIdentityRecord,
) {
  return hasStructuredBlock(previous) !== hasStructuredBlock(current)
}

function hasStructuredBlock(record: HkgovAlsIdentityRecord) {
  return Boolean(record.summary.blockDescriptor && record.summary.blockNumber)
}

function isBuildingNameWithdrawal(
  previous: HkgovAlsIdentityRecord,
  current: HkgovAlsIdentityRecord,
) {
  if (!previous.summary.buildingName || current.summary.buildingName != null) {
    return false
  }
  const fields = new Set([
    ...Object.keys(previous.summary),
    ...Object.keys(current.summary),
  ])
  return [...fields].every(
    field =>
      field === 'buildingName' ||
      (previous.summary[field] ?? null) === (current.summary[field] ?? null),
  )
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
