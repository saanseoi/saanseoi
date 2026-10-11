/** Field meanings for the complete LandsD Place Name source, across all three classes. */
const copy = {
  en: {
    district:
      'District code supplied by the Lands Department, for example SK for Sai Kung or YL for Yuen Long.',
    geoNameId:
      'Place identifier assigned by the Lands Department (GEO_NAME_ID). Identifies the place across its official names and aliases.',
    placeClass:
      'Broad kind of place: Settlement for inhabited places, Hydrographic for water features, or Topographic for landforms.',
    placeType:
      'More specific kind of place supplied by the publisher, such as Village, Stream, Hill or Island.',
    placeNames:
      'Publisher PLACE_NAME rows joined by GEO_NAME_ID. Each entry contains paired English and Traditional Chinese labels and the publisher’s name status. Missing labels are not translated or inferred.',
    status:
      'Publisher name status: Official for the official name, Alias for an alternative name.',
    en: 'English names supplied by the publisher (NAME_EN).',
    zh: 'Traditional Chinese names supplied by the publisher (NAME_TC).',
  },
  'zh-hant': {
    district: '地政總署提供的地區代碼，例如 SK 代表西貢，YL 代表元朗。',
    geoNameId:
      '地政總署編配的地名識別碼（GEO_NAME_ID），用於識別官方名稱及別名所屬的同一地點。',
    placeClass:
      '地點的主要類別：Settlement 為居住地、Hydrographic 為水文地物、Topographic 為地形。',
    placeType:
      '發布者提供的細分類別，例如 Village（村落）、Stream（溪流）、Hill（山丘）或 Island（島嶼）。',
    placeNames:
      '以 GEO_NAME_ID 配對的發布者 PLACE_NAME 記錄。每項包含成對的英文及繁體中文名稱，以及發布者的名稱狀態。不會翻譯或推斷缺少的名稱。',
    status: '發布者的名稱狀態：Official 表示官方名稱，Alias 表示別名。',
    en: '發布者提供的英文名稱（NAME_EN）。',
    zh: '發布者提供的繁體中文名稱（NAME_TC）。',
  },
  'zh-hans': {
    district: '地政总署提供的地区代码，例如 SK 代表西贡，YL 代表元朗。',
    geoNameId:
      '地政总署分配的地名标识符（GEO_NAME_ID），用于识别官方名称及别名所属的同一地点。',
    placeClass:
      '地点的主要类别：Settlement 为居住地、Hydrographic 为水文地物、Topographic 为地形。',
    placeType:
      '发布者提供的细分类别，例如 Village（村落）、Stream（溪流）、Hill（山丘）或 Island（岛屿）。',
    placeNames:
      '以 GEO_NAME_ID 匹配的发布者 PLACE_NAME 记录。每项包含成对的英文及繁体中文名称，以及发布者的名称状态。不会翻译或推断缺少的名称。',
    status: '发布者的名称状态：Official 表示官方名称，Alias 表示别名。',
    en: '发布者提供的英文名称（NAME_EN）。',
    zh: '发布者提供的繁体中文名称（NAME_TC）。',
  },
}

type Field = {
  type: string
  description: string
  nullable?: boolean
  enum?: string[]
  properties?: Record<string, Field>
  items?: Field
  required?: string[]
  additionalProperties?: boolean
}

/** Top-level presence and nullability still come from the stored release inventory. */
export function landsdPlaceNameSourceFields(locale = 'en'): Record<string, Field> {
  const text = copy[locale.toLowerCase() as keyof typeof copy] ?? copy.en
  return {
    district: { type: 'string', description: text.district },
    geoNameId: { type: 'string', description: text.geoNameId },
    placeClass: {
      type: 'string',
      description: text.placeClass,
      enum: ['Settlement', 'Hydrographic', 'Topographic'],
    },
    placeType: { type: 'string', description: text.placeType },
    placeNames: {
      type: 'array',
      description: text.placeNames,
      items: {
        type: 'object',
        description: text.placeNames,
        additionalProperties: false,
        required: ['nameEn', 'nameZhHant', 'nameStatus'],
        properties: {
          nameEn: { type: 'string', nullable: true, description: text.en },
          nameZhHant: { type: 'string', nullable: true, description: text.zh },
          nameStatus: {
            type: 'string',
            enum: ['Official', 'Alias'],
            description: text.status,
          },
        },
      },
    },
  }
}
