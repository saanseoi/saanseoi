import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseLandsdGovernmentNoticeType,
  type LandsdStreetPageLocale,
  type PairedLandsdGovernmentNoticePdfEntry,
  type LandsdStreetSourceLink,
  parseLandsdGovernmentNoticePdfText,
  pairLandsdGovernmentNoticePdfEntries,
  type PairedLandsdStreetNotice,
} from './landsdStreet.ts'
import {
  egazetteArchiveFilePath,
  loadEgazetteStreetNameArchive,
  type EgazetteStreetNameRecord,
} from './egazetteStreetName.ts'
import type { SourceAssetRole } from '../../../sourceAssets.ts'
import type {
  LandsdStreetIngestProgress,
  LandsdStreetNoticeDateRange,
  PublishedPreparedAsset,
} from './landsdStreetIngestTypes.ts'
import {
  hashText,
  isLifecycleCurationNotice,
  pdfToText,
  runCommand,
} from './landsdStreetIngestIo.ts'
import { runQianfanOcr } from '../../../../qianfanOcr.ts'
import { qianfanMarkdownToLayout } from '../../../../qianfanLayout.ts'

export function getEvidence(
  evidence: Map<string, PublishedPreparedAsset>,
  role: SourceAssetRole,
  link: LandsdStreetSourceLink | null,
  locale: LandsdStreetPageLocale,
) {
  return link ? evidence.get([role, link.url, locale].join('\0'))?.link : undefined
}

