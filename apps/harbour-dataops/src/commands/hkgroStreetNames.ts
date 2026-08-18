import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { log, outro, spinner } from '@clack/prompts'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')
const DEFAULT_ARCHIVE_DIR = join(REPO_ROOT, 'data/hku/hkgro/street-name')
const HKGRO_ORIGIN = 'https://sunzi.lib.hku.hk/hkgro'
const HKGRO_HOST = new URL(HKGRO_ORIGIN).hostname
const HKGRO_FIRST_YEAR = 1842
const HKGRO_LAST_YEAR = 1941
const HKGRO_MISSING_TOC_YEARS = new Set([1849, 1850, 1851, 1852])
const HKGRO_REQUEST_TIMEOUT_MS = 45_000
const HKGRO_MAX_PDF_BYTES = 256 * 1024 * 1024
const STREET_NAME_PATTERNS: Array<[string, RegExp]> = [
  ['street', /\bstreet\b/i],
  ['road', /\broad\b/i],
  ['lane', /\blane\b/i],
  ['avenue', /\bavenue\b/i],
  ['terrace', /\bterrace\b/i],
  ['path', /\bpath\b/i],
  ['square', /\bsquare\b/i],
  ['gardens', /\bgardens\b/i],
  ['drive', /\bdrive\b/i],
  ['place', /\bplace\b/i],
  ['crescent', /\bcrescent\b/i],
  ['boulevard', /\bboulevard\b/i],
  ['fong', /\bfong\b/i],
  ['naming', /\bnaming\b/i],
  ['designation', /\bdesignation\b/i],
  ['names-of', /\bnames?\s+of\b/i],
  ['change-of-names', /\bchange\s+of\s+names?\b/i],
  ['alterations-in-names', /\balterations?\s+in\s+names?\b/i],
]

export type HkgroCandidateClassification =
  | 'not-candidate'
  | 'unclassified'
  | 'street-name'
  | 'not-street-name'
  | 'manual-review'
export type HkgroAssetStatus = 'not-requested' | 'pending' | 'retrieved' | 'unavailable'
export type HkgroTocRecord = {
  assetStatus: HkgroAssetStatus
  candidateReasons: string[]
  classification: HkgroCandidateClassification
  hkgroPdfId: string
  localPath: string
  notificationNumber: string | null
  officialUrl: string
  publicationDate: string | null
  retrievalFailure: string | null
  sha256: string | null
  subject: string
  byteLength: number | null
  year: number
}
export type HkgroStreetNameManifest = {
  indexYears: number[]
  records: HkgroTocRecord[]
  retrievedAt: string
  schemaVersion: 1
  source: 'hku-hkgro'
}
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Retrieve all HKGRO TOC rows and only broad street-name candidates. This is
 * evidence acquisition, not a LandsD lifecycle or R2 publication operation.
 */
