import {
  MONTHS,
  type LandsdChineseNoticeDateCorrigendum,
  type LandsdGovernmentNoticePdfEntry,
  type LandsdGovernmentNoticePdfParse,
  type LandsdStreetPageLocale,
  type PairedLandsdGovernmentNoticePdfEntry,
  type PairedLandsdStreetNotice,
} from './landsdStreetTypes.ts'
import {
  cleanGovernmentNoticeNameCell,
  cleanPdfCell,
  extractGovernmentNoticeReferences,
  extractPreviousNoticeReferences,
  extractThreeColumnContinuationName,
  hasChinesePreviousNoticeCell,
  isGovernmentNoticePostamble,
  isGovernmentNoticeSignatureLine,
  isGovernmentNoticeTableHeader,
  normaliseExtractedPdfLayoutText,
  parseNoticeEffectiveDate,
  splitGovernmentNoticeThreeColumnRow,
  startsGovernmentNoticeDescriptionRow,
} from './landsdStreetPdf.ts'
import {
  matchingPdfEntries,
  sameStrings,
  selectBilingualPdfEntries,
  selectStructurallyAlignedPdfEntries,
  uniqueStrings,
} from './landsdStreetMatching.ts'

/**
 * Parses the Government Notice layouts emitted by `pdftotext -layout`.
 * Historical notices use either a three-column Description/Name/Previous
 * G.N. table, a two-column Description/Name table, a deletion Name/Named-in
 * table, or no table at all. The latter remains evidence-only: it provides
 * predecessor candidates for curation but never determines a lifecycle link.
 */
