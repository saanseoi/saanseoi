import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isCancel, text } from '@clack/prompts'
import type { UploadTarget } from '../cli/options.ts'
import { compareReleaseSetRows, parseReleaseSetCode } from './docsSelection.ts'
import {
  appendEnglishRevisionLog,
  findEffectiveFixture,
  findEffectiveGuideFixture,
  isParsedReleaseSetRow,
  readFixtureIfExists,
  readGuideFixtureIfExists,
  resolveDocsFixturePath,
  resolveGuideFixturePath,
  resolvePublisherName,
} from './docsFixtures.ts'
import { serialiseMarkdownFixture } from './docsRendering.ts'
import { fetchApiReleaseSetDocsRows } from './docsRequests.ts'

type ApiReleaseSetRevisionDraft = {
  apiReleaseSetCode: string
  datasetName: string
  message?: string
  publisherCode: string
  sourceVersion: string
}

/**
 * Creates an editable English revision note after a new immutable API release
 * revision has been published. Publication never depends on this local draft.
 */
export async function createApiReleaseSetRevisionDraft(
  input: ApiReleaseSetRevisionDraft,
  options: { prompt: boolean },
) {
  const parsedCode = parseReleaseSetCode(input.apiReleaseSetCode)
  if (!parsedCode || parsedCode.sequence === 0) return null

  const targetPath = resolveDocsFixturePath(
    parsedCode.apiFamily,
    input.apiReleaseSetCode,
  )
  const existingFixture = await readFixtureIfExists(
    parsedCode.apiFamily,
    input.apiReleaseSetCode,
  )
  const existingGuideFixture = await readGuideFixtureIfExists(
    parsedCode.apiFamily,
    input.apiReleaseSetCode,
  )
  const existingPath = existingFixture?.path ?? existingGuideFixture?.path
  if (existingPath) return { path: existingPath, status: 'existing' as const }

  const previousCode = input.apiReleaseSetCode.replace(
    /-r\d+(?=--|$)/,
    parsedCode.sequence === 1 ? '' : `-r${parsedCode.sequence - 1}`,
  )
  const previousFixture = await readFixtureIfExists(parsedCode.apiFamily, previousCode)
  if (!previousFixture) {
    throw new Error(
      `Cannot draft revision notes for ${input.apiReleaseSetCode}: no prior fixture exists for ${previousCode}.`,
    )
  }

  const publisherName = await resolvePublisherName(input.publisherCode)
  const defaultMessage = `Added **${input.datasetName}** from the \`${input.sourceVersion}\` source release published by _${publisherName}_.`
  let message = input.message?.trim() || defaultMessage

  if (options.prompt && !input.message) {
    const answer = await text({
      initialValue: defaultMessage,
      message: `Revision note for ${input.apiReleaseSetCode}`,
      validate: value => (value?.trim() ? undefined : 'Enter a revision note.'),
    })
    if (isCancel(answer)) return { status: 'cancelled' as const }
    message = answer.trim()
  }

  const now = new Date().toISOString()
  const body = appendEnglishRevisionLog(
    previousFixture.body,
    message,
    parsedCode.sequence - 1,
  )
  const {
    apiReleaseSetRevision: _apiReleaseSetRevision,
    primarySourceRelease: _primarySourceRelease,
    primarySourceReleaseUrl: _primarySourceReleaseUrl,
    ...previousFrontmatter
  } = previousFixture.frontmatter
  const frontmatter = {
    ...previousFrontmatter,
    apiReleaseSet: input.apiReleaseSetCode,
    revision: String(parsedCode.sequence),
    createdAt: now,
    updatedAt: now,
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, serialiseMarkdownFixture(frontmatter, body), 'utf8')

  const guidePath = resolveGuideFixturePath(
    parsedCode.apiFamily,
    input.apiReleaseSetCode,
  )
  const previousGuideFixture = await readGuideFixtureIfExists(
    parsedCode.apiFamily,
    previousCode,
  )
  await mkdir(dirname(guidePath), { recursive: true })
  await writeFile(
    guidePath,
    serialiseMarkdownFixture(frontmatter, previousGuideFixture?.body ?? ''),
    'utf8',
  )

  return { path: targetPath, guidePath, status: 'created' as const }
}