export async function retrieveHkgroStreetNameArchive(input: {
  archiveDir: string
  fetcher?: Fetcher
  onProgress?: (message: string) => void
  years?: number[]
}): Promise<{
  candidateCount: number
  downloadedCount: number
  manifestPath: string
  recordCount: number
  reusedCount: number
  unavailableCount: number
}> {
  const archiveDir = resolve(input.archiveDir)
  const years = normaliseYears(input.years ?? availableHkgroYears())
  const fetcher = createHkgroSessionFetcher(input.fetcher ?? fetch)
  const manifestPath = join(archiveDir, 'manifest.json')
  const existing = await loadHkgroStreetNameManifest(manifestPath)
  const recordsByKey = new Map(
    existing.records.map(record => [hkgroRecordKey(record), record]),
  )
  for (const year of years) {
    input.onProgress?.(`indexing HKGRO table of contents for ${year}`)
    const html = await fetchHkgroToc(year, fetcher)
    for (const record of parseHkgroToc(year, html)) {
      const key = hkgroRecordKey(record)
      recordsByKey.set(key, preserveDownloadedAsset(record, recordsByKey.get(key)))
    }
  }
  const records = [...recordsByKey.values()].sort(compareHkgroRecords)
  let manifest: HkgroStreetNameManifest = {
    indexYears: [...new Set([...existing.indexYears, ...years])].sort((a, b) => a - b),
    records,
    retrievedAt: new Date().toISOString(),
    schemaVersion: 1,
    source: 'hku-hkgro',
  }
  await writeManifest(manifestPath, manifest)
  let downloadedCount = 0
  let reusedCount = 0
  let unavailableCount = 0
  const requestedYears = new Set(years)
  const candidates = records.filter(
    record => requestedYears.has(record.year) && record.candidateReasons.length > 0,
  )
  for (const [index, candidate] of candidates.entries()) {
    input.onProgress?.(
      `retrieving HKGRO candidate ${index + 1}/${candidates.length}: ${candidate.year}/${candidate.hkgroPdfId}`,
    )
    candidate.assetStatus = 'pending'
    candidate.retrievalFailure = null
    const asset = await retrieveCandidatePdf({ archiveDir, candidate, fetcher })
    if (asset.unavailable) {
      unavailableCount += 1
      candidate.assetStatus = 'unavailable'
      candidate.retrievalFailure = asset.failure
      continue
    }
    asset.reused ? reusedCount++ : downloadedCount++
    candidate.assetStatus = 'retrieved'
    candidate.byteLength = asset.byteLength
    candidate.sha256 = asset.sha256
  }
  manifest = { ...manifest, retrievedAt: new Date().toISOString() }
  await writeManifest(manifestPath, manifest)
  return {
    candidateCount: candidates.length,
    downloadedCount,
    manifestPath,
    recordCount: records.length,
    reusedCount,
    unavailableCount,
  }
}

export async function runHkgroStreetNameRetrieveCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (target.remote) {
    throw new Error(
      '`hkgov-hkgro-street-names:retrieve` is local-only. Use --target local; this command never uploads HKGRO evidence to R2.',
    )
  }
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error(
      'hkgov-hkgro-street-names:retrieve does not accept positional arguments.',
    )
  }
  const archiveDir =
    typeof args.options['out-dir'] === 'string'
      ? resolve(args.options['out-dir'])
      : DEFAULT_ARCHIVE_DIR
  const years = readYearsOption(args.options.year)
  const progress = spinner({ withGuide: false })
  let active = false
  try {
    const result = await retrieveHkgroStreetNameArchive({
      archiveDir,
      ...(years ? { years } : {}),
      onProgress: message => {
        if (active) progress.message(`HKGRO street names: ${message}`)
        else {
          progress.start(`HKGRO street names: ${message}`)
          active = true
        }
      },
    })
    if (active) progress.stop('HKGRO street-name retrieval complete')
    log.success(
      `Indexed ${result.recordCount} HKGRO TOC records; ${result.candidateCount} candidates (${result.downloadedCount} downloaded, ${result.reusedCount} reused, ${result.unavailableCount} unavailable); manifest: ${result.manifestPath}`,
    )
    outro('HKGRO street-name source retrieval complete')
  } catch (error) {
    if (active)
      progress.error(
        `HKGRO street names: ${error instanceof Error ? error.message : String(error)}`,
      )
    throw error
  }
}

