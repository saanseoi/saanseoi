import { createHash } from 'node:crypto'

import type { LandsdStreetNoticeType, StreetLocaleCode } from '@repo/db'

export const LANDSD_STREET_NAMING_URL =
  'https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html'
export const LANDSD_STREET_PDF_URL =
  'https://www.landsd.gov.hk/doc/en/street-name/Gazetted_Street_Name.pdf'
export type LandsdStreetPdfRow = {
  englishName: string
  chineseName: string
  districtCode: string
}

export type LandsdStreetNoticePage = {
  lastModified: string
  notices: Array<{
    changeType: string
    date: string
    district: string
    key: string
    nameEn: string
    noticeLink: LandsdStreetSourceLink | null
    planLinks: LandsdStreetSourceLink[]
  }>
}

export type LandsdStreetPageLocale = StreetLocaleCode

export type LandsdStreetSourceKind = 'baseline' | 'historical-notice' | 'notice'

export type LandsdStreetSourceLink = {
  label: string
  url: string
}

export type LandsdStreetSourceNoticeRow = {
  district: string
  governmentNotice: LandsdStreetSourceLink | null
  governmentNoticeType: string
  locale: LandsdStreetPageLocale
  name: string
  ordinal: number
  planUrls: LandsdStreetSourceLink[]
  publicationDate: string
}

export type LandsdStreetSourcePage = {
  lastModified: string
  locale: LandsdStreetPageLocale
  notices: LandsdStreetSourceNoticeRow[]
}

/**
 * A source-identity record. It deliberately excludes both localized street
 * names: a named street can be changed, deleted, restored, or recur in a
 * later Gazette notice.
 */
export type PairedLandsdStreetNotice = {
  district: {
    en: string
    zhHant: string
  }
  governmentNotices: {
    en: LandsdStreetSourceLink | null
    zhHant: LandsdStreetSourceLink | null
  }
  governmentNoticeType: LandsdStreetNoticeType
  id: string
  noticeIdentity: string | null
  names: {
    en: string
    zhHant: string
  }
  planUrls: LandsdStreetSourceLink[]
  publicationDate: string
  /** Ordinal within one notice's bilingual page-row group. */
  noticeOrdinal: number
  sourceOrdinals: {
    en: number
    zhHant: number
  }
}

export type LandsdGovernmentNoticePdfEntry = {
  description: string | null
  district: string | null
  effectiveDate: string | null
  immediateEffect: boolean
  name: string
  ordinal: number
  previousNoticeRefs: string[]
  rawText: string
}

export type LandsdGovernmentNoticePdfParse = {
  diagnostics: {
    extraction: {
      engine: string | null
      engineVersion?: string
      language: string | null
      method: 'native-text' | 'ocr'
      model?: string
      nativeTextStatus?: 'unparseable'
      renderDpi?: number
    }
    header: string | null
    immediateEffect: boolean
    layout:
      | 'description-name-previous-gn'
      | 'description-name'
      | 'name-previous-gn'
      | 'unstructured-notice'
      | 'unmatched'
    message: string | null
    status: 'failed' | 'success'
  }
  entries: LandsdGovernmentNoticePdfEntry[]
  /** Gazette date printed in the notice itself, never taken from the LandsD index. */
  gazetteDate: string | null
  rawText: string
}

export type PairedLandsdGovernmentNoticePdfEntry = {
  descriptions: { en: string | null; zhHant: string | null }
  districts?: { en: string | null; zhHant: string | null }
  effectiveDate: string | null
  gazetteDate: string
  parserDiagnostics: {
    en: LandsdGovernmentNoticePdfParse['diagnostics']
    zhHant: LandsdGovernmentNoticePdfParse['diagnostics']
  }
  previousNoticeRefs: string[]
  rawExtractedText: { en: string; zhHant: string; zhHantNative?: string }
}

const MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

/** Parse the annual notice table published by LandsD. */
export function parseLandsdStreetNoticePage(html: string): LandsdStreetNoticePage {
  const page = parseLandsdStreetSourcePage(html, 'en')
  return {
    lastModified: page.lastModified,
    notices: page.notices.map(notice => ({
      changeType: notice.governmentNoticeType,
      date: notice.publicationDate,
      district: notice.district,
      key: sha256(
        [
          notice.publicationDate,
          stableGovernmentNoticeIdentity(notice.governmentNotice),
          stablePlanIdentity(notice.planUrls),
          classifyGovernmentNoticeType(notice.governmentNoticeType, 'en'),
          String(notice.ordinal),
        ].join('\0'),
      ),
      nameEn: notice.name,
      noticeLink: notice.governmentNotice,
      planLinks: notice.planUrls,
    })),
  }
}

