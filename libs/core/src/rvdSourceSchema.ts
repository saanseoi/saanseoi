/** Meanings of the assertions extracted from the HKPR 2015 Areas and Districts appendix. */
const copy = {
  en: {
    areaCode:
      'SaanSeoi code for the appendix’s broad area: HK (Hong Kong Island), KL (Kowloon) or NT (New Territories). Not a publisher-assigned identifier.',
    districtCode:
      'SaanSeoi code for the district listed in the appendix. Also identifies the district containing a subdistrict or included locality; absent for area records.',
    includedIn:
      'sourceRecordId of the entry that explicitly includes this locality. For example, Tung Chung is listed within Lantau Island.',
    kind: 'Type of entry in the appendix: area, district, subdistrict or a locality explicitly included within another entry. These describe publication membership, not statutory boundaries.',
    names:
      'English and Traditional Chinese names of this entry, extracted from the bilingual appendix.',
    en: 'English text from the appendix.',
    zh: 'Traditional Chinese text from the appendix.',
    page: 'Page number within the four-page appendix, starting at 1; not the page number of the complete Property Review.',
    rawNames:
      'District-level text listing its subdistrict names, before splitting the list into individual entries. PDF text-extraction spacing repairs are applied.',
    tertiaryPlanningUnits:
      'Tertiary planning unit references listed for this district, as text. The publisher’s (p) marker indicates that only part of a unit is included.',
    unit: 'One listed tertiary planning unit reference, including any (p) marker.',
  },
  'zh-hant': {
    areaCode:
      '山水為附錄大區編配的代碼：HK（港島）、KL（九龍）或 NT（新界），並非發布者編配的識別碼。',
    districtCode:
      '山水為附錄所列地區編配的代碼，亦標示分區或所包括地點所屬的地區；大區記錄沒有此欄位。',
    includedIn: '明確包括此地點的條目之 sourceRecordId，例如東涌列於大嶼山之內。',
    kind: '附錄條目類型：area（大區）、district（地區）、subdistrict（分區）或 included-locality（另一條目明確包括的地點）。表示刊物中的歸屬，並非法定邊界。',
    names: '從雙語附錄擷取的此條目英文及繁體中文名稱。',
    en: '附錄中的英文文字。',
    zh: '附錄中的繁體中文文字。',
    page: '在四頁附錄中的頁碼，由 1 開始，並非整份物業報告的頁碼。',
    rawNames:
      '地區條目所列的分區名稱原文，尚未拆分為個別條目；已修正 PDF 文字擷取造成的字距問題。',
    tertiaryPlanningUnits:
      '此地區所列的第三級規劃統計小區編號，以文字儲存。發布者的 (p) 標記表示只包括該小區的一部分。',
    unit: '一項所列的第三級規劃統計小區編號，包括可能附有的 (p) 標記。',
  },
  'zh-hans': {
    areaCode:
      '山水为附录大区分配的代码：HK（港岛）、KL（九龙）或 NT（新界），并非发布者分配的标识符。',
    districtCode:
      '山水为附录所列地区分配的代码，亦标示分区或所包括地点所属的地区；大区记录没有此字段。',
    includedIn: '明确包括此地点的条目之 sourceRecordId，例如东涌列于大屿山之内。',
    kind: '附录条目类型：area（大区）、district（地区）、subdistrict（分区）或 included-locality（另一条目明确包括的地点）。表示刊物中的归属，并非法定边界。',
    names: '从双语附录提取的此条目英文及繁体中文名称。',
    en: '附录中的英文文字。',
    zh: '附录中的繁体中文文字。',
    page: '在四页附录中的页码，从 1 开始，并非整份物业报告的页码。',
    rawNames:
      '地区条目所列的分区名称原文，尚未拆分为个别条目；已修正 PDF 文字提取造成的字距问题。',
    tertiaryPlanningUnits:
      '此地区所列的第三级规划统计小区编号，以文字存储。发布者的 (p) 标记表示只包括该小区的一部分。',
    unit: '一项所列的第三级规划统计小区编号，包括可能附有的 (p) 标记。',
  },
}

type Field = {
  type: string
  description: string
  enum?: string[]
  properties?: Record<string, Field>
  items?: Field
  additionalProperties?: boolean
}
export function rvdSourceFields(locale = 'en'): Record<string, Field> {
  const text = copy[locale.toLowerCase() as keyof typeof copy] ?? copy.en
  const names = (description: string): Field => ({
    type: 'object',
    description,
    additionalProperties: false,
    properties: {
      en: { type: 'string', description: text.en },
      'zh-hant': { type: 'string', description: text.zh },
    },
  })
  return {
    areaCode: { type: 'string', description: text.areaCode, enum: ['HK', 'KL', 'NT'] },
    districtCode: { type: 'string', description: text.districtCode },
    includedIn: { type: 'string', description: text.includedIn },
    kind: {
      type: 'string',
      description: text.kind,
      enum: ['area', 'district', 'subdistrict', 'included-locality'],
    },
    names: names(text.names),
    page: { type: 'integer', description: text.page },
    rawNames: names(text.rawNames),
    tertiaryPlanningUnits: {
      type: 'array',
      description: text.tertiaryPlanningUnits,
      items: { type: 'string', description: text.unit },
    },
  }
}
