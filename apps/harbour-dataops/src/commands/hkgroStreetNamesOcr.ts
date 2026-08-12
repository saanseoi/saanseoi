import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { log, outro, spinner } from '@clack/prompts'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import {
  hkgroLocalPath,
  loadHkgroStreetNameManifest,
  type HkgroTocRecord,
} from './hkgroStreetNames.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')
const DEFAULT_ARCHIVE_DIR = join(REPO_ROOT, 'data/hku/hkgro/street-name')
const PADDLE_OCR_SCRIPT = join(
  REPO_ROOT,
  'apps/harbour-dataops/paddleocrTraditional.py',
)
const PADDLE_OCR_PYTHON =
  process.env.SAANSEOI_PADDLEOCR_PYTHON ??
  join(REPO_ROOT, 'apps/harbour-dataops/.venv/bin/python')
const OCR_LANGUAGE = 'en'
const OCR_RENDER_DPI = 300
const PADDLE_OCR_TIMEOUT_MS = readPositiveDuration(
  process.env.SAANSEOI_PADDLEOCR_TIMEOUT_MS,
  120_000,
)

type HkgroOcrStatus = 'complete' | 'unparseable'
type HkgroOcrWord = {
  confidence: number
  left: number
  text: string
  top: number
}
type HkgroOcrPage = {
  pageNumber: number
  rawPaddleOcrNdjson: string
  words: HkgroOcrWord[]
}
export type HkgroStreetNameOcrResult = {
  extraction: {
    engine: 'PaddleOCR'
    engineVersion: string
    language: 'en'
    method: 'ocr'
    model: string
    renderDpi: 300
  }
  pages: HkgroOcrPage[]
  schemaVersion: 1
  source: {
    byteLength: number
    hkgroPdfId: string
    localPath: string
    sha256: string
    year: number
  }
  text: string
}
type HkgroOcrManifestRecord = {
  failure: string | null
  hkgroPdfId: string
  outputPath: string
  processedAt: string
  sourceSha256: string
  status: HkgroOcrStatus
  year: number
}
type HkgroOcrManifest = {
  records: HkgroOcrManifestRecord[]
  schemaVersion: 1
  source: 'hku-hkgro-street-name-ocr'
  updatedAt: string
}
type HkgroOcrRunner = (input: {
  pdfPath: string
}) => Promise<Pick<HkgroStreetNameOcrResult, 'extraction' | 'pages' | 'text'>>

/**
 * OCR locally retrieved HKGRO street-name candidates. Results are separate
 * derived evidence: the scans remain immutable and their source hash is bound
 * into every OCR record.
 */
export async function ocrHkgroStreetNameArchive(input: {
  archiveDir: string
  onProgress?: (message: string) => void
  pdfIds?: string[]
  runner?: HkgroOcrRunner
  years?: number[]
}): Promise<{
  completeCount: number
  manifestPath: string
  reusedCount: number
  sourceCount: number
}> {
  const archiveDir = resolve(input.archiveDir)
  const sourceManifest = await loadHkgroStreetNameManifest(
    join(archiveDir, 'manifest.json'),
  )
  const requestedYears = input.years ? new Set(normaliseYears(input.years)) : null
  const requestedPdfIds = input.pdfIds ? new Set(normalisePdfIds(input.pdfIds)) : null
  const sources = uniqueRetrievedCandidates(sourceManifest.records).filter(
    record =>
      (!requestedYears || requestedYears.has(record.year)) &&
      (!requestedPdfIds || requestedPdfIds.has(record.hkgroPdfId)),
  )
  if (!sources.length) {
    throw new Error(
      `HKGRO street-name OCR found no retrieved candidate PDFs${requestedYears ? ` for year ${[...requestedYears].join(', ')}` : ''}${requestedPdfIds ? ` with HKGRO PDF ID ${[...requestedPdfIds].join(', ')}` : ''}. Run hkgov-hkgro-street-names:retrieve first.`,
    )
  }
  const manifestPath = join(archiveDir, 'ocr-manifest.json')
  const ocrManifest = await loadOcrManifest(manifestPath)
  const recordsByKey = new Map(
    ocrManifest.records.map(record => [ocrRecordKey(record), record]),
  )
  const runner = input.runner ?? ocrHkgroPdf
  let completeCount = 0
  let reusedCount = 0

  for (const [index, source] of sources.entries()) {
    input.onProgress?.(
      `OCR ${index + 1}/${sources.length}: ${source.year}/${source.hkgroPdfId} (${source.subject})`,
    )
    const sourcePath = resolveArchivePath(archiveDir, source.localPath)
    await validateSourcePdf(source, sourcePath)
    const outputPath = hkgroOcrOutputPath(source.year, source.hkgroPdfId)
    const existing = recordsByKey.get(ocrRecordKey(source))
    if (existing?.status === 'complete') {
      await validateStoredOcrResult({ archiveDir, outputPath, source })
      reusedCount += 1
      continue
    }
    try {
      const result = await runner({ pdfPath: sourcePath })
      const output: HkgroStreetNameOcrResult = {
        ...result,
        schemaVersion: 1,
        source: {
          byteLength: source.byteLength as number,
          hkgroPdfId: source.hkgroPdfId,
          localPath: source.localPath,
          sha256: source.sha256 as string,
          year: source.year,
        },
      }
      validateOcrResult(output, `${source.year}/${source.hkgroPdfId} OCR output`)
      await writeOcrResult({ archiveDir, outputPath, output, source })
      recordsByKey.set(ocrRecordKey(source), {
        failure: null,
        hkgroPdfId: source.hkgroPdfId,
        outputPath,
        processedAt: new Date().toISOString(),
        sourceSha256: source.sha256 as string,
        status: 'complete',
        year: source.year,
      })
      completeCount += 1
    } catch (error) {
      const detail = `HKGRO OCR failed for ${source.year}/${source.hkgroPdfId} (${source.subject}); source ${sourcePath}; ${error instanceof Error ? error.message : String(error)}`
      recordsByKey.set(ocrRecordKey(source), {
        failure: detail,
        hkgroPdfId: source.hkgroPdfId,
        outputPath,
        processedAt: new Date().toISOString(),
        sourceSha256: source.sha256 as string,
        status: 'unparseable',
        year: source.year,
      })
      await writeOcrManifest(manifestPath, recordsByKey)
      throw new Error(detail)
    }
  }
  await writeOcrManifest(manifestPath, recordsByKey)
  return { completeCount, manifestPath, reusedCount, sourceCount: sources.length }
}

export async function runHkgroStreetNameOcrCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (target.remote) {
    throw new Error(
      '`hkgov-hkgro-street-names:ocr` is local-only. Use --target local; this command never uploads HKGRO scans or derived OCR to R2.',
    )
  }
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error(
      'hkgov-hkgro-street-names:ocr does not accept positional arguments.',
    )
  }
  const archiveDir =
    typeof args.options['out-dir'] === 'string'
      ? resolve(args.options['out-dir'])
      : DEFAULT_ARCHIVE_DIR
  const years = readYearsOption(args.options.year)
  const pdfIds = readPdfIdsOption(args.options['hkgro-pdf-id'])
  const progress = spinner({ withGuide: false })
  let active = false
  try {
    const result = await ocrHkgroStreetNameArchive({
      archiveDir,
      ...(years ? { years } : {}),
      ...(pdfIds ? { pdfIds } : {}),
      onProgress: message => {
        if (active) progress.message(`HKGRO street names: ${message}`)
        else {
          progress.start(`HKGRO street names: ${message}`)
          active = true
        }
      },
    })
    if (active) progress.stop('HKGRO street-name OCR complete')
    log.success(
      `OCR complete for ${result.completeCount} HKGRO candidate PDFs (${result.reusedCount} validated existing results; ${result.sourceCount} total); manifest: ${result.manifestPath}`,
    )
    outro('HKGRO street-name OCR results remain local derived evidence')
  } catch (error) {
    if (active)
      progress.error(
        `HKGRO street names: ${error instanceof Error ? error.message : String(error)}`,
      )
    throw error
  }
}

export function hkgroOcrOutputPath(year: number, hkgroPdfId: string) {
  const sourcePath = hkgroLocalPath(year, hkgroPdfId)
  return sourcePath
    .replace(/\.pdf$/, '.ocr.json')
    .replace('/street-name/', '/street-name/ocr/')
}

function uniqueRetrievedCandidates(records: HkgroTocRecord[]) {
  const sources = new Map<string, HkgroTocRecord>()
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
    const previous = sources.get(key)
    if (
      previous &&
      (previous.sha256 !== record.sha256 || previous.byteLength !== record.byteLength)
    ) {
      throw new Error(
        `HKGRO retrieval manifest has conflicting evidence hashes for ${record.year}/${record.hkgroPdfId}. Repair the retrieval manifest before OCR.`,
      )
    }
    sources.set(key, record)
  }
  return [...sources.values()].sort((left, right) =>
    `${left.year}\0${left.hkgroPdfId}`.localeCompare(
      `${right.year}\0${right.hkgroPdfId}`,
      undefined,
      { numeric: true },
    ),
  )
}

