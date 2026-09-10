import { createHash } from 'node:crypto'
import type { LandsdGovernmentNoticePdfEntry } from './landsdStreetTypes.ts'

export function matchingPdfEntries(
  entries: LandsdGovernmentNoticePdfEntry[],
  name: string,
  used: Set<number>,
) {
  return entries.filter(
    entry =>
      !used.has(entry.ordinal) &&
      normalisePdfName(entry.name) === normalisePdfName(name),
  )
}

/**
 * Name matching is exact after the PDF has been scoped to one notice. When a
 * name repeats, matching prior-notice references resolve the pair before the
 * per-notice ordinal. If neither is decisive, leave the pair unresolved.
 */
export function selectBilingualPdfEntries(input: {
  english: LandsdGovernmentNoticePdfEntry[]
  noticeOrdinal: number
  zhHant: LandsdGovernmentNoticePdfEntry[]
}) {
  const pairs = input.english.flatMap(englishEntry =>
    input.zhHant.map(zhHantEntry => ({ englishEntry, zhHantEntry })),
  )
  if (pairs.length === 0) return null
  if (pairs.length === 1) return pairs[0] ?? null

  const referenceMatched = pairs.filter(({ englishEntry, zhHantEntry }) => {
    const englishReferences = new Set(englishEntry.previousNoticeRefs)
    const zhHantReferences = new Set(zhHantEntry.previousNoticeRefs)
    return (
      englishReferences.size > 0 &&
      zhHantReferences.size > 0 &&
      sameStrings(englishReferences, zhHantReferences)
    )
  })
  if (referenceMatched.length === 1) return referenceMatched[0] ?? null

  const ordinalMatched = (
    referenceMatched.length > 0 ? referenceMatched : pairs
  ).filter(
    ({ englishEntry, zhHantEntry }) =>
      englishEntry.ordinal === input.noticeOrdinal &&
      zhHantEntry.ordinal === input.noticeOrdinal,
  )
  return ordinalMatched.length === 1 ? (ordinalMatched[0] ?? null) : null
}

/**
 * Historic PDFs sometimes wrap a name differently from the page listing, or
 * expose only an unstructured corrigendum. When both language PDFs contain
 * exactly one row per source-page row, their shared row ordinal is evidence
 * for pairing. This only carries parser evidence into the curation queue;
 * it never creates a lifecycle link without a reviewed decision.
 */
export function selectStructurallyAlignedPdfEntries(input: {
  english: LandsdGovernmentNoticePdfEntry[]
  noticeCount: number
  noticeOrdinal: number
  usedEnglish: Set<number>
  usedZhHant: Set<number>
  zhHant: LandsdGovernmentNoticePdfEntry[]
}) {
  if (
    input.english.length !== input.noticeCount ||
    input.zhHant.length !== input.noticeCount
  ) {
    return null
  }
  const englishEntry = input.english[input.noticeOrdinal]
  const zhHantEntry = input.zhHant[input.noticeOrdinal]
  if (
    !englishEntry ||
    !zhHantEntry ||
    input.usedEnglish.has(englishEntry.ordinal) ||
    input.usedZhHant.has(zhHantEntry.ordinal)
  ) {
    return null
  }
  return { englishEntry, zhHantEntry }
}

function normalisePdfName(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replaceAll(/\s+/g, ' ').trim()
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort()
}

export function sameStrings(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every(value => right.has(value))
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