/**
 * Parses either official language page without forcing its localized labels
 * into the other language. Pairing happens in `pairLandsdStreetNoticePages`.
 */
export function parseLandsdStreetSourcePage(
  html: string,
  locale: LandsdStreetPageLocale,
): LandsdStreetSourcePage {
  const lastModified = readLandsdPageLastModified(html, locale)
  if (!lastModified) {
    throw new Error(
      `LandsD ${locale} street-naming page did not expose a last-modified date.`,
    )
  }

  const notices: LandsdStreetSourceNoticeRow[] = []
  let ordinal = 0
  for (const match of html.matchAll(
    /<tr\b[^>]*data-year="\d{4}"[^>]*>([\s\S]*?)<\/tr>/gi,
  )) {
    const cells = [...(match[1] ?? '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      cell => cell[1] ?? '',
    )
    if (cells.length < 6) continue

    const publicationDate = parseLandsdSourceDate(stripHtml(cells[0] ?? ''), locale)
    const name = stripHtml(cells[1] ?? '')
    if (!publicationDate || !name) continue

    const governmentNotice = readLinks(cells[4] ?? '')[0] ?? null
    const planUrls = readLinks(cells[5] ?? '').filter(link => link.label !== '-')
    notices.push({
      district: stripHtml(cells[2] ?? ''),
      governmentNotice,
      governmentNoticeType: stripHtml(cells[3] ?? ''),
      locale,
      name,
      ordinal,
      planUrls,
      publicationDate,
    })
    ordinal += 1
  }

  if (notices.length === 0) {
    throw new Error(`LandsD ${locale} street-naming page did not contain notice rows.`)
  }

  return { lastModified, locale, notices }
}

/**
 * Pairs bilingual notices using Gazette evidence, never the mutable street
 * name. A final per-evidence ordinal only resolves multiple streets published
 * in the same notice; any mismatch blocks the ingestion.
 */
export function pairLandsdStreetNoticePages(input: {
  en: LandsdStreetSourcePage
  zhHant: LandsdStreetSourcePage
}) {
  assertPageLocale(input.en, 'en')
  assertPageLocale(input.zhHant, 'zh-Hant')

  const englishGroups = groupNoticesByIdentity(input.en.notices)
  const chineseGroups = groupNoticesByIdentity(input.zhHant.notices)
  const identities = new Set([...englishGroups.keys(), ...chineseGroups.keys()])
  const paired: PairedLandsdStreetNotice[] = []
  const issues: string[] = []

  for (const identity of [...identities].sort()) {
    const englishRows = englishGroups.get(identity) ?? []
    const chineseRows = chineseGroups.get(identity) ?? []
    if (englishRows.length !== chineseRows.length) {
      issues.push(
        `${identity}: English has ${englishRows.length} row(s), Traditional Chinese has ${chineseRows.length}.`,
      )
      continue
    }

    for (const [index, english] of englishRows.entries()) {
      const chinese = chineseRows[index]
      if (!chinese) {
        issues.push(`${identity}: missing Traditional Chinese row at ordinal ${index}.`)
        continue
      }
      const governmentNoticeType = classifyGovernmentNoticeType(
        english.governmentNoticeType,
        'en',
      )
      const chineseNoticeType = classifyGovernmentNoticeType(
        chinese.governmentNoticeType,
        'zh-Hant',
      )
      if (governmentNoticeType !== chineseNoticeType) {
        issues.push(
          `${identity}: notice-type mismatch (${english.governmentNoticeType} / ${chinese.governmentNoticeType}).`,
        )
        continue
      }
      paired.push({
        district: { en: english.district, zhHant: chinese.district },
        governmentNotices: {
          en: english.governmentNotice,
          zhHant: chinese.governmentNotice,
        },
        governmentNoticeType,
        id: `landsd-street-notice:${sha256(`${identity}\0${index}`)}`,
        // Government Notice numbers recur in different years. The source URL
        // (normalised across the bilingual publisher paths) scopes a PDF-row
        // group; `governmentNoticeIdentity` remains the display reference.
        noticeIdentity: stableGovernmentNoticeIdentity(english.governmentNotice),
        names: { en: english.name, zhHant: chinese.name },
        noticeOrdinal: index,
        planUrls: mergeEquivalentPlanUrls(english.planUrls, chinese.planUrls),
        publicationDate: english.publicationDate,
        sourceOrdinals: { en: english.ordinal, zhHant: chinese.ordinal },
      })
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `LandsD bilingual pairing failed:\n${issues.map(issue => `- ${issue}`).join('\n')}`,
    )
  }

  return paired.sort((left, right) =>
    `${left.publicationDate}:${left.id}`.localeCompare(
      `${right.publicationDate}:${right.id}`,
    ),
  )
}

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
        issues.push(`${notice.id}: bilingual PDFs disagree about Gazette date.`)
        continue
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

/** Parse the text emitted by `pdftotext -layout` for the LandsD PDF. */
export function parseLandsdStreetPdfText(text: string): LandsdStreetPdfRow[] {
  const rows: LandsdStreetPdfRow[] = []
  let englishColumn = 0
  let chineseColumn = 37
  let districtColumn = 52

  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/English Name\s+Chinese Name\s+District Code/)
    if (header) {
      englishColumn = line.indexOf('English Name')
      chineseColumn = line.indexOf('Chinese Name')
      districtColumn = line.indexOf('District Code')
      continue
    }
    if (
      !line.trim() ||
      /Page\s+\d+\s+Dec\s+\d{4}/.test(line) ||
      /District Code Reference Table/.test(line) ||
      /District Code\s+English District Name/.test(line) ||
      districtColumn <= chineseColumn
    ) {
      continue
    }

    const englishName = line.slice(englishColumn, chineseColumn).trim()
    const chineseName = line.slice(chineseColumn, districtColumn).trim()
    const districtCode = normalisePdfText(line.slice(districtColumn).trim())
    if (
      !englishName ||
      !chineseName ||
      !districtCode ||
      !/^[A-Za-z]/.test(englishName)
    ) {
      continue
    }
    rows.push({ englishName, chineseName, districtCode })
  }

  if (rows.length === 0) {
    throw new Error('LandsD street-name PDF did not contain any street rows.')
  }
  return rows
}