export function parseLandsdGovernmentNoticePdfText(
  text: string,
  locale: LandsdStreetPageLocale,
): LandsdGovernmentNoticePdfParse {
  const layoutText = normaliseExtractedPdfLayoutText(text)
  const lines = layoutText.split(/\r?\n/)
  const gazetteDate = parseGovernmentNoticeGazetteDate(text, locale)
  const immediateEffect =
    /(?:with\s+immediate\s+effect|immediate\s+effect|即時生效|即时生效)/iu.test(text)
  const previousHeaderIndex = lines.findIndex(line =>
    locale === 'en'
      ? /\bDescription\b.*\bName\b.*\bPrevious\s+G\.?N\.?\b/i.test(line)
      : /(?:說明|描述).*?(?:名稱|名字).*?(?:前.*?(?:政府公告|公告)|前.*G\.?N\.?)/u.test(
          line,
        ),
  )
  const descriptionNameHeaderIndex = lines.findIndex(line =>
    locale === 'en'
      ? /\bDescription\b.*\bName\b/i.test(line)
      : /(?:說明|描述).*?(?:名稱|名字)/u.test(line),
  )
  const namedInHeaderIndex = lines.findIndex(line =>
    locale === 'en'
      ? /\b(?:Street\s+)?Names?\b.*\bNamed\s+in\b/i.test(line)
      : /(?:街道)?名稱.*?(?:刊載於|原載於|政府公告)/u.test(line),
  )
  const globalPreviousReferences = extractPreviousNoticeReferences(layoutText)

  if (
    previousHeaderIndex < 0 &&
    descriptionNameHeaderIndex < 0 &&
    namedInHeaderIndex < 0
  ) {
    return {
      diagnostics: {
        extraction: {
          engine: null,
          language: null,
          method: 'native-text',
        },
        header: null,
        immediateEffect,
        layout: 'unstructured-notice',
        message:
          'Government Notice has no recognised street table; predecessor references require lifecycle curation.',
        status: 'success',
      },
      entries: [
        {
          description: null,
          district: null,
          effectiveDate: parseNoticeEffectiveDate(text),
          immediateEffect,
          name: '',
          ordinal: 0,
          previousNoticeRefs: globalPreviousReferences,
          rawText: text,
        },
      ],
      gazetteDate,
      rawText: text,
    }
  }

  const headerIndex =
    previousHeaderIndex >= 0
      ? previousHeaderIndex
      : descriptionNameHeaderIndex >= 0
        ? descriptionNameHeaderIndex
        : namedInHeaderIndex
  const header = lines[headerIndex] ?? ''
  const isNamedInTable = namedInHeaderIndex === headerIndex && previousHeaderIndex < 0
  const districtColumn = isNamedInTable
    ? header.search(locale === 'en' ? /\bDistrict\b/i : /地區|區域|地區名稱/u)
    : -1
  let descriptionColumn = isNamedInTable
    ? header.search(locale === 'en' ? /\b(?:Street\s+)?Names?\b/i : /(?:街道)?名稱/u)
    : header.search(locale === 'en' ? /Description/i : /說明|描述/u)
  let nameColumn = isNamedInTable
    ? descriptionColumn
    : header.search(locale === 'en' ? /\bName\b/i : /名稱|名字/u)
  let previousColumn = isNamedInTable
    ? header.search(locale === 'en' ? /Named\s+in/i : /刊載於|原載於|政府公告/u)
    : previousHeaderIndex === headerIndex
      ? header.search(
          locale === 'en' ? /Previous\s+G\.?N\.?/i : /前.*?(?:政府公告|公告|G\.?N\.?)/u,
        )
      : -1
  if (
    descriptionColumn < 0 ||
    (!isNamedInTable && nameColumn <= descriptionColumn) ||
    (isNamedInTable &&
      (descriptionColumn < 0 || previousColumn <= descriptionColumn)) ||
    (!isNamedInTable && previousColumn >= 0 && previousColumn <= nameColumn)
  ) {
    return {
      diagnostics: {
        extraction: {
          engine: null,
          language: null,
          method: 'native-text',
        },
        header,
        immediateEffect,
        layout: 'unmatched',
        message: 'Government Notice header did not expose usable fixed columns.',
        status: 'failed',
      },
      entries: [],
      gazetteDate,
      rawText: text,
    }
  }

  const entries: LandsdGovernmentNoticePdfEntry[] = []
  let current: LandsdGovernmentNoticePdfEntry | null = null
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim() || /^\s*(?:page\s+)?\d+\s*$/i.test(line)) continue
    if (isGovernmentNoticePostamble(line, locale)) break
    if (isGovernmentNoticeTableHeader(line, locale)) {
      // PDF page breaks can repeat the table header with a narrower column
      // layout. Continue the same table with its newly declared positions.
      if (!isNamedInTable) {
        descriptionColumn = line.search(locale === 'en' ? /Description/i : /說明|描述/u)
        nameColumn = line.search(locale === 'en' ? /\bName\b/i : /名稱|名字/u)
        previousColumn =
          previousHeaderIndex >= 0
            ? line.search(
                locale === 'en'
                  ? /Previous\s+G\.?N\.?/i
                  : /前.*?(?:政府公告|公告|G\.?N\.?)/u,
              )
            : -1
      }
      continue
    }
    if (isGovernmentNoticeSignatureLine(line, locale)) break
    if (
      (locale === 'en' &&
        /^\s*\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s*$/i.test(
          line,
        )) ||
      (locale === 'zh-Hant' &&
        /^\s*\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*$/u.test(line))
    )
      continue
    const isThreeColumnTable = !isNamedInTable && previousColumn >= 0
    const threeColumnRow: {
      description: string
      name: string
      previous: string
    } | null =
      isThreeColumnTable &&
      !(locale === 'zh-Hant' && !current && !hasChinesePreviousNoticeCell(line))
        ? splitGovernmentNoticeThreeColumnRow(line, locale)
        : null
    const description: string = isNamedInTable
      ? ''
      : (threeColumnRow?.description ??
        cleanPdfCell(line.slice(descriptionColumn, nameColumn)))
    const district =
      isNamedInTable && districtColumn >= 0
        ? cleanPdfCell(line.slice(districtColumn, descriptionColumn))
        : ''
    const name: string = isNamedInTable
      ? cleanPdfCell(line.slice(nameColumn, previousColumn))
      : threeColumnRow?.name ||
        (isThreeColumnTable
          ? !threeColumnRow && !current
            ? cleanGovernmentNoticeNameCell(line, nameColumn, previousColumn, locale)
            : threeColumnRow && (locale === 'en' || !current)
              ? cleanGovernmentNoticeNameCell(line, nameColumn, previousColumn, locale)
              : extractThreeColumnContinuationName(
                  line,
                  locale,
                  nameColumn,
                  previousColumn,
                )
          : cleanGovernmentNoticeNameCell(
              line,
              nameColumn,
              previousColumn >= 0 ? previousColumn : undefined,
              locale,
            ))
    const previous: string =
      threeColumnRow?.previous ??
      (previousColumn >= 0 ? cleanPdfCell(line.slice(previousColumn)) : '')
    // A long name can wrap into the name column over several lines while its
    // description continues. A new declaration row begins with a fresh road
    // or street sentence; every other occupied name cell continues the row.
    if (
      name &&
      current &&
      description &&
      !startsGovernmentNoticeDescriptionRow(description, locale)
    ) {
      current.description = [current.description, description].filter(Boolean).join(' ')
      current.name = [current.name, name].join(' ')
      current.rawText = `${current.rawText}\n${line}`
      current.effectiveDate ??= parseNoticeEffectiveDate(description)
      continue
    }
    if (
      name &&
      current &&
      !description &&
      !previous &&
      // A long name is wrapped below the Name column by pdftotext. It is not
      // a second table entry when the description and previous columns are empty.
      !isNamedInTable
    ) {
      current.name = `${current.name} ${name}`
      current.rawText = `${current.rawText}\n${line}`
      continue
    }
    if (name) {
      current = {
        description: description || null,
        district: district || null,
        effectiveDate: parseNoticeEffectiveDate(`${description}\n${previous}\n${text}`),
        immediateEffect,
        name,
        ordinal: entries.length,
        previousNoticeRefs:
          previousColumn >= 0
            ? extractGovernmentNoticeReferences(previous, {
                allowBareChinese: true,
                allowOrphanChineseNumber: true,
              })
            : globalPreviousReferences,
        rawText: line,
      }
      entries.push(current)
      continue
    }
    if (current && (description || previous)) {
      if (description) {
        current.description = [current.description, description]
          .filter(Boolean)
          .join(' ')
      }
      current.rawText = `${current.rawText}\n${line}`
      if (description) {
        current.effectiveDate ??= parseNoticeEffectiveDate(description)
      }
      const references =
        previousColumn >= 0
          ? extractGovernmentNoticeReferences(previous, {
              allowBareChinese: true,
              allowOrphanChineseNumber: true,
            })
          : globalPreviousReferences
      if (references.length > 0) {
        current.previousNoticeRefs = uniqueStrings([
          ...current.previousNoticeRefs,
          ...references,
        ])
      }
    }
  }
  return {
    diagnostics: {
      extraction: {
        engine: null,
        language: null,
        method: 'native-text',
      },
      header,
      immediateEffect,
      layout:
        previousColumn >= 0
          ? isNamedInTable
            ? 'name-previous-gn'
            : 'description-name-previous-gn'
          : 'description-name',
      message: entries.length
        ? null
        : 'The matched Government Notice table had no street entries.',
      status: entries.length ? 'success' : 'failed',
    },
    entries,
    gazetteDate,
    rawText: text,
  }
}

