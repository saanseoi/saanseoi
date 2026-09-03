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
  const decisionPairs = new Set<string>()
  for (const decision of decisions.decisions) {
    const pair = `${decision.previousIdentityKey}\u0000${decision.currentIdentityKey}`
    if (decisionPairs.has(pair)) {
      throw new Error('Duplicate HKGov ALS identity decision.')
    }
    decisionPairs.add(pair)
  }
  return decisions as HkgovAlsIdentityDecisions
}

/**
 * Finds a likely renamed/re-described premise without silently treating it as the
 * old record. A match is only surfaced when the previous continuity key identifies
 * exactly one historic premise. A component may be withdrawn automatically only
 * when every other premise component remains unchanged.
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
  const resolvedPreviousRecords = new Map<string, HkgovAlsIdentityRecord>()

  for (const record of records) {
    const historicalIdentity = historyByIdentity.get(record.identityKey)
    if (historicalIdentity) {
      if (historicalIdentity.id !== record.id) {
        resolvedIds.set(record.identityKey, historicalIdentity.id)
        resolvedMatchMethods.set(record.identityKey, 'als-identity-history')
        resolvedPreviousRecords.set(record.identityKey, historicalIdentity)
      }
      continue
    }
    const prior = latestCanonicalPredecessor(
      historyByContinuity.get(record.continuityKey) ?? [],
      record.sourceVersion,
    )
    if (!prior || prior.identityKey === record.identityKey) continue
    // A site-part qualifier is a material address distinction, including for
    // older reviews recorded before this rule existed.
    if (isBuildingSitePartQualification(prior, record)) continue
    // These descriptive additions do not identify a different premise when the
    // street address and continuity anchor remain unchanged. This also takes
    // precedence over an older explicit new-id decision.
    if (isBuildingNameDetailRetention(prior, record)) {
      resolvedIds.set(record.identityKey, prior.id)
      resolvedMatchMethods.set(record.identityKey, 'als-building-name-detail')
      resolvedPreviousRecords.set(record.identityKey, prior)
      continue
    }
    const decision = decisionByPair.get(
      `${prior.identityKey}\u0000${record.identityKey}`,
    )
    if (decision?.resolution === 'keep-existing-id') {
      resolvedIds.set(record.identityKey, prior.id)
      resolvedMatchMethods.set(record.identityKey, 'als-drift-decision')
      resolvedPreviousRecords.set(record.identityKey, prior)
      continue
    }
    if (decision?.resolution === 'new-id') continue
    if (droppedAddressComponent(prior, record)) {
      resolvedIds.set(record.identityKey, prior.id)
      resolvedMatchMethods.set(record.identityKey, 'als-address-component-withdrawal')
      resolvedPreviousRecords.set(record.identityKey, prior)
      continue
    }
    if (isBuildingEstateReassignment(prior, record)) {
      resolvedIds.set(record.identityKey, prior.id)
      resolvedMatchMethods.set(record.identityKey, 'als-building-estate-reassignment')
      resolvedPreviousRecords.set(record.identityKey, prior)
      continue
    }
    if (isStructuredBlockQualificationChange(prior, record)) {
      continue
    }
    candidates.push({ current: record, previous: prior })
  }

  return { candidates, resolvedIds, resolvedMatchMethods, resolvedPreviousRecords }
}

/**
 * Selects the predecessor from the latest historical release only. A later
 * release may contain several identity entries for one continuity anchor, but
 * that is a split rather than a sequential chain and cannot identify one
 * predecessor safely.
 */
function latestCanonicalPredecessor(
  entries: HkgovAlsIdentityRecord[],
  currentSourceVersion: string,
) {
  const earlierEntries = entries.filter(
    entry => entry.sourceVersion < currentSourceVersion,
  )
  if (earlierEntries.length === 0) return undefined

  const latestSourceVersion = earlierEntries.reduce(
    (latest, entry) => (entry.sourceVersion > latest ? entry.sourceVersion : latest),
    earlierEntries[0]?.sourceVersion ?? '',
  )
  const latestEntries = earlierEntries.filter(
    entry => entry.sourceVersion === latestSourceVersion,
  )
  return latestEntries.length === 1 ? latestEntries[0] : undefined
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
    .map(normaliseName)
    .sort()
  const currentNames = [current.summary.buildingName, current.summary.estateName]
    .filter((value): value is string => value != null)
    .map(normaliseName)
    .sort()
  return (
    previousNames.length > 0 &&
    previousNames.length === currentNames.length &&
    previousNames.every((value, index) => value === currentNames[index])
  )
}

