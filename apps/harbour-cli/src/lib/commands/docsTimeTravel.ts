const sections = {
  en: `Time travel lets you reproduce an earlier analysis, explain a past response, or separate
a later backfill from what the catalogue knew when a decision was made. These selectors apply to collection requests.

Use <black>effectiveAt</black> to select the release effective at an instant:

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 effectiveAt={{timeTravelEffectiveAt}}
\`\`\`

Use <black>knownAt</black> to resolve the newest catalogue checkpoint known at an
instant, which excludes later backfills:

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 knownAt={{timeTravelKnownAt}}
\`\`\`

Use <black>catalogRevision</black> to pin one immutable published checkpoint. Combine it
with <black>releaseSet</black> when replaying a recorded result:

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 catalogRevision={{timeTravelCatalogRevision}}&
                 releaseSet={{ apiReleaseSet }}
\`\`\`

When selectors overlap, <black>catalogRevision</black> takes precedence over
<black>knownAt</black>, and <black>releaseSet</black> takes precedence over
<black>cohort</black> and <black>effectiveAt</black>.

Every successful response also provides <black>links.permalink</black>: a permanent link
to the resources you loaded. It contains the resolved
[release set](saanseoi:en:definition/release-set/v1) and
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1) selectors, so save it
to replay that exact result later.`,
  'zh-Hant': `時間旅行可讓你重現較早的分析、解釋過往回應，或區分稍後的回填資料與作出決定時目錄已知的內容。這些 selector 適用於 collection 請求。

使用 <black>effectiveAt</black> 選取某一時刻生效的發布：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 effectiveAt={{timeTravelEffectiveAt}}
\`\`\`

使用 <black>knownAt</black>
解析某一時刻已知的最新目錄 checkpoint，從而排除較後的回填資料：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 knownAt={{timeTravelKnownAt}}
\`\`\`

使用 <black>catalogRevision</black>
固定一個不可變的已發布 checkpoint。重播已記錄的結果時，請與 <black>releaseSet</black>
一併使用：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 catalogRevision={{timeTravelCatalogRevision}}&
                 releaseSet={{ apiReleaseSet }}
\`\`\`

當 selector 重疊時，<black>catalogRevision</black> 優先於 <black>knownAt</black>，而
<black>releaseSet</black> 優先於 <black>cohort</black> 及 <black>effectiveAt</black>。

每個成功回應亦提供 <black>links.permalink</black>：所載入資源的永久連結。它包含已解析的
[release set](saanseoi:zh-hant:definition/release-set/v1) 及
[catalogue revision](saanseoi:zh-hant:definition/catalogue-revision/v1)
selector；請保存它，以便日後重播完全相同的結果。`,
  'zh-Hans': `时间旅行可让你重现较早的分析、解释过往响应，或区分稍后的回填数据与作出决定时目录已知的内容。这些 selector 适用于 collection 请求。

使用 <black>effectiveAt</black> 选择某一时刻生效的发布：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 effectiveAt={{timeTravelEffectiveAt}}
\`\`\`

使用 <black>knownAt</black>
解析某一时刻已知的最新目录 checkpoint，从而排除较后的回填数据：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 knownAt={{timeTravelKnownAt}}
\`\`\`

使用 <black>catalogRevision</black>
固定一个不可变的已发布 checkpoint。重放已记录的结果时，请与 <black>releaseSet</black>
一并使用：

\`\`\`url
/{{apiFamily}}/{{ apiVersionPath }}?
                 catalogRevision={{timeTravelCatalogRevision}}&
                 releaseSet={{ apiReleaseSet }}
\`\`\`

当 selector 重叠时，<black>catalogRevision</black> 优先于 <black>knownAt</black>，而
<black>releaseSet</black> 优先于 <black>cohort</black> 及 <black>effectiveAt</black>。

每个成功响应亦提供 <black>links.permalink</black>：所载入资源的永久链接。它包含已解析的
[release set](saanseoi:zh-hans:definition/release-set/v1) 及
[catalogue revision](saanseoi:zh-hans:definition/catalogue-revision/v1)
selector；请保存它，以便日后重放完全相同的结果。`,
} as const

export function expandTimeTravelSections(
  markdown: string,
  frontmatter: Record<string, string>,
) {
  return markdown.replace(
    /\{\{timeTravelSection:(en|zh-Hant|zh-Hans)\}\}/g,
    (_tag, locale: keyof typeof sections) => {
      let section: string = sections[locale]
      if (!frontmatter.domainCode)
        section = section.replace(/^ +domain=\{\{ domainCode \}\}&\n/gm, '')
      return section
    },
  )
}