function readLinks(html: string) {
  return [
    ...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ].map(match => ({
    label: stripHtml(match[2] ?? ''),
    url: new URL(match[1] ?? '', LANDSD_STREET_NAMING_URL).toString(),
  }))
}

function readLandsdPageLastModified(html: string, locale: LandsdStreetPageLocale) {
  const candidates = [
    ...html.matchAll(/Last modified:\s*([^<)]+)/gi),
    ...html.matchAll(/最後修訂日期:\s*([^<)]+)/gi),
    ...html.matchAll(
      /<div\b[^>]*class=["'][^"']*hidden_revision_date[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    ),
  ]
    .map(match => parseLandsdSourceDate(stripHtml(match[1] ?? ''), locale))
    .filter((date): date is string => Boolean(date))
    .sort()

  return candidates.at(-1)
}

function assertPageLocale(
  page: LandsdStreetSourcePage,
  locale: LandsdStreetPageLocale,
) {
  if (page.locale !== locale) {
    throw new Error(`Expected LandsD ${locale} page, received ${page.locale}.`)
  }
}

function groupNoticesByIdentity(rows: LandsdStreetSourceNoticeRow[]) {
  const groups = new Map<string, LandsdStreetSourceNoticeRow[]>()
  for (const row of rows) {
    const identity = [
      row.publicationDate,
      stableGovernmentNoticeIdentity(row.governmentNotice),
      stablePlanIdentity(row.planUrls),
      classifyGovernmentNoticeType(row.governmentNoticeType, row.locale),
    ].join('\0')
    const group = groups.get(identity) ?? []
    group.push(row)
    groups.set(identity, group)
  }

  for (const group of groups.values()) {
    group.sort((left, right) => left.ordinal - right.ordinal)
  }
  return groups
}

function stableGovernmentNoticeIdentity(link: LandsdStreetSourceLink | null) {
  if (!link) return 'none'
  const labelNumber = link.label.replaceAll(/[^0-9]/g, '')
  return [
    labelNumber || normaliseEvidencePath(link.label),
    normaliseGovernmentNoticePath(link.url),
  ].join('|')
}

export function governmentNoticeIdentity(link: LandsdStreetSourceLink | null) {
  if (!link) return null
  const label = link.label.match(/(?:g\.?\s*n\.?|第)?\s*(\d{2,})/i)?.[1]
  if (label) return `gn${label}`
  const urlNumber = link.url.match(/(?:egn|cgn|gn)[^0-9]*(\d{2,})(?:\.pdf)?$/i)?.[1]
  return urlNumber ? `gn${urlNumber}` : null
}

