// Shared bodies only: headings and domain-specific notes stay in guide fixtures.
const sections = {
  responseProfilesSection: {
    en: `A <black>profile</black> controls how much information each response contains. If you do
not choose one, the API uses <black>default</black>.

{{apiProfileTable:en}}

For a map-ready response, set <black>profile=map</black>:

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=map
\`\`\``,
    'zh-Hant': `profile 控制每個回應所含資料的多寡。可在[範例分頁](?tab=samples)試用各個 profile。以
<black>profile=</black> 設定；省略時，API 使用 <black>default</black>。

{{apiProfileTable:zh-Hant}}

如需適合地圖使用的回應，請設定 <black>profile=map</black>：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=map
\`\`\``,
    'zh-Hans': `profile 控制每个响应所含数据的多少。可在[示例分页](?tab=samples)试用各个 profile。以
<black>profile=</black> 设置；省略时，API 使用 <black>default</black>。

{{apiProfileTable:zh-Hans}}

如需适合地图使用的响应，请设置 <black>profile=map</black>：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=map
\`\`\``,
  },
  localeSelectionSection: {
    en: `Unless you select <black>profile=full</black>, names are returned in English and
Traditional Chinese by default: <black>locales=en,zh-hant</black>. With
<black>profile=full</black>, every available locale is returned by default. To add
Simplified Chinese to the usual default selection, call

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 locales=en,zh-hant,zh-hans
\`\`\`

Use <black>locales=*</black> for every available locale, or provide another supported
comma-separated list. Use <black>locales=null</black> to leave <black>i18n</black> out
of the response.`,
    'zh-Hant': `除非選取
<black>profile=full</black>，否則名稱預設以英文及繁體中文傳回：<black>locales=en,zh-hant</black>。使用
<black>profile=full</black>
時，預設傳回所有可用 locale。如要在一般預設選擇中加入簡體中文，請呼叫：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 locales=en,zh-hant,zh-hans
\`\`\`

使用 <black>locales=*</black>
取得所有可用 locale，或提供另一個受支援的逗號分隔清單。使用 <black>locales=null</black>
可使回應不包含 <black>i18n</black>。`,
    'zh-Hans': `除非选择
<black>profile=full</black>，否则名称默认以英文及繁体中文返回：<black>locales=en,zh-hant</black>。使用
<black>profile=full</black>
时，默认返回所有可用 locale。如要在一般默认选择中加入简体中文，请调用：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 locales=en,zh-hant,zh-hans
\`\`\`

使用 <black>locales=*</black>
获取所有可用 locale，或提供另一个受支持的逗号分隔列表。使用 <black>locales=null</black>
可使响应不包含 <black>i18n</black>。`,
  },
  paginationSection: {
    en: `Use <black>page[limit]</black> and <black>page[offset]</black> to work through the
filtered results. A page can contain at most 100 items:

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 page[limit]=25&
                 page[offset]=50
\`\`\`

Follow the response's <black>links.next</black>, <black>links.prev</black>, and
<black>links.first</black> instead of calculating the next offset yourself. Use
<black>meta.page.total</black> to show or plan for the complete filtered result.`,
    'zh-Hant': `使用 <black>page[limit]</black> 及 <black>page[offset]</black>
瀏覽篩選結果。每頁最多可含 100 項：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 page[limit]=25&
                 page[offset]=50
\`\`\`

請跟隨回應中的 <black>links.next</black>、<black>links.prev</black> 及
<black>links.first</black>，而非自行計算下一個 offset。使用
<black>meta.page.total</black> 顯示或規劃完整的篩選結果。`,
    'zh-Hans': `使用 <black>page[limit]</black> 及 <black>page[offset]</black>
浏览筛选结果。每页最多可含 100 项：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 page[limit]=25&
                 page[offset]=50
\`\`\`

请跟随响应中的 <black>links.next</black>、<black>links.prev</black> 及
<black>links.first</black>，而非自行计算下一个 offset。使用
<black>meta.page.total</black> 显示或规划完整的筛选结果。`,
  },
} as const

export function expandGuideSections(
  markdown: string,
  frontmatter: Record<string, string>,
) {
  return markdown.replace(
    /\{\{(paginationSection|responseProfilesSection|localeSelectionSection):(en|zh-Hant|zh-Hans)\}\}/g,
    (_tag, section: keyof typeof sections, locale: 'en' | 'zh-Hant' | 'zh-Hans') => {
      const body = sections[section][locale]
      // Statistics guides use the official observation endpoint.
      return section === 'paginationSection' && frontmatter.apiFamily === 'stats'
        ? body.replace('/{{apiFamily}}/{{ apiVersionPath }}?', '/stats/v0?')
        : body
    },
  )
}
