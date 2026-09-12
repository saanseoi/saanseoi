import type { LandsdStreetPageLocale, LandsdStreetPdfRow } from './landsdStreetTypes.ts'
import { uniqueStrings } from './landsdStreetMatching.ts'
import { parseLandsdSourceDate } from './landsdStreetIdentity.ts'

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

function normalisePdfText(value: string) {
  return value.replaceAll('‐', '-').replaceAll('‑', '-')
}

/** Keep visual table columns separate when the PDF extractor emits controls. */
export function normaliseExtractedPdfLayoutText(value: string) {
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

export function cleanPdfCell(value: string) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

/**
 * Three-column replacement notices frequently have a glyph-width mismatch
 * between their header and data rows. `pdftotext -layout` therefore puts the
 * visible Name/Previous G.N. cells several character positions away from the
 * header. The predecessor cell has a recognisable right-hand anchor, so split
 * from that anchor instead of trusting the header's string offset.
 */
export function splitGovernmentNoticeThreeColumnRow(
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

export function hasChinesePreviousNoticeCell(line: string) {
  return /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日(?:\s*第\s*\d+\s*號)?\s*$/u.test(line)
}

export function extractThreeColumnContinuationName(
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
export function cleanGovernmentNoticeNameCell(
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

export function extractGovernmentNoticeReferences(
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

export function isGovernmentNoticePostamble(
  line: string,
  locale: LandsdStreetPageLocale,
) {
  return locale === 'en'
    ? /^\s*(?:A copy of (?:Plan No\.|this notice)|Plan No\..*\bmay be inspected\b)/i.test(
        line,
      )
    : /^\s*查\s*閱\s*第?.*(?:圖\s*則|本\s*公\s*告)/u.test(line)
}

export function isGovernmentNoticeTableHeader(
  line: string,
  locale: LandsdStreetPageLocale,
) {
  return locale === 'en'
    ? /\bDescription\b.*\bName\b/i.test(line) ||
        /\bDistrict\b.*\b(?:Street\s+)?Names?\b.*\bNamed\s+in\b/i.test(line)
    : /(?:說明|描述).*?(?:名稱|名字)/u.test(line) ||
        /(?:地區|區域).*?(?:街道)?名稱.*?(?:刊載於|原載於|政府公告)/u.test(line)
}

export function isGovernmentNoticeSignatureLine(
  line: string,
  locale: LandsdStreetPageLocale,
) {
  return locale === 'en'
    ? /\bfor Director of Lands\b/i.test(line)
    : /地政總署署長/u.test(line)
}

export function startsGovernmentNoticeDescriptionRow(
  description: string,
  locale: LandsdStreetPageLocale,
) {
  return locale === 'en'
    ? /^(?:The|This|A)\s+(?:street|road|interchange)\b/i.test(description)
    : /^(?:這|此|該)(?:街道|道路|交匯處)/u.test(description.replaceAll(/\s+/g, ''))
}

export function extractPreviousNoticeReferences(value: string) {
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

export function parseNoticeEffectiveDate(value: string) {
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