function normaliseName(value: string) {
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

/**
 * A new trailing block, tower, villa, house, or house-number qualifier narrows
 * a whole-building name to a particular part of that address site. It is a new
 * premise even when ALS has not placed the qualifier in structured block fields.
 */
function isBuildingSitePartQualification(
  previous: HkgovAlsIdentityRecord,
  current: HkgovAlsIdentityRecord,
) {
  const previousBuildingName = previous.summary.buildingName
  const currentBuildingName = current.summary.buildingName
  if (!currentBuildingName || !hasOnlyChangedBuildingName(previous, current)) {
    return false
  }
  if (!previousBuildingName) {
    return containsMaterialSitePartQualifier(currentBuildingName)
  }

  const previousName = normaliseBuildingName(previousBuildingName)
  const currentName = normaliseBuildingName(currentBuildingName)
  if (!currentName.startsWith(`${previousName} `)) return false

  const suffix = currentName.slice(previousName.length).trim()
  const rawSuffix = buildingNameSuffix(previousBuildingName, currentBuildingName)
  if (!suffix || isFirstPhaseOrStageDetail(rawSuffix)) return false
  if (isAggregateAlphaNumericDetail(rawSuffix)) return false
  if (
    hasFirstPhaseOrStageMember(rawSuffix) &&
    !containsMaterialSitePartQualifier(
      rawSuffix.replace(
        /^\(?(?:PHASE|STAGE)\s+(?:I|1|A)(?:\s*\/\s*[A-Z0-9]+)?\)?/i,
        '',
      ),
    )
  ) {
    return false
  }

  return (
    SITE_PART_BUILDING_SUFFIX.test(suffix) ||
    containsMaterialSitePartQualifier(rawSuffix) ||
    isStandaloneAlphaNumericSitePart(suffix)
  )
}

/**
 * Retains an ID for a descriptive building-name addition which does not name a
 * separate physical site part. The continuity key has already established that
 * the street address, number and point are unchanged.
 */
function isBuildingNameDetailRetention(
  previous: HkgovAlsIdentityRecord,
  current: HkgovAlsIdentityRecord,
) {
  if (
    !hasOnlyChangedBuildingName(previous, current) &&
    !hasOnlyChangedNameAndEstate(previous, current)
  ) {
    return false
  }

  const previousBuildingName = previous.summary.buildingName
  const currentBuildingName = current.summary.buildingName
  if (
    hasOnlyChangedNameAndEstate(previous, current) &&
    (isEstateLocationAddition(
      previous.summary.estateName,
      current.summary.estateName,
    ) ||
      (previous.summary.estateName == null &&
        current.summary.estateName != null &&
        isKnownLocationDetail(current.summary.estateName)))
  ) {
    return true
  }
  if (!previousBuildingName || !currentBuildingName) return false

  const suffix = buildingNameSuffix(previousBuildingName, currentBuildingName)
  if (!suffix) return false
  if (isAggregateAlphaNumericDetail(suffix)) return true
  if (isFirstPhaseOrStageDetail(suffix)) return true

  const detail = normaliseBuildingName(suffix)
  if (/\bCENTRAL\b/.test(detail)) return true
  if (/\b(?:BRANCH|CAMPUS)\b/.test(detail)) return true
  if (isLegalNameAddition(detail)) return true
  return isKnownLocationDetail(suffix)
}

function hasOnlyChangedBuildingName(
  previous: HkgovAlsIdentityRecord,
  current: HkgovAlsIdentityRecord,
) {
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

function hasOnlyChangedNameAndEstate(
  previous: HkgovAlsIdentityRecord,
  current: HkgovAlsIdentityRecord,
) {
  const fields = new Set([
    ...Object.keys(previous.summary),
    ...Object.keys(current.summary),
  ])
  return [...fields].every(
    field =>
      field === 'buildingName' ||
      field === 'estateName' ||
      (previous.summary[field] ?? null) === (current.summary[field] ?? null),
  )
}

function isEstateLocationAddition(
  previous: string | null | undefined,
  current: string | null | undefined,
) {
  if (!previous || !current) return false
  const previousName = normaliseName(previous)
  const currentName = normaliseName(current)
  if (!currentName.startsWith(`${previousName} `)) return false
  return isKnownLocationDetail(currentName.slice(previousName.length).trim())
}

function normaliseBuildingName(value: string) {
  return normaliseName(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const SITE_PART_QUALIFIER =
  '(?:NORTH(?:EAST|WEST|[ -]EAST|[ -]WEST)?|SOUTH(?:EAST|WEST|[ -]EAST|[ -]WEST)?|EAST|WEST|NE|NW|SE|SW|N|S|E|W|HIGH|LOW|CENTER|CENTRE|MIDDLE|ONE|TWO|THREE|[A-Z]\\d+|\\d+[A-Z]|\\d+|[IVXLCDM]+|[A-Z])'
const SITE_PART_DESCRIPTOR =
  '(?:BLOCK|BLKS?|TOWER|TWR|VILLA|HOUSE|HSE|HALLS?|SECTION|STAGE|WING|PHASE)'
const SITE_PART_BUILDING_SUFFIX = new RegExp(
  `^(?:${SITE_PART_DESCRIPTOR}\\s+${SITE_PART_QUALIFIER}(?:\\s+(?:AND\\s+)?${SITE_PART_QUALIFIER})*|${SITE_PART_QUALIFIER}\\s+${SITE_PART_DESCRIPTOR})$`,
)

function buildingNameSuffix(previous: string, current: string) {
  const previousName = normaliseName(previous)
  const currentName = normaliseName(current)
  if (!currentName.startsWith(`${previousName} `)) return ''
  return currentName.slice(previousName.length).trim()
}

function isFirstPhaseOrStageDetail(suffix: string) {
  const value = unwrapBuildingSuffix(suffix)
  return /^(?:PHASE|STAGE)\s+(?:I|1|A)(?:\s*\/\s*(?:[A-Z0-9]+))?$/i.test(value)
}

function hasFirstPhaseOrStageMember(suffix: string) {
  const value = unwrapBuildingSuffix(suffix)
  return /^(?:PHASE|STAGE)\s+(?:I|1|A)(?:\s*\/\s*[A-Z0-9]+)?\b/i.test(value)
}

function isAggregateAlphaNumericDetail(suffix: string) {
  const value = unwrapBuildingSuffix(suffix)
  return /^(?:[A-Z]\d+|\d+[A-Z])\s*\/\s*(?:[A-Z]\d+|\d+[A-Z])$/i.test(value)
}

function isStandaloneAlphaNumericSitePart(suffix: string) {
  const value = unwrapBuildingSuffix(suffix)
  return /^(?:[A-Z]\d+|\d+[A-Z])$/i.test(value)
}

function containsMaterialSitePartQualifier(suffix: string) {
  const value = normaliseBuildingName(suffix)
  return /\b(?:BLOCK|BLKS?|TOWER|TWR|VILLA|HOUSE|HSE|HALLS?|SECTION|STAGE|WING|PHASE)\b/.test(
    value,
  )
}

function unwrapBuildingSuffix(value: string) {
  return value.replace(/^\(\s*|\s*\)$/g, '').trim()
}

function isLegalNameAddition(detail: string) {
  return /\b(?:LTD|LIMITED|COMPANY\s+LIMITED)\b/.test(detail)
}

function isKnownLocationDetail(suffix: string) {
  const value = normaliseName(suffix)
  const location = value.match(/\(([^)]+)\)/)?.[1] ?? unwrapBuildingSuffix(value)
  if (!location || !/^[A-Z][A-Z .'-]*$/.test(location)) return false
  return /\b(?:CHAI WAN|CHEUNG SHA WAN|CONSTELLATION COVE|FU SHAN|HONG KONG|KOWLOON(?: EAST| CITY| TONG)?|KWAI CHUNG|KWAI FONG|LAI MUK SHUE|LEI MUK SHUE|MA ON SHAN|MORRISON HILL|NEW TERRITORIES|NORTH POINT|PLOVER COVE|POK HONG|SHA TIN(?: WAI)?|SHEUNG SHUI|SIU SAI WAN|SOUTH|SOUTH HORIZONS|TIN SHUI WAI|TSING YI|TSUEN WAN|TUEN MUN|TSEUNG KWAN O|TUNG SHING|WEST|YAUMATI|YUEN LONG)\b/.test(
    location,
  )
}

function droppedAddressComponent(
  previous: HkgovAlsIdentityRecord,
  current: HkgovAlsIdentityRecord,
) {
  const droppableFields = ['buildingName', 'estateName', 'phaseName'] as const
  const droppedFields = droppableFields.filter(
    field => previous.summary[field] != null && current.summary[field] == null,
  )
  if (droppedFields.length !== 1) return false

  const droppedField = droppedFields[0]
  const fields = new Set([
    ...Object.keys(previous.summary),
    ...Object.keys(current.summary),
  ])
  return [...fields].every(
    field =>
      field === droppedField ||
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
