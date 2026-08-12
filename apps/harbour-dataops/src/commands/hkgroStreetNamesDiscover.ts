import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { log, outro, spinner } from '@clack/prompts'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import {
  loadHkgroStreetNameManifest,
  type HkgroCandidateClassification,
  type HkgroTocRecord,
} from './hkgroStreetNames.ts'
import { hkgroOcrOutputPath } from './hkgroStreetNamesOcr.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')
const DEFAULT_ARCHIVE_DIR = join(REPO_ROOT, 'data/hku/hkgro/street-name')
const DEFAULT_REVIEW_PATH = join(DEFAULT_ARCHIVE_DIR, 'discovery/review.json')

export type HkgroStreetChangeKind =
  | 'absorption'
  | 'declaration'
  | 'deletion'
  | 'description-change'
  | 'designation'
  | 'name-change'

export type HkgroDiscoveryDecision = {
  classification: Exclude<
    HkgroCandidateClassification,
    'not-candidate' | 'unclassified'
  >
  kind: HkgroStreetChangeKind | null
  notes: string | null
  reviewedAt: string | null
}

type HkgroDiscoverySuggestion = {
  classification: 'manual-review' | 'not-street-name' | 'unclassified'
  kinds: HkgroStreetChangeKind[]
  reasons: string[]
  score: number
}

export type HkgroStreetDiscoveryRecord = {
  candidateReasons: string[]
  decision: HkgroDiscoveryDecision | null
  excerpt: string
  hkgroPdfId: string
  ocr: {
    outputPath: string
    sourceSha256: string
  }
  source: {
    byteLength: number
    localPath: string
    officialUrl: string
    sha256: string
  }
  reviewPages: Array<{
    excerpt: string
    pageNumber: number
  }>
  suggested: HkgroDiscoverySuggestion
  tocEntries: Array<{
    notificationNumber: string | null
    publicationDate: string | null
    subject: string
  }>
  year: number
}

export type HkgroStreetDiscoveryReview = {
  generatedAt: string
  records: HkgroStreetDiscoveryRecord[]
  schemaVersion: 1
  source: 'hku-hkgro-street-name-discovery'
}

type HkgroOcrResult = {
  source: { sha256: string }
  text: string
}

/**
 * Build a local, reviewable queue from the high-recall HKGRO retrieval set.
 * OCR only supplies ranking and excerpts; a curator must inspect the source
 * scan before accepting any street-history event.
 */
export async function discoverHkgroStreetNames(input: {
  archiveDir: string
  reviewPath?: string
}): Promise<{
  candidateCount: number
  manualReviewCount: number
  notStreetNameCount: number
  reviewPath: string
}> {
  const archiveDir = resolve(input.archiveDir)
  const reviewPath = input.reviewPath ? resolve(input.reviewPath) : DEFAULT_REVIEW_PATH
  const sourceManifest = await loadHkgroStreetNameManifest(
    join(archiveDir, 'manifest.json'),
  )
  const existing = await loadHkgroStreetDiscoveryReview(reviewPath)
  const previousByKey = new Map(
    existing.records.map(record => [discoveryKey(record), record]),
  )
  const grouped = groupRetrievedCandidates(sourceManifest.records)
  const records: HkgroStreetDiscoveryRecord[] = []

  for (const group of grouped) {
    const ocr = await loadOcrResult(archiveDir, group.year, group.hkgroPdfId)
    if (ocr.source.sha256 !== group.sha256) {
      throw new Error(
        `HKGRO OCR provenance differs from the retrieval manifest for ${group.year}/${group.hkgroPdfId}. Re-run OCR after repairing the source evidence.`,
      )
    }
    const suggested = suggestHkgroStreetClassification(group, ocr.text)
    const reviewPages = reviewPagesFor(ocr.text)
    const previous = previousByKey.get(`${group.year}\0${group.hkgroPdfId}`)
    records.push({
      candidateReasons: group.candidateReasons,
      decision: previous?.source.sha256 === group.sha256 ? previous.decision : null,
      excerpt: reviewPages[0]?.excerpt ?? excerptForReview(ocr.text),
      hkgroPdfId: group.hkgroPdfId,
      ocr: {
        outputPath: hkgroOcrOutputPath(group.year, group.hkgroPdfId),
        sourceSha256: ocr.source.sha256,
      },
      source: {
        byteLength: group.byteLength,
        localPath: group.localPath,
        officialUrl: group.officialUrl,
        sha256: group.sha256,
      },
      reviewPages,
      suggested,
      tocEntries: group.tocEntries,
      year: group.year,
    })
  }

  const review: HkgroStreetDiscoveryReview = {
    generatedAt: new Date().toISOString(),
    records,
    schemaVersion: 1,
    source: 'hku-hkgro-street-name-discovery',
  }
  await saveHkgroStreetDiscoveryReview(reviewPath, review)

  return {
    candidateCount: records.length,
    manualReviewCount: records.filter(
      record => record.suggested.classification === 'manual-review',
    ).length,
    notStreetNameCount: records.filter(
      record => record.suggested.classification === 'not-street-name',
    ).length,
    reviewPath,
  }
}

export async function runHkgroStreetNameDiscoverCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (target.remote) {
    throw new Error(
      '`hkgov-hkgro-street-names:discover` is local-only. It creates a local curator review queue and never uploads HKGRO scans or OCR.',
    )
  }
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error(
      'hkgov-hkgro-street-names:discover does not accept positional arguments.',
    )
  }
  const archiveDir =
    typeof args.options['out-dir'] === 'string'
      ? resolve(args.options['out-dir'])
      : DEFAULT_ARCHIVE_DIR
  const reviewPath =
    typeof args.options['review-file'] === 'string'
      ? resolve(args.options['review-file'])
      : join(archiveDir, 'discovery/review.json')
  const progress = spinner({ withGuide: false })
  progress.start('HKGRO street names: building curator review queue')
  try {
    const result = await discoverHkgroStreetNames({ archiveDir, reviewPath })
    progress.stop('HKGRO street-name discovery complete')
    log.success(
      `Prepared ${result.candidateCount} review records (${result.manualReviewCount} suggested for manual review; ${result.notStreetNameCount} likely incidental); review: ${result.reviewPath}`,
    )
    outro('HKGRO discovery remains local derived review data')
  } catch (error) {
    progress.error(
      `HKGRO street names: ${error instanceof Error ? error.message : String(error)}`,
    )
    throw error
  }
}

export function suggestHkgroStreetClassification(
  record: Pick<HkgroStreetDiscoveryRecord, 'tocEntries'> & {
    candidateReasons: string[]
  },
  text: string,
): HkgroDiscoverySuggestion {
  const title = record.tocEntries.map(entry => entry.subject).join('\n')
  const corpus = `${title}\n${text}`.replaceAll(/\s+/g, ' ')
  const reasons: string[] = []
  const kinds = new Set<HkgroStreetChangeKind>()
  let score = 0

  if (matchesNameChange(title)) {
    score += 90
    reasons.push('title: naming or name-change language with a street type')
    kinds.add('name-change')
  }
  if (matchesDesignation(title)) {
    score += 75
    reasons.push('title: street designation language')
    kinds.add('designation')
  }
  if (matchesNameChange(text)) {
    score += 55
    reasons.push('ocr: naming or name-change language with a street type')
    kinds.add('name-change')
  }
  if (matchesAbsorption(corpus)) {
    score += 50
    reasons.push(
      'ocr: part of a street ceases to form part of it and joins an existing street',
    )
    kinds.add('absorption')
  }
  if (matchesDesignation(text)) {
    score += 40
    reasons.push('ocr: street designation language')
    kinds.add('designation')
  }
  if (matchesDescriptionChange(corpus)) {
    score += 45
    reasons.push('ocr: material description-change language')
    kinds.add('description-change')
  }
  if (matchesDeletion(corpus)) {
    score += 35
    reasons.push('ocr: possible street deletion or closure language')
    kinds.add('deletion')
  }
  if (matchesDeclaration(corpus)) {
    score += 35
    reasons.push('ocr: possible street declaration language')
    kinds.add('declaration')
  }
  if (matchesIncidentalUse(title)) {
    score -= 70
    reasons.push('title: likely incidental street reference')
  }
  if (matchesIncidentalUse(text.slice(0, 2_000))) {
    score -= 25
    reasons.push('ocr: likely incidental street reference')
  }
  if (record.candidateReasons.includes('change-of-names')) score += 30
  if (record.candidateReasons.includes('alterations-in-names')) score += 30

  return {
    classification:
      score >= 45 ? 'manual-review' : score <= -35 ? 'not-street-name' : 'unclassified',
    kinds: [...kinds].sort(),
    reasons,
    score,
  }
}

