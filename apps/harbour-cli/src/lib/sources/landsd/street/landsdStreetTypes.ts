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

/** A corrigendum that corrects the printed date in an earlier Chinese notice. */
export type LandsdChineseNoticeDateCorrigendum = {
  correctedDate: string
  erroneousDate: string
  targetNoticeRef: string
}

export const MONTHS: Record<string, string> = {
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
