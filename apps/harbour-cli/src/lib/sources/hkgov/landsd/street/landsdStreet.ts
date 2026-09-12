import {
  LANDSD_STREET_NAMING_URL,
  type LandsdStreetNoticePage,
  type LandsdStreetPageLocale,
  type LandsdStreetSourceNoticeRow,
  type LandsdStreetSourcePage,
  type PairedLandsdStreetNotice,
} from './landsdStreetTypes.ts'
import { sha256 } from './landsdStreetMatching.ts'
import {
  classifyGovernmentNoticeType,
  groupNoticesByIdentity,
  mergeEquivalentPlanUrls,
  parseLandsdSourceDate,
  stableGovernmentNoticeIdentity,
  stablePlanIdentity,
} from './landsdStreetIdentity.ts'

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

export function stripHtml(value: string) {
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

export {
  LANDSD_STREET_NAMING_URL,
  LANDSD_STREET_PDF_URL,
  type LandsdStreetPdfRow,
  type LandsdStreetNoticePage,
  type LandsdStreetPageLocale,
  type LandsdStreetSourceKind,
  type LandsdStreetSourceLink,
  type LandsdStreetSourceNoticeRow,
  type LandsdStreetSourcePage,
  type PairedLandsdStreetNotice,
  type LandsdGovernmentNoticePdfEntry,
  type LandsdGovernmentNoticePdfParse,
  type PairedLandsdGovernmentNoticePdfEntry,
  type LandsdChineseNoticeDateCorrigendum,
} from './landsdStreetTypes.ts'

export {
  parseLandsdGovernmentNoticePdfText,
  parseLandsdGovernmentNoticeType,
  pairLandsdGovernmentNoticePdfEntries,
  parseLandsdChineseNoticeDateCorrigendum,
} from './landsdStreetNotices.ts'

export { parseLandsdStreetPdfText } from './landsdStreetPdf.ts'

export { governmentNoticeIdentity } from './landsdStreetIdentity.ts'