async function ocrHkgroPdf(input: { pdfPath: string }) {
  const temporaryDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-ocr-'))
  try {
    const prefix = join(temporaryDir, 'page')
    await runCommand('pdftoppm', [
      '-r',
      String(OCR_RENDER_DPI),
      '-png',
      input.pdfPath,
      prefix,
    ])
    const images = (await readdir(temporaryDir))
      .filter(file => /^page-\d+\.png$/.test(file))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    if (!images.length) throw new Error('pdftoppm rendered no pages.')
    const pages: HkgroOcrPage[] = []
    let extraction: HkgroStreetNameOcrResult['extraction'] | null = null
    for (const [index, image] of images.entries()) {
      const rawPaddleOcrNdjson = await runCommandStdout(
        PADDLE_OCR_PYTHON,
        [PADDLE_OCR_SCRIPT, join(temporaryDir, image), OCR_LANGUAGE],
        PADDLE_OCR_TIMEOUT_MS,
      )
      const parsed = parsePaddleOcrOutput(rawPaddleOcrNdjson)
      if (extraction && extraction.engineVersion !== parsed.engineVersion) {
        throw new Error(
          `PaddleOCR engine version changed between rendered pages: ${extraction.engineVersion} and ${parsed.engineVersion}.`,
        )
      }
      extraction ??= {
        engine: 'PaddleOCR',
        engineVersion: parsed.engineVersion,
        language: OCR_LANGUAGE,
        method: 'ocr',
        model: parsed.model,
        renderDpi: OCR_RENDER_DPI,
      }
      pages.push({ pageNumber: index + 1, rawPaddleOcrNdjson, words: parsed.words })
    }
    if (!extraction) throw new Error('PaddleOCR produced no page metadata.')
    const text = pages.map(page => layoutPaddleOcrWords(page.words)).join('\n\f\n')
    if (!text.trim()) throw new Error('PaddleOCR returned no recognized English text.')
    return { extraction, pages, text }
  } catch (error) {
    throw new Error(
      `Ensure the UV OCR runtime is installed with \`uv sync --project apps/harbour-dataops --python 3.12\`, that \`pdftoppm\` is installed, and that PaddleOCR can download or access its English model weights: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    await rm(temporaryDir, { force: true, recursive: true })
  }
}

function parsePaddleOcrOutput(value: string) {
  let engineVersion: string | undefined
  let model: string | undefined
  const words: HkgroOcrWord[] = []
  for (const [index, line] of value.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    let item: Record<string, unknown>
    try {
      item = JSON.parse(line) as Record<string, unknown>
    } catch {
      throw new Error(`PaddleOCR emitted invalid JSON on line ${index + 1}.`)
    }
    if (item.type === 'metadata') {
      if (typeof item.engineVersion === 'string') engineVersion = item.engineVersion
      if (typeof item.model === 'string') model = item.model
      continue
    }
    if (
      item.type === 'word' &&
      typeof item.left === 'number' &&
      typeof item.top === 'number' &&
      typeof item.text === 'string' &&
      typeof item.confidence === 'number' &&
      item.text.trim()
    ) {
      words.push({
        confidence: item.confidence,
        left: item.left,
        text: item.text.trim(),
        top: item.top,
      })
    }
  }
  if (!engineVersion || !model || !words.length)
    throw new Error('PaddleOCR returned no recognized English text.')
  return { engineVersion, model, words }
}

function layoutPaddleOcrWords(words: HkgroOcrWord[]) {
  const lines = new Map<number, HkgroOcrWord[]>()
  for (const word of words) {
    const key = Math.round(word.top / 16)
    const line = lines.get(key) ?? []
    line.push(word)
    lines.set(key, line)
  }
  return [...lines.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, line]) =>
      [...line]
        .sort((left, right) => left.left - right.left)
        .map(word => word.text)
        .join(' '),
    )
    .join('\n')
}

async function writeOcrResult(input: {
  archiveDir: string
  output: HkgroStreetNameOcrResult
  outputPath: string
  source: HkgroTocRecord
}) {
  const path = resolveArchivePath(input.archiveDir, input.outputPath)
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(path, `${JSON.stringify(input.output, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    if (!isFileAlreadyExistsError(error)) throw error
    await validateStoredOcrResult({
      archiveDir: input.archiveDir,
      outputPath: input.outputPath,
      source: input.source,
    })
  }
}

async function validateStoredOcrResult(input: {
  archiveDir: string
  outputPath: string
  source: HkgroTocRecord
}) {
  const path = resolveArchivePath(input.archiveDir, input.outputPath)
  if (!existsSync(path)) {
    throw new Error(
      `HKGRO OCR manifest claims a completed result, but its output is missing: ${path}.`,
    )
  }
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (error) {
    throw new Error(
      `HKGRO OCR result is not valid JSON: ${path}; ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const result = validateOcrResult(value, path)
  if (
    result.source.sha256 !== input.source.sha256 ||
    result.source.byteLength !== input.source.byteLength ||
    result.source.year !== input.source.year ||
    result.source.hkgroPdfId !== input.source.hkgroPdfId ||
    result.source.localPath !== input.source.localPath
  ) {
    throw new Error(
      `HKGRO OCR result is bound to different source bytes: ${path}; expected ${input.source.sha256}/${input.source.byteLength}, found ${result.source.sha256}/${result.source.byteLength}.`,
    )
  }
}

async function validateSourcePdf(source: HkgroTocRecord, path: string) {
  const bytes = await readFile(path)
  if (
    bytes.byteLength < 5 ||
    Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-'
  ) {
    throw new Error(
      `HKGRO OCR source is not a valid PDF for ${source.year}/${source.hkgroPdfId}: ${path}.`,
    )
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== source.sha256 || bytes.byteLength !== source.byteLength) {
    throw new Error(
      `HKGRO OCR source bytes do not match the retrieval manifest for ${source.year}/${source.hkgroPdfId}: ${path}; expected ${source.sha256}/${source.byteLength}, found ${sha256}/${bytes.byteLength}.`,
    )
  }
}

function validateOcrResult(value: unknown, path: string): HkgroStreetNameOcrResult {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`HKGRO OCR result must be an object: ${path}.`)
  const result = value as Record<string, unknown>
  const source = result.source as Record<string, unknown> | null
  const extraction = result.extraction as Record<string, unknown> | null
  if (
    result.schemaVersion !== 1 ||
    !source ||
    typeof source.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    !Number.isSafeInteger(source.byteLength) ||
    !Number.isInteger(source.year) ||
    typeof source.hkgroPdfId !== 'string' ||
    typeof source.localPath !== 'string' ||
    !extraction ||
    extraction.engine !== 'PaddleOCR' ||
    extraction.method !== 'ocr' ||
    extraction.language !== OCR_LANGUAGE ||
    extraction.renderDpi !== OCR_RENDER_DPI ||
    typeof extraction.engineVersion !== 'string' ||
    typeof extraction.model !== 'string' ||
    !Array.isArray(result.pages) ||
    !result.pages.length ||
    !result.pages.every(isValidOcrPage) ||
    typeof result.text !== 'string' ||
    !result.text.trim()
  ) {
    throw new Error(`HKGRO OCR result has an invalid schema or provenance: ${path}.`)
  }
  return result as HkgroStreetNameOcrResult
}

function isValidOcrPage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const page = value as Record<string, unknown>
  return (
    Number.isInteger(page.pageNumber) &&
    typeof page.rawPaddleOcrNdjson === 'string' &&
    Array.isArray(page.words) &&
    page.words.every(isValidOcrWord)
  )
}
function isValidOcrWord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const word = value as Record<string, unknown>
  return (
    typeof word.text === 'string' &&
    typeof word.left === 'number' &&
    typeof word.top === 'number' &&
    typeof word.confidence === 'number'
  )
}

async function loadOcrManifest(path: string): Promise<HkgroOcrManifest> {
  if (!existsSync(path)) {
    return {
      records: [],
      schemaVersion: 1,
      source: 'hku-hkgro-street-name-ocr',
      updatedAt: '',
    }
  }
  const value = JSON.parse(await readFile(path, 'utf8')) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`HKGRO OCR manifest must be an object: ${path}.`)
  const manifest = value as Record<string, unknown>
  if (
    manifest.schemaVersion !== 1 ||
    manifest.source !== 'hku-hkgro-street-name-ocr' ||
    !Array.isArray(manifest.records)
  ) {
    throw new Error(`HKGRO OCR manifest has an invalid schema: ${path}.`)
  }
  return {
    records: manifest.records.map((record, index) =>
      validateOcrManifestRecord(record, `${path}: records[${index}]`),
    ),
    schemaVersion: 1,
    source: 'hku-hkgro-street-name-ocr',
    updatedAt: typeof manifest.updatedAt === 'string' ? manifest.updatedAt : '',
  }
}

function validateOcrManifestRecord(
  value: unknown,
  path: string,
): HkgroOcrManifestRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object.`)
  const record = value as Record<string, unknown>
  if (
    typeof record.year !== 'number' ||
    !Number.isInteger(record.year) ||
    typeof record.hkgroPdfId !== 'string' ||
    typeof record.outputPath !== 'string' ||
    typeof record.sourceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.sourceSha256) ||
    (record.status !== 'complete' && record.status !== 'unparseable') ||
    (record.failure !== null && typeof record.failure !== 'string') ||
    typeof record.processedAt !== 'string'
  ) {
    throw new Error(`${path} has an invalid OCR status record.`)
  }
  if (record.outputPath !== hkgroOcrOutputPath(record.year, record.hkgroPdfId))
    throw new Error(`${path}.outputPath does not match its HKGRO identity.`)
  return record as HkgroOcrManifestRecord
}

async function writeOcrManifest(
  path: string,
  recordsByKey: Map<string, HkgroOcrManifestRecord>,
) {
  const manifest: HkgroOcrManifest = {
    records: [...recordsByKey.values()].sort((left, right) =>
      ocrRecordKey(left).localeCompare(ocrRecordKey(right), undefined, {
        numeric: true,
      }),
    ),
    schemaVersion: 1,
    source: 'hku-hkgro-street-name-ocr',
    updatedAt: new Date().toISOString(),
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

function ocrRecordKey(record: { hkgroPdfId: string; year: number }) {
  return `${record.year}\0${record.hkgroPdfId}`
}
function resolveArchivePath(archiveDir: string, localPath: string) {
  if (isAbsolute(localPath))
    throw new Error(`HKGRO local path must be repository-relative: ${localPath}.`)
  const canonical = resolve(REPO_ROOT, localPath)
  const suffix = relative(DEFAULT_ARCHIVE_DIR, canonical)
  if (suffix.startsWith('..') || isAbsolute(suffix))
    throw new Error(`HKGRO local path is outside its archive directory: ${localPath}.`)
  return resolve(archiveDir, suffix)
}
function isFileAlreadyExistsError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  )
}
function readYearsOption(value: string | boolean | undefined) {
  if (value === undefined) return undefined
  if (typeof value !== 'string')
    throw new Error('`--year` requires one or more comma-separated four-digit years.')
  return normaliseYears(
    value.split(',').map(part => {
      const year = part.trim()
      if (!/^\d{4}$/.test(year))
        throw new Error(
          '`--year` requires one or more comma-separated four-digit years.',
        )
      return Number(year)
    }),
  )
}
function normaliseYears(years: number[]) {
  const unique = [...new Set(years)].sort((left, right) => left - right)
  if (!unique.length) throw new Error('At least one HKGRO year is required.')
  if (unique.some(year => year < 1842 || year > 1941))
    throw new Error('HKGRO OCR years must be between 1842 and 1941.')
  return unique
}
function readPdfIdsOption(value: string | boolean | undefined) {
  if (value === undefined) return undefined
  if (typeof value !== 'string')
    throw new Error(
      '`--hkgro-pdf-id` requires one or more comma-separated numeric IDs.',
    )
  return normalisePdfIds(value.split(',').map(part => part.trim()))
}
function normalisePdfIds(pdfIds: string[]) {
  const unique = [...new Set(pdfIds)].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  )
  if (!unique.length || unique.some(id => !/^\d+$/.test(id)))
    throw new Error(
      '`--hkgro-pdf-id` requires one or more comma-separated numeric IDs.',
    )
  return unique
}
async function runCommand(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], { stderr: 'pipe', stdout: 'pipe' })
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0)
    throw new Error(`${command} failed: ${stderr.trim() || `exit code ${exitCode}`}`)
}
async function runCommandStdout(command: string, args: string[], timeoutMs?: number) {
  const child = Bun.spawn([command, ...args], { stderr: 'pipe', stdout: 'pipe' })
  let timedOut = false
  const timeout = timeoutMs
    ? setTimeout(() => {
        timedOut = true
        child.kill()
      }, timeoutMs)
    : null
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (timeout) clearTimeout(timeout)
  if (timedOut) {
    throw new Error(
      `${command} timed out after ${(timeoutMs ?? 0) / 1_000} seconds while running ${args[0]}. Set SAANSEOI_PADDLEOCR_TIMEOUT_MS to a larger positive millisecond value only when the runtime and model download are known to be healthy.`,
    )
  }
  if (exitCode !== 0)
    throw new Error(`${command} failed: ${stderr.trim() || `exit code ${exitCode}`}`)
  return stdout
}

function readPositiveDuration(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value) || Number(value) < 1)
    throw new Error(
      'SAANSEOI_PADDLEOCR_TIMEOUT_MS must be a positive integer in milliseconds.',
    )
  return Number(value)
}