function stablePlanIdentity(links: LandsdStreetSourceLink[]) {
  return (
    links
      // Plan labels are localized, whereas their publisher URLs identify the same
      // Gazette plan on both language pages. Localized labels remain in the
      // record; they must not make otherwise equivalent bilingual rows diverge.
      .map(link => normalisePlanPath(link.url))
      .sort()
      .join('\u001e')
  )
}

function normaliseGovernmentNoticePath(value: string) {
  return normaliseEvidencePath(value)
    .replace(/\/(en|tc)\//g, '/{locale}/')
    .replace(/([/])(?:egn|cgn)(?=\d)/g, '$1gn')
}

function normalisePlanPath(value: string) {
  return normaliseEvidencePath(value).replace(/\/(en|tc)\//g, '/{locale}/')
}

function normaliseEvidencePath(value: string) {
  return value.normalize('NFKC').trim().toLowerCase().replaceAll(/\s+/g, ' ')
}

function classifyGovernmentNoticeType(
  value: string,
  locale: LandsdStreetPageLocale,
): PairedLandsdStreetNotice['governmentNoticeType'] {
  const normalised = normaliseEvidencePath(value)
  const english = {
    corrigendum: 'corrigendum',
    'declaration of street name': 'declaration',
    'declaration to change street name': 'change',
    'declaration to delete street name': 'deletion',
    'notice of intention to change street name': 'intention',
    'replacing description of street': 'change',
  } as const
  const traditionalChinese = {
    勘誤: 'corrigendum',
    取代街道說明: 'change',
    宣布刪除街道名稱: 'deletion',
    宣布删除街道名稱: 'deletion',
    宣布更改街道名稱: 'change',
    宣布街道名稱: 'declaration',
    擬更改街道名稱公告: 'intention',
  } as const
  const result =
    locale === 'en'
      ? english[normalised as keyof typeof english]
      : traditionalChinese[normalised as keyof typeof traditionalChinese]
  if (!result) {
    throw new Error(`Unrecognised LandsD ${locale} Government Notice type: ${value}`)
  }
  return result
}

function mergeEquivalentPlanUrls(
  english: LandsdStreetSourceLink[],
  traditionalChinese: LandsdStreetSourceLink[],
) {
  const englishByIdentity = new Map(
    english.map(link => [normalisePlanPath(link.url), link]),
  )
  const chineseByIdentity = new Map(
    traditionalChinese.map(link => [normalisePlanPath(link.url), link]),
  )
  const identities = new Set([...englishByIdentity.keys(), ...chineseByIdentity.keys()])
  if (
    englishByIdentity.size !== chineseByIdentity.size ||
    identities.size !== englishByIdentity.size
  ) {
    throw new Error('LandsD bilingual rows disagree about Related Gazette Plan URLs.')
  }
  return [...englishByIdentity.values()]
}

function parseLandsdSourceDate(value: string, locale: LandsdStreetPageLocale) {
  const normalised = stripHtml(value)
    .replaceAll(',', ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
  const chinese = normalised.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/)
  if (chinese) {
    return `${chinese[1]}-${chinese[2]?.padStart(2, '0')}-${chinese[3]?.padStart(2, '0')}`
  }
  const match = normalised.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (!match) {
    const numeric = normalised.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
    return numeric
      ? `${numeric[3] ?? ''}-${(numeric[2] ?? '').padStart(2, '0')}-${(numeric[1] ?? '').padStart(2, '0')}`
      : undefined
  }
  const month = MONTHS[match[2]?.toLowerCase() ?? '']
  if (month) return `${match[3]}-${month}-${match[1]?.padStart(2, '0')}`
  if (locale === 'en') return undefined
  return undefined
}

function stripHtml(value: string) {
  return decodeEntities(
    value
      .replace(/<[^>]+>/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim(),
  )
}

function decodeEntities(value: string) {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

function normalisePdfText(value: string) {
  return value.replaceAll('‐', '-').replaceAll('‑', '-')
}

/** Keep visual table columns separate when the PDF extractor emits controls. */
function normaliseExtractedPdfLayoutText(value: string) {
  return [...value]
    .map(character => {
      const codePoint = character.codePointAt(0)
      return codePoint !== undefined &&
        codePoint < 0x20 &&
        !'\t\n\r'.includes(character)
        ? ' '
        : character
    })
    .join('')
}

function cleanPdfCell(value: string) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

/**
 * Three-column replacement notices frequently have a glyph-width mismatch
 * between their header and data rows. `pdftotext -layout` therefore puts the
 * visible Name/Previous G.N. cells several character positions away from the
 * header. The predecessor cell has a recognisable right-hand anchor, so split
 * from that anchor instead of trusting the header's string offset.
 */
function splitGovernmentNoticeThreeColumnRow(
  line: string,
  locale: LandsdStreetPageLocale,
) {
  const chineseInlinePrevious =
    locale === 'zh-Hant'
      ? lastMatch(line, /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*第\s*\d+\s*號/gu)
      : null
  const previousMatch =
    locale === 'en'
      ? (lastMatch(line, /\bG\.?\s*N\.?\s*\d+/gi) ?? lastMatch(line, /\bdated\b/gi))
      : (chineseInlinePrevious ??
        lastMatch(
          line,
          /(?:\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|第\s*\d+\s*號)/gu,
        ) ??
        lastMatch(line, /\s{8,}\d+\s*號/gu))
  if (!previousMatch || previousMatch.index === undefined) return null

  const beforePrevious = line.slice(0, previousMatch.index)
  const previous = cleanPdfCell(line.slice(previousMatch.index))
  if (locale === 'en') {
    const nameMatch = beforePrevious.match(
      /(?:^|\s)([A-Z][A-Z0-9]*(?:[ -]+[A-Z0-9]+)*)\s*$/,
    )
    const name = nameMatch?.[1] ?? ''
    if (!name) return null
    const nameStart =
      nameMatch?.index === undefined
        ? -1
        : nameMatch.index + (nameMatch[0].startsWith(' ') ? 1 : 0)
    return {
      description:
        nameStart >= 0 ? cleanPdfCell(beforePrevious.slice(0, nameStart)) : '',
      name,
      previous,
    }
  }

  if (/^(?:第\s*)?\d+\s*號/u.test(previous)) {
    return { description: cleanPdfCell(beforePrevious), name: '', previous }
  }
  const nameMatch = beforePrevious.match(/(?:^|\s)([^\s]+)\s*$/u)
  const name =
    nameMatch?.[0].startsWith(' ') &&
    /^[\p{Script=Han}]{2,12}$/u.test(nameMatch[1] ?? '')
      ? (nameMatch[1] ?? '')
      : ''
  const nameStart =
    nameMatch?.index === undefined
      ? -1
      : nameMatch.index + (nameMatch[0].startsWith(' ') ? 1 : 0)
  return {
    description: nameStart >= 0 ? cleanPdfCell(beforePrevious.slice(0, nameStart)) : '',
    name,
    previous,
  }
}

function lastMatch(value: string, expression: RegExp) {
  return [...value.matchAll(expression)].at(-1) ?? null
}

function hasChinesePreviousNoticeCell(line: string) {
  return /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日(?:\s*第\s*\d+\s*號)?\s*$/u.test(line)
}

function extractThreeColumnContinuationName(
  line: string,
  locale: LandsdStreetPageLocale,
  nameColumn: number,
  previousColumn: number,
) {
  // New Chinese rows always expose their preceding notice's date. A line
  // without one is description or a reference continuation, never a wrapped
  // Chinese street-name cell in the notices observed here.
  if (locale === 'zh-Hant') return ''
  const candidate = cleanGovernmentNoticeNameCell(
    line,
    nameColumn,
    previousColumn,
    locale,
  )
  if (/^[A-Z][A-Z -]*$/.test(candidate)) return candidate
  return line.match(/(?:^|\s)([A-Z][A-Z -]*)\s*$/)?.[1] ?? ''
}

/**
 * `pdftotext -layout` positions a table heading from its glyph bounding box,
 * not its visible first letter. In some notices that starts one to a few
 * characters right of the actual name column (for example `n TAN LAI
 * STREET`). Recover the all-caps English name only when that displacement is
 * observable; normal title-case fixtures and historic layouts retain their
 * declared column position.
 */
function cleanGovernmentNoticeNameCell(
  line: string,
  nameColumn: number,
  previousColumn: number | undefined,
  locale: LandsdStreetPageLocale,
) {
  const direct = cleanPdfCell(line.slice(nameColumn, previousColumn))
  if (locale !== 'en') return direct

  const shifted = line.slice(Math.max(0, nameColumn - 16), previousColumn)
  const recovered = shifted.match(/(?:^|\s)([A-Z][A-Z0-9]*(?:[ -]+[A-Z0-9]+)*)\s*$/)
  const candidate = recovered?.[1]
  const prefix = shifted.slice(0, recovered?.index ?? 0)
  return candidate &&
    (direct === '' ||
      /^[a-z]/.test(direct) ||
      (candidate.endsWith(direct) &&
        candidate.length > direct.length &&
        /[a-z]/.test(prefix)))
    ? candidate
    : direct
}

function extractGovernmentNoticeReferences(
  value: string,
  options: { allowBareChinese?: boolean; allowOrphanChineseNumber?: boolean } = {},
) {
  const matches = value.matchAll(
    new RegExp(
      String.raw`(?:G\.?\s*N\.?|Government\s+Notice(?:\s+No\.?)?)\s*(\d{2,})(?:\s*(?:of|\/|,|-)\s*\d{4})?|第\s*(\d{2,})\s*號\s*(?:政府)?公告${options.allowBareChinese ? String.raw`|第\s*(\d{2,})\s*號` : ''}${options.allowOrphanChineseNumber ? String.raw`|(\d{2,})\s*號` : ''}`,
      'gi',
    ),
  )
  return uniqueStrings(
    [...matches].map(
      match => `gn${match[1] ?? match[2] ?? match[3] ?? match[4] ?? ''}`,
    ),
  )
}

function isGovernmentNoticePostamble(line: string, locale: LandsdStreetPageLocale) {
  return locale === 'en'
    ? /^\s*A copy of (?:Plan No\.|this notice)/i.test(line)
    : /^\s*查\s*閱\s*第?.*(?:圖\s*則|本\s*公\s*告)/u.test(line)
}

function isGovernmentNoticeTableHeader(line: string, locale: LandsdStreetPageLocale) {
  return locale === 'en'
    ? /\bDescription\b.*\bName\b/i.test(line) ||
        /\bDistrict\b.*\b(?:Street\s+)?Names?\b.*\bNamed\s+in\b/i.test(line)
    : /(?:說明|描述).*?(?:名稱|名字)/u.test(line) ||
        /(?:地區|區域).*?(?:街道)?名稱.*?(?:刊載於|原載於|政府公告)/u.test(line)
}

function isGovernmentNoticeSignatureLine(line: string, locale: LandsdStreetPageLocale) {
  return locale === 'en'
    ? /\bfor Director of Lands\b/i.test(line)
    : /地政總署署長/u.test(line)
}

function startsGovernmentNoticeDescriptionRow(
  description: string,
  locale: LandsdStreetPageLocale,
) {
  return locale === 'en'
    ? /^(?:The|This|A)\s+(?:street|road|interchange)\b/i.test(description)
    : /^(?:這|此|該)(?:街道|道路|交匯處)/u.test(description.replaceAll(/\s+/g, ''))
}

function extractPreviousNoticeReferences(value: string) {
  const lines = value.split(/\r?\n/)
  // A Chinese notice heading itself is often written merely as `第 N 號公告`,
  // whereas predecessor citations can also omit `政府` when the same sentence
  // establishes that they are announcements. Remove the heading explicitly,
  // then accept that concise citation form only on announcement-bearing lines.
  const headingReference = lines
    .slice(0, 8)
    .map(line => extractGovernmentNoticeReferences(line, { allowBareChinese: true })[0])
    .find((reference): reference is string => Boolean(reference))
  return uniqueStrings(
    lines
      .flatMap(line =>
        extractGovernmentNoticeReferences(line, {
          allowBareChinese: /公告/u.test(line),
        }),
      )
      .filter(reference => reference !== headingReference),
  )
}

function parseNoticeEffectiveDate(value: string) {
  const english = value.match(
    /(?:with\s+effect\s+from|effective\s+from|with\s+effect\s+on)\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i,
  )
  if (english) return parseLandsdSourceDate(english[1] ?? '', 'en') ?? null
  const chinese = value.match(
    /(?:由|自|於)?\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(?:起)?/u,
  )
  if (!chinese) return null
  return `${chinese[1]}-${chinese[2]?.padStart(2, '0')}-${chinese[3]?.padStart(2, '0')}`
}

function matchingPdfEntries(
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
function selectBilingualPdfEntries(input: {
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
function selectStructurallyAlignedPdfEntries(input: {
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

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort()
}

function sameStrings(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every(value => right.has(value))
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
