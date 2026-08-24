export const apiLocales = ['en', 'zh-hant', 'zh-hans'] as const
export const apiProfileNames = ['compact', 'default', 'map', 'full'] as const

export type ApiLocale = (typeof apiLocales)[number]
export type ApiProfileName = (typeof apiProfileNames)[number]
export type ApiProfileDocumentationLocale = 'en' | 'zh-Hant' | 'zh-Hans'
export type RequestedApiLocale = ApiLocale | (string & {})
export type RequestedApiLocaleSelection =
  | {
      mode: 'all'
      locales: ['*']
    }
  | {
      mode: 'none'
      locales: []
    }
  | {
      mode: 'requested'
      locales: RequestedApiLocale[]
    }

const LOCALE_SEPARATOR = ','
const LOCALE_LANGUAGE_RE = /^[a-z]{2,3}$/
const LOCALE_SCRIPT_RE = /^[a-z]{4}$/
const LOCALE_REGION_RE = /^[a-z]{2}$/
const REQUESTED_LOCALE_EXAMPLES = '"en", "zh-hant", "zh-hant-hk"'
const REQUESTED_LOCALE_LIST_EXAMPLE = '"en,zh-hant"'

export const defaultApiLocalesByProfile: Record<ApiProfileName, ApiLocale[]> = {
  compact: ['en', 'zh-hant'],
  default: ['en', 'zh-hant'],
  full: ['en', 'zh-hant', 'zh-hans'],
  map: ['en', 'zh-hant'],
}

type ApiProfileDocumentation = {
  coverage: string
  useCase: string
}

export const apiProfileDocumentationByFamily = {
  divisions: {
    compact: {
      en: {
        useCase: 'keeping downloads small or populating a simple list',
        coverage: 'identifier, type, level, division code and requested display names',
      },
      'zh-Hant': {
        useCase: '需要小型下載或建立簡單清單',
        coverage: '識別碼、類型、層級、分區代碼及所選語言的顯示名稱',
      },
      'zh-Hans': {
        useCase: '需要小型下载或建立简单清单',
        coverage: '标识符、类型、层级、分区代码及所选语言的显示名称',
      },
    },
    default: {
      en: {
        useCase: 'showing standard division information',
        coverage: 'compact fields plus Wikidata and record timestamps',
      },
      'zh-Hant': {
        useCase: '需要顯示一般分區資訊',
        coverage: '基本欄位，加上 Wikidata 及記錄時間戳記',
      },
      'zh-Hans': {
        useCase: '需要显示一般分区信息',
        coverage: '基本字段，加上 Wikidata 及记录时间戳',
      },
    },
    map: {
      en: {
        useCase: 'drawing, labelling or fitting a map',
        coverage:
          'default fields plus point geometry, bounding box and cartographic hints',
      },
      'zh-Hant': {
        useCase: '需要繪製、標示或縮放地圖',
        coverage: '預設欄位，加上點幾何、邊界框及製圖提示',
      },
      'zh-Hans': {
        useCase: '需要绘制、标注或缩放地图',
        coverage: '默认字段，加上点几何、边界框及制图提示',
      },
    },
    full: {
      en: {
        useCase: 'auditing a record, tracing provenance or using compatibility data',
        coverage:
          'map fields plus all locales and name variants, source lineage, identifiers, snapshot ID and retained Overture compatibility fields',
      },
      'zh-Hant': {
        useCase: '需要審核記錄、追溯來源或使用相容性資料',
        coverage:
          '地圖欄位，加上所有語言及名稱變體、來源脈絡、識別碼、快照 ID，以及保留的 Overture 相容性欄位',
      },
      'zh-Hans': {
        useCase: '需要审核记录、追溯来源或使用兼容性资料',
        coverage:
          '地图字段，加上所有语言及名称变体、来源脉络、标识符、快照 ID，以及保留的 Overture 兼容性字段',
      },
    },
  },
} as const satisfies Record<
  'divisions',
  Record<ApiProfileName, Record<ApiProfileDocumentationLocale, ApiProfileDocumentation>>
>

export function isApiLocale(value: string): value is ApiLocale {
  return apiLocales.includes(value as ApiLocale)
}

export function normaliseRequestedApiLocale(value: string) {
  const normalised = value.trim().replaceAll('_', '-').toLowerCase()

  return normalised.length > 0 ? normalised : null
}

function isValidStructuredLocale(value: string) {
  const parts = value.split('-')

  if (!LOCALE_LANGUAGE_RE.test(parts[0] ?? '')) {
    return false
  }

  if (parts.length === 1) {
    return true
  }

  if (parts.length === 2) {
    const secondPart = parts[1] ?? ''
    return LOCALE_SCRIPT_RE.test(secondPart) || LOCALE_REGION_RE.test(secondPart)
  }

  if (parts.length === 3) {
    return (
      LOCALE_SCRIPT_RE.test(parts[1] ?? '') && LOCALE_REGION_RE.test(parts[2] ?? '')
    )
  }

  return false
}

export function getRequestedApiLocalesValidationError(value: string): string | null {
  const normalised = value.trim().replaceAll('_', '-').toLowerCase()

  if (normalised.length === 0) {
    return `locales must be ${REQUESTED_LOCALE_LIST_EXAMPLE}, "*", or "null"`
  }

  if (normalised === '*' || normalised === 'null') {
    return null
  }

  const locales = value.split(LOCALE_SEPARATOR)

  for (const rawLocale of locales) {
    const locale = normaliseRequestedApiLocale(rawLocale)

    if (!locale) {
      return `locales must be a comma-separated list like ${REQUESTED_LOCALE_LIST_EXAMPLE}, "*" for all locales, or "null" for no i18n`
    }

    if (locale === '*' || locale === 'null') {
      return '"*" and "null" must be used on their own'
    }

    if (!isValidStructuredLocale(locale)) {
      return `invalid locale "${locale}"; use lowercase tags like ${REQUESTED_LOCALE_EXAMPLES}, or "*" for all locales, or "null" for no i18n`
    }
  }

  return null
}

export function isValidRequestedApiLocales(value: string): boolean {
  return getRequestedApiLocalesValidationError(value) === null
}

export function parseRequestedApiLocales(
  value: string | undefined,
  defaults: RequestedApiLocaleSelection,
): RequestedApiLocaleSelection {
  if (value === undefined) {
    if (defaults.mode === 'all') {
      return {
        mode: 'all',
        locales: ['*'],
      }
    }

    if (defaults.mode === 'none') {
      return {
        mode: 'none',
        locales: [],
      }
    }

    return {
      mode: 'requested',
      locales: [...defaults.locales],
    }
  }

  const validationError = getRequestedApiLocalesValidationError(value)

  if (validationError) {
    throw new Error(validationError)
  }

  const normalised = value.trim().replaceAll('_', '-').toLowerCase()

  if (normalised === '*') {
    return {
      mode: 'all',
      locales: ['*'],
    }
  }

  if (normalised === 'null') {
    return {
      mode: 'none',
      locales: [],
    }
  }

  const locales = value
    .split(LOCALE_SEPARATOR)
    .map(locale => normaliseRequestedApiLocale(locale))
    .filter((locale): locale is RequestedApiLocale => locale !== null)

  return {
    mode: 'requested',
    locales: [...new Set(locales)],
  }
}