/** Classify the publisher notice itself, including historical e-Gazettes. */
export function parseLandsdGovernmentNoticeType(
  text: string,
  locale: LandsdStreetPageLocale,
): PairedLandsdStreetNotice['governmentNoticeType'] | null {
  const normalised = text.normalize('NFKC').replaceAll(/\s+/g, ' ')
  if (locale === 'en') {
    if (/\bCorrigendum\b/i.test(normalised)) return 'corrigendum'
    if (
      /\b(?:Notice of Intention|Intention Notice)\b.*\b(?:Change|Street Name)\b/i.test(
        normalised,
      )
    )
      return 'intention'
    if (/\bDeletion of Street Names?\b/i.test(normalised)) return 'deletion'
    if (/\b(?:Declaration to Change|Change of) Street Names?\b/i.test(normalised))
      return 'change'
    if (
      /\b(?:will|shall) replace (?:that|those) set out in (?:the )?(?:previous )?G\.?N\.?/i.test(
        normalised,
      )
    )
      return 'change'
    if (
      /\b(?:Replacing|Replacement of) (?:the )?(?:Description|Street Name)/i.test(
        normalised,
      )
    )
      return 'change'
    if (/\bStreet Names?\b/i.test(normalised)) return 'declaration'
    return null
  }
  if (/勘誤|更正/u.test(normalised)) return 'corrigendum'
  if (/擬.*更改.*(?:街道)?名稱|擬更改街道名稱/u.test(normalised)) return 'intention'
  if (/刪除.*(?:街道)?名稱|删除.*(?:街道)?名稱/u.test(normalised)) return 'deletion'
  if (/更改.*(?:街道)?名稱|取代.*(?:說明|描述)|取代.*前.*公告/u.test(normalised))
    return 'change'
  if (/(?:街道)?名稱/u.test(normalised)) return 'declaration'
  return null
}