function groupRetrievedCandidates(records: HkgroTocRecord[]) {
  const grouped = new Map<
    string,
    {
      byteLength: number
      candidateReasons: string[]
      hkgroPdfId: string
      localPath: string
      officialUrl: string
      sha256: string
      tocEntries: HkgroStreetDiscoveryRecord['tocEntries']
      year: number
    }
  >()
  for (const record of records) {
    if (
      record.assetStatus !== 'retrieved' ||
      record.candidateReasons.length === 0 ||
      record.byteLength === null ||
      record.sha256 === null
    ) {
      continue
    }
    const key = `${record.year}\0${record.hkgroPdfId}`
    const current = grouped.get(key)
    if (current) {
      if (
        current.sha256 !== record.sha256 ||
        current.byteLength !== record.byteLength
      ) {
        throw new Error(`HKGRO retrieval manifest has conflicting evidence for ${key}.`)
      }
      current.candidateReasons = [
        ...new Set([...current.candidateReasons, ...record.candidateReasons]),
      ].sort()
      current.tocEntries.push(toTocEntry(record))
      continue
    }
    grouped.set(key, {
      byteLength: record.byteLength,
      candidateReasons: [...record.candidateReasons].sort(),
      hkgroPdfId: record.hkgroPdfId,
      localPath: record.localPath,
      officialUrl: record.officialUrl,
      sha256: record.sha256,
      tocEntries: [toTocEntry(record)],
      year: record.year,
    })
  }
  return [...grouped.values()]
    .map(group => ({
      ...group,
      tocEntries: group.tocEntries.sort((left, right) =>
        `${left.publicationDate ?? ''}\0${left.notificationNumber ?? ''}\0${left.subject}`.localeCompare(
          `${right.publicationDate ?? ''}\0${right.notificationNumber ?? ''}\0${right.subject}`,
        ),
      ),
    }))
    .sort((left, right) =>
      `${left.year}\0${left.hkgroPdfId}`.localeCompare(
        `${right.year}\0${right.hkgroPdfId}`,
        undefined,
        { numeric: true },
      ),
    )
}

function toTocEntry(record: HkgroTocRecord) {
  return {
    notificationNumber: record.notificationNumber,
    publicationDate: record.publicationDate,
    subject: record.subject,
  }
}