/** Parse every PDF link in a single annual HKGRO table of contents. */
export function parseHkgroToc(year: number, html: string): HkgroTocRecord[] {
  assertHkgroYear(year)
  let publicationDate: string | null = null
  const records: HkgroTocRecord[] = []
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const row = match[1] ?? ''
    const date = parseHkgroDate(stripHtml(row))
    if (/colspan\s*=\s*["']?2/i.test(row) && date) {
      publicationDate = date
      continue
    }
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(
      cell => cell[1] ?? '',
    )
    if (cells.length < 2) continue
    const notificationNumber = normaliseText(stripHtml(cells[0] ?? '')) || null
    for (const anchor of cells
      .slice(1)
      .join(' ')
      .matchAll(
        /<a\b[^>]*href\s*=\s*["']((?:[^"']*\/)?view\/g(\d{4})\/(\d+)\.pdf)["'][^>]*>([\s\S]*?)<\/a\s*>/gi,
      )) {
      const linkYear = Number(anchor[2])
      const hkgroPdfId = anchor[3]
      const subject = normaliseText(stripHtml(anchor[4] ?? ''))
      if (linkYear !== year || !hkgroPdfId || !subject) continue
      const candidateReasons = hkgroCandidateReasons(subject)
      records.push({
        assetStatus: candidateReasons.length ? 'pending' : 'not-requested',
        candidateReasons,
        classification: candidateReasons.length ? 'unclassified' : 'not-candidate',
        hkgroPdfId,
        localPath: hkgroLocalPath(year, hkgroPdfId),
        notificationNumber,
        officialUrl: hkgroPdfUrl(year, hkgroPdfId),
        publicationDate,
        retrievalFailure: null,
        sha256: null,
        subject,
        byteLength: null,
        year,
      })
    }
  }
  if (!records.length)
    throw new Error(
      `HKGRO ${year} TOC did not contain valid PDF records; the upstream layout may have changed.`,
    )
  return records
}

export function hkgroCandidateReasons(subject: string) {
  return STREET_NAME_PATTERNS.flatMap(([reason, pattern]) =>
    pattern.test(subject) ? [reason] : [],
  )
}
export function hkgroPdfUrl(year: number, hkgroPdfId: string) {
  assertHkgroPdfIdentity(year, hkgroPdfId)
  return `${HKGRO_ORIGIN}/view/g${year}/${hkgroPdfId}.pdf`
}
export function hkgroLocalPath(year: number, hkgroPdfId: string) {
  assertHkgroPdfIdentity(year, hkgroPdfId)
  return `data/hku/hkgro/street-name/${year}/${hkgroPdfId}.pdf`
}

function preserveDownloadedAsset(
  record: HkgroTocRecord,
  previous: HkgroTocRecord | undefined,
): HkgroTocRecord {
  if (!previous) return record
  if (previous.officialUrl !== record.officialUrl)
    throw new Error(
      `HKGRO record identity changed for ${record.year}/${record.hkgroPdfId}.`,
    )
  return {
    ...record,
    classification:
      previous.classification === 'unclassified' ||
      previous.classification === 'not-candidate'
        ? record.classification
        : previous.classification,
    assetStatus: previous.sha256 ? 'retrieved' : record.assetStatus,
    retrievalFailure: previous.sha256 ? null : previous.retrievalFailure,
    sha256: previous.sha256,
    byteLength: previous.byteLength,
  }
}

async function retrieveCandidatePdf(input: {
  archiveDir: string
  candidate: HkgroTocRecord
  fetcher: Fetcher
}) {
  const path = resolveArchivePath(input.archiveDir, input.candidate.localPath)
  if (existsSync(path)) {
    const verified = validatePdfBytes(input.candidate, await readFile(path), path)
    if (
      input.candidate.byteLength !== null &&
      input.candidate.byteLength !== verified.byteLength
    ) {
      throw new Error(
        `HKGRO ${input.candidate.year}/${input.candidate.hkgroPdfId} local byte-length mismatch at ${path}: manifest ${input.candidate.byteLength}, file ${verified.byteLength}.`,
      )
    }
    if (input.candidate.sha256 !== null && input.candidate.sha256 !== verified.sha256) {
      throw new Error(
        `HKGRO ${input.candidate.year}/${input.candidate.hkgroPdfId} local SHA-256 mismatch at ${path}: manifest ${input.candidate.sha256}, file ${verified.sha256}.`,
      )
    }
    return { ...verified, reused: true, unavailable: false as const }
  }
  const response = await input.fetcher(input.candidate.officialUrl)
  if (!response.ok)
    throw new Error(
      `HKGRO PDF download failed for ${input.candidate.year}/${input.candidate.hkgroPdfId} (${input.candidate.subject}): ${response.status} ${response.statusText}; ${input.candidate.officialUrl}`,
    )
  const bytes = await readResponseBytes(
    response,
    HKGRO_MAX_PDF_BYTES,
    `HKGRO ${input.candidate.year}/${input.candidate.hkgroPdfId} PDF`,
  )
  if (bytes.byteLength === 0) {
    return {
      failure: `HKGRO returned an empty application/pdf response for ${input.candidate.year}/${input.candidate.hkgroPdfId} (${input.candidate.subject}); ${input.candidate.officialUrl}`,
      unavailable: true as const,
    }
  }
  const verified = validatePdfBytes(input.candidate, bytes, input.candidate.officialUrl)
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(path, bytes, { flag: 'wx' })
  } catch (error) {
    // Another resumable run (or a repeated HKGRO TOC row) can finish the
    // immutable write after the existence check above. Reuse it only when the
    // file is a valid byte-for-byte match for this response.
    if (!isFileAlreadyExistsError(error)) throw error
    const existing = validatePdfBytes(input.candidate, await readFile(path), path)
    if (
      existing.byteLength !== verified.byteLength ||
      existing.sha256 !== verified.sha256
    ) {
      throw new Error(
        `HKGRO ${input.candidate.year}/${input.candidate.hkgroPdfId} local PDF was created concurrently with different bytes at ${path}; downloaded ${verified.sha256}/${verified.byteLength}, local ${existing.sha256}/${existing.byteLength}.`,
      )
    }
    return { ...existing, reused: true, unavailable: false as const }
  }
  return { ...verified, reused: false, unavailable: false as const }
}