/** Pair localized Government Notice PDF rows to the already-paired LandsD rows. */
export function pairLandsdGovernmentNoticePdfEntries(input: {
  english: Map<string, LandsdGovernmentNoticePdfParse>
  notices: PairedLandsdStreetNotice[]
  zhHant: Map<string, LandsdGovernmentNoticePdfParse>
  onIssue?: (issue: string) => void
}) {
  const result = new Map<string, PairedLandsdGovernmentNoticePdfEntry>()
  const issues: string[] = []
  const chineseDateCorrigenda = chineseNoticeDateCorrigenda(input)
  const noticeGroups = new Map<string, PairedLandsdStreetNotice[]>()
  for (const notice of input.notices) {
    const group = noticeGroups.get(notice.noticeIdentity ?? notice.id) ?? []
    group.push(notice)
    noticeGroups.set(notice.noticeIdentity ?? notice.id, group)
  }
  for (const notices of noticeGroups.values()) {
    const ordered = [...notices].sort(
      (left, right) => left.sourceOrdinals.en - right.sourceOrdinals.en,
    )
    const first = ordered[0]
    if (!first) continue
    const english = input.english.get(first.id)
    const zhHant = input.zhHant.get(first.id)
    if (!english || !zhHant) {
      issues.push(
        `${first.noticeIdentity ?? first.id}: missing bilingual Government Notice PDF parse.`,
      )
      continue
    }
    if (
      english.diagnostics.status !== 'success' ||
      zhHant.diagnostics.status !== 'success'
    ) {
      issues.push(
        `${first.noticeIdentity ?? first.id}: Government Notice PDF layout was not parseable.`,
      )
      continue
    }
    const usedEnglish = new Set<number>()
    const usedZhHant = new Set<number>()
    // A corrigendum can correct one bilingual notice as a whole without
    // repeating its individual street rows. Attach that single evidence-only
    // entry to every source-page row so each remains subject to curation.
    const isNoticeWideCorrigendum =
      first.governmentNoticeType === 'corrigendum' &&
      english.diagnostics.layout === 'unstructured-notice' &&
      zhHant.diagnostics.layout === 'unstructured-notice' &&
      english.entries.length === 1 &&
      zhHant.entries.length === 1
    for (const [pdfOrdinal, notice] of ordered.entries()) {
      const englishCandidates = matchingPdfEntries(
        english.entries,
        notice.names.en,
        usedEnglish,
      )
      const zhHantCandidates = matchingPdfEntries(
        zhHant.entries,
        notice.names.zhHant,
        usedZhHant,
      )
      // When both PDFs contain exactly one entry for every source-page row,
      // their shared ordinal is the most direct evidence. Prefer it before a
      // name match: an index page can order names differently from the PDF,
      // and an early exact match would otherwise consume the wrong row.
      let selected: {
        englishEntry: LandsdGovernmentNoticePdfEntry
        zhHantEntry: LandsdGovernmentNoticePdfEntry
      } | null
      if (isNoticeWideCorrigendum) {
        const [englishEntry] = english.entries
        const [zhHantEntry] = zhHant.entries
        if (!englishEntry || !zhHantEntry) {
          issues.push(`${notice.id}: corrigendum was missing a bilingual PDF entry.`)
          continue
        }
        selected = { englishEntry, zhHantEntry }
      } else {
        selected =
          selectStructurallyAlignedPdfEntries({
            english: english.entries,
            noticeCount: ordered.length,
            noticeOrdinal: pdfOrdinal,
            usedEnglish,
            usedZhHant,
            zhHant: zhHant.entries,
          }) ??
          selectBilingualPdfEntries({
            english: englishCandidates,
            noticeOrdinal: pdfOrdinal,
            zhHant: zhHantCandidates,
          })
      }
      if (!selected) {
        issues.push(
          `${notice.id}: page row could not be paired to one bilingual Government Notice PDF entry.`,
        )
        continue
      }
      const { englishEntry, zhHantEntry } = selected
      usedEnglish.add(englishEntry.ordinal)
      usedZhHant.add(zhHantEntry.ordinal)
      const englishReferences = new Set(englishEntry.previousNoticeRefs)
      const zhReferences = new Set(zhHantEntry.previousNoticeRefs)
      if (
        englishReferences.size > 0 &&
        zhReferences.size > 0 &&
        !sameStrings(englishReferences, zhReferences)
      ) {
        issues.push(
          `${notice.id}: bilingual PDF entries disagree about Previous G.N. references.`,
        )
      }
      if (
        englishEntry.effectiveDate &&
        zhHantEntry.effectiveDate &&
        englishEntry.effectiveDate !== zhHantEntry.effectiveDate
      ) {
        issues.push(
          `${notice.id}: bilingual PDF entries disagree about effective date.`,
        )
        continue
      }
      if (!english.gazetteDate || !zhHant.gazetteDate) {
        issues.push(
          `${notice.id}: Government Notice PDF does not contain a parseable Gazette date.`,
        )
        continue
      }
      if (english.gazetteDate !== zhHant.gazetteDate) {
        const corrigendum = chineseDateCorrigenda.get(first.noticeIdentity ?? '')
        const isCorrectedByLaterNotice =
          corrigendum?.erroneousDate === zhHant.gazetteDate &&
          corrigendum.correctedDate === english.gazetteDate
        if (!isCorrectedByLaterNotice)
          issues.push(`${notice.id}: bilingual PDFs disagree about Gazette date.`)
        // Retain the paired table rows. A publisher typo in one signature
        // block must not erase the explicit replacement descriptions; the
        // English PDF date remains the event date and the discrepancy is
        // carried as an operator warning.
      }
      result.set(notice.id, {
        descriptions: {
          en: englishEntry.description,
          zhHant: zhHantEntry.description,
        },
        districts: {
          en: englishEntry.district,
          zhHant: zhHantEntry.district,
        },
        effectiveDate: englishEntry.effectiveDate ?? zhHantEntry.effectiveDate,
        gazetteDate: english.gazetteDate,
        parserDiagnostics: { en: english.diagnostics, zhHant: zhHant.diagnostics },
        previousNoticeRefs: uniqueStrings([
          ...englishEntry.previousNoticeRefs,
          ...zhHantEntry.previousNoticeRefs,
        ]),
        rawExtractedText: { en: english.rawText, zhHant: zhHant.rawText },
      })
    }
  }
  if (issues.length > 0 && !input.onIssue) {
    throw new Error(
      `LandsD Government Notice PDF pairing failed:\n${issues.map(issue => `- ${issue}`).join('\n')}`,
    )
  }
  for (const issue of issues) input.onIssue?.(issue)
  return result
}