async function loadOcrResult(
  archiveDir: string,
  year: number,
  hkgroPdfId: string,
): Promise<HkgroOcrResult> {
  const outputPath = resolveArchivePath(
    archiveDir,
    hkgroOcrOutputPath(year, hkgroPdfId),
  )
  if (!existsSync(outputPath)) {
    throw new Error(
      `HKGRO OCR output is missing for ${year}/${hkgroPdfId}: ${outputPath}. Run hkgov-hkgro-street-names:ocr first.`,
    )
  }
  let value: unknown
  try {
    value = JSON.parse(await readFile(outputPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `HKGRO OCR output is not valid JSON for ${year}/${hkgroPdfId}: ${outputPath}; ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`HKGRO OCR output must be an object: ${outputPath}.`)
  }
  const result = value as Partial<HkgroOcrResult>
  if (!result.source?.sha256 || !result.text?.trim()) {
    throw new Error(`HKGRO OCR output has no text or source hash: ${outputPath}.`)
  }
  return result as HkgroOcrResult
}

export async function loadHkgroStreetDiscoveryReview(
  path: string,
): Promise<HkgroStreetDiscoveryReview> {
  if (!existsSync(path)) {
    return {
      generatedAt: '',
      records: [],
      schemaVersion: 1,
      source: 'hku-hkgro-street-name-discovery',
    }
  }
  const value = JSON.parse(
    await readFile(path, 'utf8'),
  ) as Partial<HkgroStreetDiscoveryReview>
  if (
    value.schemaVersion !== 1 ||
    value.source !== 'hku-hkgro-street-name-discovery' ||
    !Array.isArray(value.records)
  ) {
    throw new Error(`HKGRO discovery review has an invalid schema: ${path}.`)
  }
  return value as HkgroStreetDiscoveryReview
}

export async function saveHkgroStreetDiscoveryReview(
  path: string,
  review: HkgroStreetDiscoveryReview,
) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(review, null, 2)}\n`, 'utf8')
}

function excerptForReview(text: string) {
  const match =
    /(?:change|alteration|naming|designation|description|delet|close|abolish).{0,240}/i.exec(
      text.replaceAll(/\s+/g, ' '),
    )
  return (match?.[0] ?? text.replaceAll(/\s+/g, ' ').slice(0, 280)).trim()
}

function reviewPagesFor(text: string) {
  const pages = text.split(/\n?\f\n?/)
  const matches = pages.flatMap((page, index) =>
    reviewSignalPattern.test(page)
      ? [{ excerpt: excerptForReview(page), pageNumber: index + 1 }]
      : [],
  )
  return matches.length > 0
    ? matches
    : [{ excerpt: excerptForReview(pages[0] ?? text), pageNumber: 1 }]
}

const reviewSignalPattern =
  /(?:change|alteration|naming|designation|description|delet|close|abolish)/i

function matchesNameChange(value: string) {
  return /(?:change|alteration|renam(?:e|ing)|naming|names?)\w*[^.]{0,100}\b(?:street|road|lane|place|path|terrace|avenue|square|fong)\b/i.test(
    value,
  )
}

/**
 * Historical notices can move a street or section into a street that already
 * exists. This is not a conventional rename: the source identity ends and
 * the surviving street gains an extent. Keep it separate for later reviewed
 * lifecycle resolution.
 */
function matchesAbsorption(value: string) {
  return /\b(?:part|section)\s+of\b[\s\S]{0,240}\bcease\s+to\s+form\s+part\s+of\b[\s\S]{0,240}\b(?:known\s+as|form\s+part\s+of|joined\s+to)\b/i.test(
    value,
  )
}

function matchesDesignation(value: string) {
  return /(?:designation|designated|designate)[^.]{0,100}\b(?:street|road|lane|place|path|terrace|avenue|square|fong)\b/i.test(
    value,
  )
}

function matchesDescriptionChange(value: string) {
  return /(?:description|described)[^.]{0,100}\b(?:change|alteration|replace|amend|street|road|lane|place|path|terrace|avenue|square|fong)\b/i.test(
    value,
  )
}

function matchesDeletion(value: string) {
  return /(?:delete|deletion|abolish|close|closure|discontinue)[^.]{0,100}\b(?:street|road|lane|place|path|terrace|avenue|square|fong)\b/i.test(
    value,
  )
}

function matchesDeclaration(value: string) {
  return /(?:declared|declare|shall be|will be|hereby named|hereafter known)[^.]{0,100}\b(?:street|road|lane|place|path|terrace|avenue|square|fong)\b/i.test(
    value,
  )
}

function matchesIncidentalUse(value: string) {
  return /\b(?:tender|repair|drainage|sewer|land sale|auction sale|street cries|house number|numbering of houses|assessment|ratepayer)\b/i.test(
    value,
  )
}

function discoveryKey(record: Pick<HkgroStreetDiscoveryRecord, 'year' | 'hkgroPdfId'>) {
  return `${record.year}\0${record.hkgroPdfId}`
}

function resolveArchivePath(archiveDir: string, localPath: string) {
  if (isAbsolute(localPath)) {
    throw new Error(`HKGRO local path must be repository-relative: ${localPath}.`)
  }
  const canonical = resolve(REPO_ROOT, localPath)
  const suffix = relative(DEFAULT_ARCHIVE_DIR, canonical)
  if (suffix.startsWith('..') || isAbsolute(suffix)) {
    throw new Error(`HKGRO local path is outside its archive directory: ${localPath}.`)
  }
  return resolve(archiveDir, suffix)
}
