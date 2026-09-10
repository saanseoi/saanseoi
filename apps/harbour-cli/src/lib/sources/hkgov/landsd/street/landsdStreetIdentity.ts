import {
  MONTHS,
  type LandsdStreetPageLocale,
  type LandsdStreetSourceLink,
  type LandsdStreetSourceNoticeRow,
  type PairedLandsdStreetNotice,
} from './landsdStreetTypes.ts'
import { stripHtml } from './landsdStreet.ts'

export function groupNoticesByIdentity(rows: LandsdStreetSourceNoticeRow[]) {
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

export function stableGovernmentNoticeIdentity(link: LandsdStreetSourceLink | null) {
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

export function stablePlanIdentity(links: LandsdStreetSourceLink[]) {
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

export function classifyGovernmentNoticeType(
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

export function mergeEquivalentPlanUrls(
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

export function parseLandsdSourceDate(value: string, locale: LandsdStreetPageLocale) {
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