function chineseNoticeDateCorrigenda(input: {
  english: Map<string, LandsdGovernmentNoticePdfParse>
  notices: PairedLandsdStreetNotice[]
}) {
  const corrections = new Map<string, LandsdChineseNoticeDateCorrigendum>()
  for (const notice of input.notices) {
    if (notice.governmentNoticeType !== 'corrigendum') continue
    const correction = parseLandsdChineseNoticeDateCorrigendum(
      input.english.get(notice.id)?.rawText ?? '',
    )
    if (!correction || corrections.has(correction.targetNoticeRef)) continue
    corrections.set(correction.targetNoticeRef, correction)
  }
  return corrections
}

/**
 * Corrigenda such as G.N. 2321 amend the date printed in an earlier Chinese
 * notice. They are publisher-metadata corrections, never street changes.
 */
export function parseLandsdChineseNoticeDateCorrigendum(
  text: string,
): LandsdChineseNoticeDateCorrigendum | null {
  const normalised = text.replaceAll(/\s+/g, ' ')
  const target = normalised.match(/Government\s+Notice\s+No\.\s*(\d+)/i)?.[1]
  const dates = [...normalised.matchAll(/[‘'“"]([^’'”"]+?\d\s*日)[’'”"]/gu)].map(
    match => parseChinesePrintedDate(match[1] ?? ''),
  )
  const [erroneousDate, correctedDate] = dates
  return target && erroneousDate && correctedDate
    ? {
        correctedDate,
        erroneousDate,
        targetNoticeRef: `gn${target}`,
      }
    : null
}

function parseChinesePrintedDate(value: string) {
  const match = value.match(/(\d{4})\s*年\s*(\d(?:\s*\d)?)\s*月\s*(\d(?:\s*\d)?)\s*日/u)
  if (!match) return null
  const [, year, month, day] = match
  return `${year}-${month?.replaceAll(/\s/g, '').padStart(2, '0')}-${day?.replaceAll(/\s/g, '').padStart(2, '0')}`
}

/**
 * The date at the signature block is the notice's own Gazette date.  It is
 * distinct from the LandsD HTML index and is deliberately parsed from both
 * language PDFs before a notice may enter the source ledger.
 */
function parseGovernmentNoticeGazetteDate(
  text: string,
  locale: LandsdStreetPageLocale,
) {
  const candidates = [
    ...text.matchAll(
      locale === 'en'
        ? /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi
        : /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/gu,
    ),
  ]
  const match = candidates.at(-1)
  if (!match) return null
  if (locale === 'en') {
    const month = MONTHS[match[2]?.toLowerCase() ?? '']
    const day = match[1]?.padStart(2, '0')
    const year = match[3]
    return month && day && year ? `${year}-${month}-${day}` : null
  }
  const year = match[1]
  const month = match[2]?.padStart(2, '0')
  const day = match[3]?.padStart(2, '0')
  return year && month && day ? `${year}-${month}-${day}` : null
}