/** Creates editable Notes and Guide drafts for a newly published initial release. */
export async function createApiReleaseSetInitialDraft(
  apiReleaseSetCode: string,
  target: UploadTarget,
) {
  const parsedCode = parseReleaseSetCode(apiReleaseSetCode)
  if (parsedCode?.sequence !== 0) return null

  const [existingNotes, existingGuide] = await Promise.all([
    readFixtureIfExists(parsedCode.apiFamily, apiReleaseSetCode),
    readGuideFixtureIfExists(parsedCode.apiFamily, apiReleaseSetCode),
  ])
  const existingPath = existingNotes?.path ?? existingGuide?.path
  if (existingPath) {
    return {
      path: existingPath,
      status: 'existing' as const,
    }
  }

  const rows = (await fetchApiReleaseSetDocsRows(target))
    .map(row => ({ ...row, parsedCode: parseReleaseSetCode(row.code) }))
    .filter(isParsedReleaseSetRow)
    .sort(compareReleaseSetRows)
  const releaseSet = rows.find(row => row.code === apiReleaseSetCode)
  if (!releaseSet) {
    throw new Error(
      `Cannot draft docs: API release set was not found: ${apiReleaseSetCode}.`,
    )
  }

  const familyRows = rows.filter(
    row =>
      row.parsedCode.apiFamily === parsedCode.apiFamily &&
      row.parsedCode.regionCode === parsedCode.regionCode,
  )
  const [previousNotes, previousGuide] = await Promise.all([
    findEffectiveFixture(parsedCode.apiFamily, familyRows, apiReleaseSetCode),
    findEffectiveGuideFixture(parsedCode.apiFamily, familyRows, apiReleaseSetCode),
  ])
  const now = new Date().toISOString()
  const frontmatter = {
    createdAt: now,
    updatedAt: now,
    apiFamily: parsedCode.apiFamily,
    apiVersion: releaseSet.apiVersion,
    apiReleaseSet: apiReleaseSetCode,
    revision: '0',
    regionCode: parsedCode.regionCode,
    cohortKey: parsedCode.cohortKey,
  }
  const notesPath = resolveDocsFixturePath(parsedCode.apiFamily, apiReleaseSetCode)
  const guidePath = resolveGuideFixturePath(parsedCode.apiFamily, apiReleaseSetCode)

  await mkdir(dirname(notesPath), { recursive: true })
  await writeFile(
    notesPath,
    serialiseMarkdownFixture(
      frontmatter,
      previousNotes?.body ?? initialApiReleaseSetNotesBody(parsedCode.apiFamily),
    ),
    'utf8',
  )
  await mkdir(dirname(guidePath), { recursive: true })
  await writeFile(
    guidePath,
    serialiseMarkdownFixture(frontmatter, previousGuide?.body ?? ''),
    'utf8',
  )

  return { path: notesPath, guidePath, status: 'created' as const }
}

/**
 * Provides a publishable starting point where an API family has no earlier
 * release-set notes to carry forward. Address releases always have source rows,
 * so the Notes fixture must include one source directive for every locale.
 */
export function initialApiReleaseSetNotesBody(apiFamily: string) {
  if (apiFamily !== 'addresses') return ''

  return `# EN

## Changelog

- First 山水 | SaanSeoi Addresses API release set for {{regionName:en}}, covering
  <black>{{ cohortKey }}</black>.

## Revision log

- \`r{{ revision }}\` adds curated address records from the source releases listed
  below.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) makes selected
<black>{{ domainCode }}</black> address records for {{regionName:en}} available through
the SaanSeoi Addresses API. It covers the <black>{{ cohortKey }}</black> source cohort:
the release processed for this API view, not necessarily the date an address was created
or last changed.

Each record remains connected to the source release that supplied it. The following
source releases contributed to this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- Address records, coordinates, and descriptive fields are retained from the listed
  source releases. A later source cohort can correct, add, or remove a record.
- Read the linked source-release notes before comparing records across cohorts or using
  them for an address-specific decision.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 首個涵蓋 {{regionName:zh-Hant}} <black>{{ cohortKey }}</black>
  的地址 API 發布集。

## 修訂紀錄

- \`r{{ revision }}\` 新增了下列來源發布提供並經整理的地址記錄。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 透過 SaanSeoi
Addresses API 提供 {{regionName:zh-Hant}} 的選定 <black>{{ domainCode }}</black>
地址記錄。它涵蓋 <black>{{ cohortKey }}</black> 來源 cohort：即為此 API 檢視處理的
發布，而不一定是地址建立或最後更改的日期。

每筆記錄均保留與其所屬來源發布的連結。以下來源發布組成此 release set。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- 地址記錄、座標及描述欄位均按所列來源發布保留。較後的來源 cohort 可更正、新增或
  移除記錄。
- 比較不同 cohort 的記錄或用於特定地址決定前，請先閱讀連結的來源發布附註。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 首个涵盖 {{regionName:zh-Hans}} <black>{{ cohortKey }}</black>
  的地址 API 发布集。

## 修订记录

- \`r{{ revision }}\` 新增了下列来源发布提供并经整理的地址记录。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 通过 SaanSeoi
Addresses API 提供 {{regionName:zh-Hans}} 的选定 <black>{{ domainCode }}</black>
地址记录。它涵盖 <black>{{ cohortKey }}</black> 来源 cohort：即为此 API 视图处理的
发布，而不一定是地址创建或最后更改的日期。

每笔记录均保留与其所属来源发布的连接。以下来源发布组成此 release set。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- 地址记录、坐标及描述字段均按所列来源发布保留。较后的来源 cohort 可更正、新增或
  删除记录。
- 比较不同 cohort 的记录或用于特定地址决定前，请先阅读链接的来源发布说明。
`
}
