import type { HkgovAlsIdentityDriftCandidate } from './hkgovAlsDrift.ts'

export type HkgovAlsManualReviewEntry = {
  identifierPairs: string[]
  release: string
}

export type HkgovAlsManualReviewClassification = {
  newId: HkgovAlsIdentityDriftCandidate[]
  retainId: HkgovAlsIdentityDriftCandidate[]
  unmatchedRetainEntries: HkgovAlsManualReviewEntry[]
}

/**
 * Read the intentionally lightweight review document. The matching key is the
 * release plus ALS's CSU/GeoAddress pair, not its display text, so harmless
 * formatting edits in the manual document do not change the decision.
 */
export function parseHkgovAlsManualRetainIdReview(markdown: string) {
  const entries: HkgovAlsManualReviewEntry[] = []
  let release: string | null = null
  let identifierPairs: string[] = []

  const flush = () => {
    if (release && identifierPairs.length > 0) {
      entries.push({ identifierPairs: [...new Set(identifierPairs)], release })
    }
    identifierPairs = []
  }

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine
      .trim()
      .replace(/^\|\s?/, '')
      .replace(/\s?\|$/, '')
      .trim()
    const nextRelease = /^(20\d{2}-\d{2}-\d{2}\.\d{4})$/.exec(line)?.[1]
    if (nextRelease) {
      flush()
      release = nextRelease
      continue
    }
    if (!release || !line || /^(?:Block|Building|Estate|Phase|Unit) /i.test(line)) {
      continue
    }
    const values = line
      .split('·')
      .map(value => value.trim())
      .filter(Boolean)
    if (values.length < 3) continue
    const geoAddress = values.at(-1)
    const csuId = values.at(-2)
    if (csuId && geoAddress && /\d/.test(csuId) && /\d/.test(geoAddress)) {
      identifierPairs.push(`${csuId}\u0000${geoAddress}`)
    }
  }
  flush()
  return entries
}

export function classifyHkgovAlsBlockHouseTowerManualReview(
  candidates: HkgovAlsIdentityDriftCandidate[],
  retainEntries: HkgovAlsManualReviewEntry[],
): HkgovAlsManualReviewClassification {
  const usedEntries = new Set<number>()
  const retainId: HkgovAlsIdentityDriftCandidate[] = []
  const newId: HkgovAlsIdentityDriftCandidate[] = []

  for (const candidate of candidates) {
    const pairs = new Set([
      identityIdentifierPair(candidate.previous),
      identityIdentifierPair(candidate.current),
    ])
    const matchingEntryIndex = retainEntries.findIndex(
      (entry, index) =>
        entry.release === candidate.current.sourceVersion &&
        entry.identifierPairs.some(pair => pairs.has(pair)) &&
        !usedEntries.has(index),
    )
    if (matchingEntryIndex >= 0) {
      usedEntries.add(matchingEntryIndex)
      retainId.push(candidate)
    } else {
      // The reviewer has explicitly defined the complement of the retain file as
      // a new premise. This rule is deliberately restricted to this reviewed set.
      newId.push(candidate)
    }
  }

  return {
    newId,
    retainId,
    unmatchedRetainEntries: retainEntries.filter((_, index) => !usedEntries.has(index)),
  }
}

function identityIdentifierPair(candidate: HkgovAlsIdentityDriftCandidate['current']) {
  return `${candidate.summary.csuId ?? ''}\u0000${candidate.summary.geoAddress ?? ''}`
}