async function readResponseBytes(response: Response, maxBytes: number, label: string) {
  const contentLength = response.headers.get('content-length')
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte download limit.`)
  }
  if (!response.body) return Buffer.alloc(0)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > maxBytes) {
      await reader.cancel()
      throw new Error(`${label} exceeds the ${maxBytes}-byte download limit.`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks, byteLength)
}

function isFileAlreadyExistsError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}

function validatePdfBytes(
  candidate: HkgroTocRecord,
  bytes: Uint8Array,
  location: string,
) {
  if (
    bytes.byteLength < 5 ||
    Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-'
  ) {
    throw new Error(
      `HKGRO PDF is not a valid PDF for ${candidate.year}/${candidate.hkgroPdfId} (${candidate.subject}) at ${location}; expected a %PDF- header, received ${describeLeadingBytes(bytes)}.`,
    )
  }
  return {
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function fetchHkgroToc(year: number, fetcher: Fetcher) {
  const url = `${HKGRO_ORIGIN}/browseGa.jsp?the_year=${year}`
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetcher(url)
    if (!response.ok)
      throw new Error(
        `HKGRO TOC download failed for ${year}: ${response.status} ${response.statusText}; ${url}`,
      )
    const html = await response.text()
    if (/Hong Kong Government Gazette\s+\d{4}\s*<br>\s*Table of Contents/i.test(html))
      return html
  }
  throw new Error(
    `HKGRO TOC session setup failed for ${year}: the second request did not return a Government Gazette table of contents; ${url}.`,
  )
}

function createHkgroSessionFetcher(fetcher: Fetcher): Fetcher {
  let cookie = ''
  return async (input, init) => {
    const timeout = AbortSignal.timeout(HKGRO_REQUEST_TIMEOUT_MS)
    const requestUrl = new URL(input)
    const headers = new Headers(init?.headers)
    if (cookie && requestUrl.hostname === HKGRO_HOST) headers.set('cookie', cookie)
    const request = async (redirect: 'manual' | 'follow') =>
      fetcher(input, { ...init, headers, redirect, signal: timeout }).catch(error => {
        if (timeout.aborted) {
          throw new Error(
            `HKGRO request timed out after ${HKGRO_REQUEST_TIMEOUT_MS / 1_000} seconds: ${input}.`,
          )
        }
        throw error
      })
    // The first request gives HKGRO's own JSESSIONID in a redirect. Do not
    // reconstruct the legacy redirect URLs: they contain literal JSP syntax
    // and modern URL normalisation changes their meaning. Instead capture the
    // origin cookie, then repeat the original request with normal redirect
    // handling. The next annual request returns the TOC directly.
    const initial = await request('manual')
    const value = initial.headers.get('set-cookie')
    if (value && requestUrl.hostname === HKGRO_HOST) {
      const cookies = value
        .split(/,(?=[^;]+=[^;]+)/)
        .map(item => item.split(';', 1)[0]?.trim())
        .filter((item): item is string => Boolean(item))
      if (cookies.length) cookie = cookies.join('; ')
    }
    if (initial.status >= 300 && initial.status < 400 && cookie) {
      headers.set('cookie', cookie)
      return request('follow')
    }
    return initial
  }
}

function availableHkgroYears() {
  return Array.from(
    { length: HKGRO_LAST_YEAR - HKGRO_FIRST_YEAR + 1 },
    (_, index) => HKGRO_FIRST_YEAR + index,
  ).filter(year => !HKGRO_MISSING_TOC_YEARS.has(year))
}
function normaliseYears(years: number[]) {
  const unique = [...new Set(years)].sort((a, b) => a - b)
  if (!unique.length) throw new Error('At least one HKGRO year is required.')
  for (const year of unique) {
    assertHkgroYear(year)
    if (HKGRO_MISSING_TOC_YEARS.has(year))
      throw new Error(
        `HKGRO has no published Government Gazette table of contents for ${year}.`,
      )
  }
  return unique
}
function readYearsOption(value: string | boolean | undefined) {
  if (value === undefined) return undefined
  if (typeof value !== 'string')
    throw new Error('`--year` requires one or more comma-separated four-digit years.')
  const values = value.split(',').map(part => part.trim())
  if (values.some(year => !/^\d{4}$/.test(year)))
    throw new Error('`--year` requires one or more comma-separated four-digit years.')
  return values.map(Number)
}
function parseHkgroDate(value: string) {
  const match = value.match(/\b(\d{2})-([A-Za-z]{3})-(\d{4})\b/)
  if (!match) return null
  const [, day, month, year] = match
  const monthNumber = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  }[month?.toLowerCase() ?? '']
  return monthNumber && day && year ? `${year}-${monthNumber}-${day}` : null
}
function normaliseText(value: string) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim()
}
function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ')
}
function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}
function compareHkgroRecords(left: HkgroTocRecord, right: HkgroTocRecord) {
  return `${left.year}\0${left.hkgroPdfId}`.localeCompare(
    `${right.year}\0${right.hkgroPdfId}`,
    undefined,
    { numeric: true },
  )
}
function hkgroRecordKey(record: HkgroTocRecord) {
  // HKGRO occasionally repeats a PDF link in more than one TOC row. Preserve
  // each bibliographic row in the manifest while allowing their local evidence
  // paths and hashes to be shared.
  return [
    record.year,
    record.hkgroPdfId,
    record.publicationDate ?? '',
    record.notificationNumber ?? '',
    record.subject,
  ].join('\0')
}
function assertHkgroYear(year: number) {
  if (!Number.isInteger(year) || year < HKGRO_FIRST_YEAR || year > HKGRO_LAST_YEAR)
    throw new Error(
      `HKGRO year must be between ${HKGRO_FIRST_YEAR} and ${HKGRO_LAST_YEAR}: ${year}.`,
    )
}
function assertHkgroPdfIdentity(year: number, hkgroPdfId: string) {
  assertHkgroYear(year)
  if (!/^\d+$/.test(hkgroPdfId))
    throw new Error(`Invalid HKGRO PDF identifier: ${hkgroPdfId}.`)
}
function resolveArchivePath(archiveDir: string, localPath: string) {
  if (isAbsolute(localPath))
    throw new Error(
      `HKGRO manifest localPath must be repository-relative: ${localPath}.`,
    )
  const canonical = resolve(REPO_ROOT, localPath)
  const suffix = relative(DEFAULT_ARCHIVE_DIR, canonical)
  if (suffix.startsWith('..') || isAbsolute(suffix))
    throw new Error(
      `HKGRO manifest localPath is outside its archive directory: ${localPath}.`,
    )
  return resolve(archiveDir, suffix)
}
export async function loadHkgroStreetNameManifest(
  manifestPath: string,
): Promise<HkgroStreetNameManifest> {
  if (!existsSync(manifestPath))
    return {
      indexYears: [],
      records: [],
      retrievedAt: '',
      schemaVersion: 1,
      source: 'hku-hkgro',
    }
  return validateManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
    manifestPath,
  )
}
async function writeManifest(path: string, manifest: HkgroStreetNameManifest) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
}
function validateManifest(value: unknown, path: string): HkgroStreetNameManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`HKGRO manifest must be an object: ${path}.`)
  const root = value as Record<string, unknown>
  if (
    root.schemaVersion !== 1 ||
    root.source !== 'hku-hkgro' ||
    !Array.isArray(root.indexYears) ||
    !Array.isArray(root.records)
  )
    throw new Error(
      `HKGRO manifest must be schema version 1 from hku-hkgro with indexYears and records: ${path}.`,
    )
  const indexYears = root.indexYears.map((year, index) => {
    if (typeof year !== 'number')
      throw new Error(`HKGRO manifest indexYears[${index}] must be a number.`)
    return year
  })
  normaliseYears(indexYears)
  return {
    indexYears,
    records: root.records.map((record, index) =>
      validateRecord(record, `${path}: records[${index}]`),
    ),
    retrievedAt: typeof root.retrievedAt === 'string' ? root.retrievedAt : '',
    schemaVersion: 1,
    source: 'hku-hkgro',
  }
}
function validateRecord(value: unknown, path: string): HkgroTocRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object.`)
  const record = value as Record<string, unknown>
  if (typeof record.year !== 'number' || typeof record.hkgroPdfId !== 'string')
    throw new Error(`${path} must include year and hkgroPdfId.`)
  assertHkgroPdfIdentity(record.year, record.hkgroPdfId)
  if (
    !Array.isArray(record.candidateReasons) ||
    !record.candidateReasons.every(reason => typeof reason === 'string')
  )
    throw new Error(`${path}.candidateReasons must be a string array.`)
  if (
    ![
      'not-candidate',
      'unclassified',
      'street-name',
      'not-street-name',
      'manual-review',
    ].includes(String(record.classification))
  )
    throw new Error(`${path}.classification is invalid.`)
  if (record.localPath !== hkgroLocalPath(record.year, record.hkgroPdfId))
    throw new Error(`${path}.localPath does not match its HKGRO identity.`)
  if (record.officialUrl !== hkgroPdfUrl(record.year, record.hkgroPdfId))
    throw new Error(`${path}.officialUrl does not match its HKGRO identity.`)
  if (typeof record.subject !== 'string' || !record.subject)
    throw new Error(`${path}.subject must be non-empty.`)
  if (
    record.byteLength !== null &&
    (!Number.isSafeInteger(record.byteLength) || (record.byteLength as number) < 1)
  )
    throw new Error(`${path}.byteLength must be null or a positive integer.`)
  if (
    record.sha256 !== null &&
    (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256))
  )
    throw new Error(`${path}.sha256 must be null or a lowercase SHA-256 digest.`)
  const assetStatus =
    record.assetStatus === undefined
      ? record.sha256
        ? 'retrieved'
        : record.candidateReasons.length > 0
          ? 'pending'
          : 'not-requested'
      : record.assetStatus
  if (
    assetStatus !== 'not-requested' &&
    assetStatus !== 'pending' &&
    assetStatus !== 'retrieved' &&
    assetStatus !== 'unavailable'
  )
    throw new Error(`${path}.assetStatus is invalid.`)
  if (
    record.retrievalFailure !== undefined &&
    record.retrievalFailure !== null &&
    typeof record.retrievalFailure !== 'string'
  )
    throw new Error(`${path}.retrievalFailure must be null or a string.`)
  return {
    ...record,
    assetStatus,
    retrievalFailure:
      typeof record.retrievalFailure === 'string' ? record.retrievalFailure : null,
  } as HkgroTocRecord
}
function describeLeadingBytes(bytes: Uint8Array) {
  return Buffer.from(bytes.subarray(0, 16)).toString('hex') || '(empty response)'
}
