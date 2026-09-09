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
  addresses: {
    compact: {
      en: {
        useCase: 'building a small address list or picker',
        coverage:
          'identifier, dataset, granularity, Address3D coverage, requested formatted addresses and Division relationships',
      },
      'zh-Hant': {
        useCase: '建立小型地址清單或選擇器',
        coverage:
          '識別碼、資料集、細緻度、Address3D 覆蓋、所選格式化地址及 Division 關係',
      },
      'zh-Hans': {
        useCase: '建立小型地址列表或选择器',
        coverage:
          '标识符、数据集、粒度、Address3D 覆盖、所选格式化地址及 Division 关系',
      },
    },
    default: {
      en: {
        useCase: 'showing ordinary address information',
        coverage: 'compact fields plus parsed address components and record timestamps',
      },
      'zh-Hant': {
        useCase: '顯示一般地址資料',
        coverage: '基本欄位，加上已解析的地址組成部分及記錄時間戳記',
      },
      'zh-Hans': {
        useCase: '显示一般地址资料',
        coverage: '基本字段，加上已解析的地址组成部分及记录时间戳',
      },
    },
    map: {
      en: {
        useCase: 'drawing or fitting address markers',
        coverage: 'default fields plus point geometry and bounding box',
      },
      'zh-Hant': {
        useCase: '繪製或縮放地址標記',
        coverage: '預設欄位，加上點幾何及邊界框',
      },
      'zh-Hans': {
        useCase: '绘制或缩放地址标记',
        coverage: '默认字段，加上点几何及边界框',
      },
    },
    full: {
      en: {
        useCase: 'auditing an address or tracing its source',
        coverage:
          'map fields plus all stored locales, snapshot ID, publisher identifiers and source evidence',
      },
      'zh-Hant': {
        useCase: '審核地址或追溯其來源',
        coverage: '地圖欄位，加上所有已儲存語言、快照 ID、發布者識別碼及來源證據',
      },
      'zh-Hans': {
        useCase: '审核地址或追溯其来源',
        coverage: '地图字段，加上所有已存储语言、快照 ID、发布者标识符及源证据',
      },
    },
  },
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
  places: {
    compact: {
      en: {
        useCase: 'building a small place list or category picker',
        coverage:
          'identifier, reference name, basic category, primary taxonomy, operating status and requested place names',
      },
      'zh-Hant': {
        useCase: '建立小型地點清單或類別選擇器',
        coverage: '識別碼、參考名稱、基本類別、主要分類、營運狀態及所選地點名稱',
      },
      'zh-Hans': {
        useCase: '建立小型地点列表或类别选择器',
        coverage: '标识符、参考名称、基本类别、主要分类、营运状态及所选地点名称',
      },
    },
    default: {
      en: {
        useCase: 'showing ordinary place information',
        coverage:
          'compact fields plus localised freeform addresses, complete taxonomy, contact details, confidence and record timing',
      },
      'zh-Hant': {
        useCase: '顯示一般地點資料',
        coverage:
          '基本欄位，加上本地化自由格式地址、完整分類、聯絡資料、可信度及記錄時間',
      },
      'zh-Hans': {
        useCase: '显示一般地点资料',
        coverage:
          '基本字段，加上本地化自由格式地址、完整分类、联系资料、可信度及记录时间',
      },
    },
    map: {
      en: {
        useCase: 'drawing or clustering place markers',
        coverage: 'default fields plus point geometry and bounding box',
      },
      'zh-Hant': {
        useCase: '繪製或叢集地點標記',
        coverage: '預設欄位，加上點幾何及邊界框',
      },
      'zh-Hans': {
        useCase: '绘制或聚合地点标记',
        coverage: '默认字段，加上点几何和边界框',
      },
    },
    full: {
      en: {
        useCase: 'auditing a place or tracing its source and localisation',
        coverage:
          'map fields plus all stored locales and variants, localisation provenance, snapshot and address references, source release and sources',
      },
      'zh-Hant': {
        useCase: '審核地點或追溯其來源及本地化資料',
        coverage:
          '地圖欄位，加上所有已儲存的語言及變體、本地化來源資料、快照及地址參照、來源發布及來源',
      },
      'zh-Hans': {
        useCase: '审核地点或追溯其来源及本地化资料',
        coverage:
          '地图字段，加上所有已存储的语言及变体、本地化来源资料、快照及地址引用、来源发布及来源',
      },
    },
  },
  stats: {
    compact: {
      en: {
        useCase: 'retrieving the core observation with the smallest locale selection',
        coverage:
          'dataset, reference period, geography, dimensions, values, comparability and requested related-resource locales',
      },
      'zh-Hant': {
        useCase: '以最小語言選擇取得核心觀測值',
        coverage: '資料集、參考期、地理範圍、維度、數值、可比性及所選相關資源語言',
      },
      'zh-Hans': {
        useCase: '以最小语言选择获取核心观测值',
        coverage: '数据集、参考期、地理范围、维度、数值、可比性及所选相关资源语言',
      },
    },
    default: {
      en: {
        useCase: 'showing an ordinary statistical observation',
        coverage:
          'dataset, reference period, geography, dimensions, values, comparability and requested related-resource locales',
      },
      'zh-Hant': {
        useCase: '顯示一般統計觀測值',
        coverage: '資料集、參考期、地理範圍、維度、數值、可比性及所選相關資源語言',
      },
      'zh-Hans': {
        useCase: '显示一般统计观测值',
        coverage: '数据集、参考期、地理范围、维度、数值、可比性及所选相关资源语言',
      },
    },
    map: {
      en: {
        useCase: 'joining observations to requested map geography',
        coverage:
          'default fields; use include=divisions or an area companion to retrieve display geometry',
      },
      'zh-Hant': {
        useCase: '將觀測值連接至所要求的地圖地理資料',
        coverage: '預設欄位；使用 include=divisions 或 area companion 取得顯示幾何資料',
      },
      'zh-Hans': {
        useCase: '将观测值连接至所请求的地图地理数据',
        coverage: '默认字段；使用 include=divisions 或 area companion 获取显示几何数据',
      },
    },
    full: {
      en: {
        useCase: 'auditing an observation or tracing its publisher source',
        coverage:
          'default fields plus source-release ID, publisher feature reference and record timestamps',
      },
      'zh-Hant': {
        useCase: '審核觀測值或追溯其發布者來源',
        coverage: '預設欄位，加上來源發布 ID、發布者 feature 參照及記錄時間戳記',
      },
      'zh-Hans': {
        useCase: '审核观测值或追溯其发布者来源',
        coverage: '默认字段，加上源发布 ID、发布者 feature 引用及记录时间戳',
      },
    },
  },
} as const satisfies Record<
  'addresses' | 'divisions' | 'places' | 'stats',
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