export async function parseNoticePdfs(
  notices: PairedLandsdStreetNotice[],
  evidence: Map<string, PublishedPreparedAsset>,
  onProgress: (progress: LandsdStreetIngestProgress) => void,
  extractText: (pdfPath: string) => Promise<string>,
) {
  const reviewable = notices.filter(
    notice => notice.governmentNotices.en || notice.governmentNotices.zhHant,
  )
  onProgress({
    current: 0,
    message: `Extracting text from Government Notice PDFs (0/${reviewable.length})`,
    total: reviewable.length,
  })
  const english = new Map<
    string,
    ReturnType<typeof parseLandsdGovernmentNoticePdfText>
  >()
  const zhHant = new Map<
    string,
    ReturnType<typeof parseLandsdGovernmentNoticePdfText>
  >()
  const cache = new Map<
    string,
    Promise<ReturnType<typeof parseLandsdGovernmentNoticePdfText>>
  >()
  const parse = (
    notice: PairedLandsdStreetNotice,
    locale: LandsdStreetPageLocale,
    link: LandsdStreetSourceLink | null,
  ) => {
    if (!link) {
      throw new Error(
        `${notice.id}: lifecycle-review notice is missing its ${locale} Government Notice PDF link.`,
      )
    }
    const key = ['governmentNotice', link.url, locale].join('\0')
    const prepared = evidence.get(key)
    if (!prepared) {
      throw new Error(
        `${notice.id}: preserved ${locale} Government Notice PDF is unavailable.`,
      )
    }
    const existing = cache.get(key)
    if (existing) return existing
    const parsed = extractText(prepared.prepared.filePath)
      .then(text => parseLandsdGovernmentNoticePdfText(text, locale))
      .catch(error => {
        if (!isLifecycleCurationNotice(notice)) {
          throw new Error(
            `${notice.id}: unable to extract its ${locale} Government Notice PDF: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        // Preserve the failed parser state so this notice is surfaced to the
        // curator instead of silently becoming a snapshot change.
        return parseLandsdGovernmentNoticePdfText('', locale)
      })
    cache.set(key, parsed)
    return parsed
  }
  for (const [index, notice] of reviewable.entries()) {
    onProgress({
      current: index,
      message: `Extracting Government Notice PDFs (${index + 1}/${reviewable.length}): ${notice.names.en}`,
      total: reviewable.length,
    })
    english.set(notice.id, await parse(notice, 'en', notice.governmentNotices.en))
    zhHant.set(
      notice.id,
      await parse(notice, 'zh-Hant', notice.governmentNotices.zhHant),
    )
  }
  const pairingFailures: string[] = []
  const entries = pairLandsdGovernmentNoticePdfEntries({
    english,
    notices: reviewable,
    zhHant,
    onIssue: issue => pairingFailures.push(issue),
  })
  const missingNonReviewable = reviewable.find(
    notice => !isLifecycleCurationNotice(notice) && !entries.has(notice.id),
  )
  if (missingNonReviewable) {
    const pdfPaths = [
      ['English', missingNonReviewable.governmentNotices.en, 'en'] as const,
      [
        'Traditional Chinese',
        missingNonReviewable.governmentNotices.zhHant,
        'zh-Hant',
      ] as const,
    ].flatMap(([label, link, locale]) => {
      if (!link) return []
      const prepared = evidence.get(['governmentNotice', link.url, locale].join('\0'))
      return prepared ? [`${label} PDF: ${prepared.prepared.filePath}`] : []
    })
    throw new Error(
      [
        `${missingNonReviewable.id}: Government Notice PDF layout was not parseable.`,
        ...pdfPaths,
      ].join('\n'),
    )
  }
  return {
    entries,
    notices: expandIntentionNotices({
      entries,
      english,
      notices,
      zhHant,
    }),
    summary: {
      failed: [...english.values(), ...zhHant.values()].filter(
        parsed => parsed.diagnostics.status === 'failed',
      ).length,
      success: [...english.values(), ...zhHant.values()].filter(
        parsed => parsed.diagnostics.status === 'success',
      ).length,
    },
    pairingFailures,
  }
}

function expandIntentionNotices(input: {
  entries: Map<string, PairedLandsdGovernmentNoticePdfEntry>
  english: Map<string, ReturnType<typeof parseLandsdGovernmentNoticePdfText>>
  notices: PairedLandsdStreetNotice[]
  zhHant: Map<string, ReturnType<typeof parseLandsdGovernmentNoticePdfText>>
}) {
  const groups = new Map<string, PairedLandsdStreetNotice[]>()
  for (const notice of input.notices) {
    if (notice.governmentNoticeType !== 'intention') continue
    const key = notice.noticeIdentity ?? notice.id
    groups.set(key, [...(groups.get(key) ?? []), notice])
  }
  if (groups.size === 0) return input.notices

  const replacedIds = new Set<string>()
  const expanded: PairedLandsdStreetNotice[] = []
  for (const notices of groups.values()) {
    const source = notices[0]
    if (!source) continue
    const english = input.english.get(source.id)
    const zhHant = input.zhHant.get(source.id)
    if (!english || !zhHant || english.entries.length !== zhHant.entries.length) {
      throw new Error(
        `${source.noticeIdentity ?? source.id}: intention notice PDF rows are not bilingual-aligned.`,
      )
    }
    for (const notice of notices) replacedIds.add(notice.id)
    for (const [ordinal, englishEntry] of english.entries.entries()) {
      const zhHantEntry = zhHant.entries[ordinal]
      if (!zhHantEntry || !englishEntry.name || !zhHantEntry.name) {
        throw new Error(
          `${source.noticeIdentity ?? source.id}: intention notice PDF row ${ordinal + 1} has no bilingual street name.`,
        )
      }
      const englishReferences = new Set(englishEntry.previousNoticeRefs)
      const zhHantReferences = new Set(zhHantEntry.previousNoticeRefs)
      if (
        englishReferences.size > 0 &&
        zhHantReferences.size > 0 &&
        !(
          englishReferences.size === zhHantReferences.size &&
          [...englishReferences].every(reference => zhHantReferences.has(reference))
        )
      ) {
        throw new Error(
          `${source.noticeIdentity ?? source.id}: intention notice PDF row ${ordinal + 1} has bilingual Previous G.N. disagreement.`,
        )
      }
      const id = `${source.id}:pdf-row:${hashText(`${englishEntry.name}\0${zhHantEntry.name}\0${ordinal}`)}`
      const parsedEntry: PairedLandsdGovernmentNoticePdfEntry = {
        descriptions: {
          en: englishEntry.description,
          zhHant: zhHantEntry.description,
        },
        districts: { en: englishEntry.district, zhHant: zhHantEntry.district },
        effectiveDate: englishEntry.effectiveDate ?? zhHantEntry.effectiveDate,
        gazetteDate:
          english.gazetteDate ?? zhHant.gazetteDate ?? source.publicationDate,
        parserDiagnostics: { en: english.diagnostics, zhHant: zhHant.diagnostics },
        previousNoticeRefs: [
          ...new Set([
            ...englishEntry.previousNoticeRefs,
            ...zhHantEntry.previousNoticeRefs,
          ]),
        ].sort(),
        rawExtractedText: { en: english.rawText, zhHant: zhHant.rawText },
      }
      input.entries.set(id, parsedEntry)
      expanded.push({
        ...source,
        id,
        names: { en: englishEntry.name, zhHant: zhHantEntry.name },
        noticeOrdinal: ordinal,
        sourceOrdinals: { en: ordinal, zhHant: ordinal },
      })
    }
  }
  return [...input.notices.filter(notice => !replacedIds.has(notice.id)), ...expanded]
}

type ParsedEgazetteStreetNameArchive = {
  assetRecords: Map<string, EgazetteStreetNameRecord>
  entries: Map<string, PairedLandsdGovernmentNoticePdfEntry>
  notices: PairedLandsdStreetNotice[]
}

export function emptyParsedEgazetteStreetNameArchive(): ParsedEgazetteStreetNameArchive {
  return { assetRecords: new Map(), entries: new Map(), notices: [] }
}

async function extractChineseEgazetteNoticeText(input: {
  nativeText: string
  pdfPath: string
}) {
  const native = parseLandsdGovernmentNoticePdfText(input.nativeText, 'zh-Hant')
  if (hasUsableChineseNoticeRows(native)) {
    return { nativeText: null, parsed: native }
  }
  const ocr = await ocrPdfToTraditionalChineseText(input.pdfPath)
  const text = ocr.text
  const parsed = parseLandsdGovernmentNoticePdfText(text, 'zh-Hant')
  return {
    nativeText: input.nativeText,
    parsed: {
      ...parsed,
      diagnostics: {
        ...parsed.diagnostics,
        extraction: {
          engine: 'Qianfan-OCR',
          engineVersion: ocr.engineVersion,
          language: 'zh-Hant',
          method: 'ocr' as const,
          model: ocr.model,
          revision: ocr.revision,
          rawPages: ocr.rawPages,
          nativeTextStatus: 'unparseable' as const,
          renderDpi: 300,
        },
      },
    },
  }
}

function hasUsableChineseNoticeRows(
  value: ReturnType<typeof parseLandsdGovernmentNoticePdfText>,
) {
  return (
    value.diagnostics.status === 'success' && value.entries.every(entry => entry.name)
  )
}

async function ocrPdfToTraditionalChineseText(pdfPath: string) {
  const temporaryDir = await mkdtemp(join(tmpdir(), 'saanseoi-egazette-ocr-'))
  try {
    await runCommand('pdftoppm', [
      '-r',
      '300',
      '-png',
      pdfPath,
      join(temporaryDir, 'page'),
    ])
    const images = (await readdir(temporaryDir))
      .filter(file => /^page-\\d+\\.png$/.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    if (!images.length) throw new Error('pdftoppm rendered no pages.')
    const pages = []
    for (const image of images)
      pages.push(await runQianfanOcr(join(temporaryDir, image)))
    const first = pages[0]?.page
    if (!first) throw new Error('Qianfan OCR produced no pages.')
    if (pages.some(({ page }) => page.engineVersion !== first.engineVersion))
      throw new Error('Qianfan runtime changed between pages.')
    return {
      engineVersion: first.engineVersion,
      model: first.model,
      revision: first.revision,
      rawPages: pages.map(({ raw }) => raw),
      text: pages
        .map(({ page }) => qianfanMarkdownToLayout(page.text))
        .join('\\n\\f\\n'),
    }
  } catch (error) {
    throw new Error(
      `Traditional Chinese e-Gazette Qianfan OCR failed for ${pdfPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    await rm(temporaryDir, { recursive: true, force: true })
  }
}

/**
 * The archive has no mutable HTML row model. Its bilingual PDFs are therefore
 * parsed as the source record itself, and every mismatch identifies the exact
 * manifest entry and local files that need repair.
 */
export async function parseEgazetteStreetNameArchive(input: {
  archiveDir: string
  dateRange?: LandsdStreetNoticeDateRange
  onProgress: (progress: LandsdStreetIngestProgress) => void
  repoRoot: string
}): Promise<ParsedEgazetteStreetNameArchive> {
  const records = filterEgazetteRecordsByDate(
    await loadEgazetteStreetNameArchive({
      archiveDir: input.archiveDir,
      repoRoot: input.repoRoot,
    }),
    input.dateRange,
  )
  const assetRecords = new Map<string, EgazetteStreetNameRecord>()
  const entries = new Map<string, PairedLandsdGovernmentNoticePdfEntry>()
  const notices: PairedLandsdStreetNotice[] = []

  for (const [index, record] of records.entries()) {
    const label = `${record.publicationDate} ${record.issueVolume} ${record.subject}`
    input.onProgress({
      current: index,
      message: `Parsing historical e-Gazette PDF ${index + 1}/${records.length}: ${label}`,
      total: records.length,
    })
    const enPath = egazetteArchiveFilePath(input.repoRoot, record.assets.en.localPath)
    const zhHantPath = egazetteArchiveFilePath(
      input.repoRoot,
      record.assets['zh-Hant'].localPath,
    )
    const [enText, zhHantNativeText] = await Promise.all([
      pdfToText(enPath),
      pdfToText(zhHantPath),
    ])
    const english = parseLandsdGovernmentNoticePdfText(enText, 'en')
    const chinese = await extractChineseEgazetteNoticeText({
      nativeText: zhHantNativeText,
      pdfPath: zhHantPath,
    })
    const zhHant = chinese.parsed
    const details = `${label}; English ${record.assets.en.localPath}; Traditional Chinese ${record.assets['zh-Hant'].localPath}`
    const noticeRef = parseEgazetteNoticeRef(enText, details)
    const recordKey = `gn${noticeRef.slice(2)}`

    if (
      english.diagnostics.status !== 'success' ||
      zhHant.diagnostics.status !== 'success'
    ) {
      throw new Error(
        `e-Gazette PDF parsing failed for ${details}. English: ${english.diagnostics.message ?? english.diagnostics.layout}; Traditional Chinese: ${zhHant.diagnostics.message ?? zhHant.diagnostics.layout}.`,
      )
    }
    if (english.gazetteDate !== record.publicationDate) {
      throw new Error(
        `e-Gazette publication-date mismatch for ${details}. Manifest ${record.publicationDate}; English ${english.gazetteDate ?? 'unparsed'}.`,
      )
    }
    const englishType = parseLandsdGovernmentNoticeType(enText, 'en')
    if (!englishType) {
      throw new Error(
        `e-Gazette notice type is not parseable from the authoritative English PDF for ${details}.`,
      )
    }
    if (english.entries.length !== zhHant.entries.length) {
      throw new Error(
        `e-Gazette bilingual row-count mismatch for ${details}. English ${english.entries.length}; Traditional Chinese ${zhHant.entries.length}.`,
      )
    }
    assetRecords.set(recordKey, record)
    for (const [ordinal, englishEntry] of english.entries.entries()) {
      const zhHantEntry = zhHant.entries[ordinal]
      if (!zhHantEntry || !englishEntry.name || !zhHantEntry.name) {
        throw new Error(
          `e-Gazette street row ${ordinal + 1} is not parseable for ${details}. English name ${englishEntry.name ? 'present' : 'missing'}; Traditional Chinese name ${zhHantEntry?.name ? 'present' : 'missing'}.`,
        )
      }
      const id = `hkgov-gld-egazette-street:${hashText(`${recordKey}\0${record.publicationDate}\0${ordinal}`)}`
      notices.push({
        district: { en: '', zhHant: '' },
        governmentNotices: {
          en: {
            label: `G.N. ${noticeRef.slice(2)}`,
            url: record.assets.en.officialUrl,
          },
          zhHant: {
            label: `第${noticeRef.slice(2)}號`,
            url: record.assets['zh-Hant'].officialUrl,
          },
        },
        governmentNoticeType: englishType,
        id,
        noticeIdentity: noticeRef,
        names: { en: englishEntry.name, zhHant: zhHantEntry.name },
        noticeOrdinal: ordinal,
        planUrls: [],
        publicationDate: record.publicationDate,
        sourceOrdinals: { en: ordinal, zhHant: ordinal },
      })
      entries.set(id, {
        descriptions: {
          en: englishEntry.description,
          zhHant: zhHantEntry.description,
        },
        // Gazette identity, effective dates, kinds and Previous G.N. values
        // remain English-PDF facts. Chinese OCR only supplies the publisher's
        // localized name and description when its text layer is absent.
        effectiveDate: englishEntry.effectiveDate,
        gazetteDate: record.publicationDate,
        parserDiagnostics: { en: english.diagnostics, zhHant: zhHant.diagnostics },
        previousNoticeRefs: [...new Set([...englishEntry.previousNoticeRefs])].sort(),
        rawExtractedText: {
          en: english.rawText,
          zhHant: zhHant.rawText,
          ...(chinese.nativeText ? { zhHantNative: chinese.nativeText } : {}),
        },
      })
    }
  }
  return { assetRecords, entries, notices }
}

function filterEgazetteRecordsByDate(
  records: EgazetteStreetNameRecord[],
  range: LandsdStreetNoticeDateRange | undefined,
) {
  return records.filter(record => isDateInRange(record.publicationDate, range))
}

export function filterNoticesByDate(
  notices: PairedLandsdStreetNotice[],
  range: LandsdStreetNoticeDateRange | undefined,
) {
  return notices.filter(notice => isDateInRange(notice.publicationDate, range))
}

function isDateInRange(date: string, range: LandsdStreetNoticeDateRange | undefined) {
  return (
    (!range?.from || date >= range.from) && (!range?.through || date <= range.through)
  )
}

function parseEgazetteNoticeRef(english: string, label: string) {
  const en = english.match(/\bG\.?N\.?\s*(\d{2,})\b/i)?.[1]
  if (!en) {
    throw new Error(
      `e-Gazette Government Notice reference is not parseable from the authoritative English PDF for ${label}.`,
    )
  }
  return `gn${en}`
}
