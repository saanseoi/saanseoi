import { resolve } from 'node:path'
import {
  LANDSD_STREET_NAMING_URL,
  pairLandsdStreetNoticePages,
  parseLandsdStreetSourcePage,
} from './landsd/street/landsdStreet.ts'
import { ingestLandsdStreetSource } from './landsd/street/landsdStreetIngest.ts'
import { publishLandsdStreetReleasePayloads } from './landsd/street/landsdStreetPublish.ts'
import type { DatasetUpdate, LookupContext } from './sourceUpdatesTypes.ts'
import { fetchText } from './sourceUpdatesDownloads.ts'
import { REPO_ROOT } from './sourceUpdatesConfig.ts'
import { safeFilePart } from './sourceUpdatesVersions.ts'

export async function lookupLandsdStreet({
  dataset,
  previous,
  targetVersions,
}: LookupContext) {
  const sourceUrl = dataset.sourceUrl ?? LANDSD_STREET_NAMING_URL
  const chineseSourceUrl = sourceUrl.replace('/en/', '/tc/')
  const [englishPage, traditionalChinesePage] = await Promise.all([
    fetchText(sourceUrl),
    fetchText(chineseSourceUrl),
  ])
  const en = parseLandsdStreetSourcePage(englishPage.body, 'en')
  const zhHant = parseLandsdStreetSourcePage(traditionalChinesePage.body, 'zh-Hant')
  const notices = pairLandsdStreetNoticePages({ en, zhHant })
  const baseline = previous?.versionKey
    ? readStreetSourceDate(previous.versionKey)
    : dataset.lastUpdated
  const targetVersion = targetVersions?.get(dataset.code)
  const checkingTarget = targetVersion !== undefined
  const knownNoticeIds = new Set(previous?.sourceCursor ?? [])
  const newNotices = notices.filter(
    notice =>
      (!baseline || notice.publicationDate > baseline) &&
      (checkingTarget || !knownNoticeIds.has(notice.id)),
  )
  const checkedAt = new Date().toISOString()
  const sourceCursor = notices.map(notice => notice.id)
  if (newNotices.length === 0) {
    return {
      checkedAt,
      dataset,
      deferStateUntilProcessed: true,
      message: 'The bilingual LandsD pages contain no new immutable notice IDs.',
      releaseLastRevisedAt: en.lastModified,
      sourceCursor,
      sourceKey: dataset.code,
      sourceUrl,
      status: 'current',
      version: `${en.lastModified}.0`,
      versionKey: `${en.lastModified}.0`,
    } satisfies DatasetUpdate
  }

  const latestDate = newNotices
    .map(notice => notice.publicationDate)
    .sort()
    .at(-1)
  if (!latestDate) throw new Error('LandsD update did not contain a publication date.')
  const sourceVersion = `${latestDate}.0`
  return [
    {
      checkedAt,
      dataset,
      deferStateUntilProcessed: true,
      ingest: async (target, options = {}) => {
        const result = await ingestLandsdStreetSource({
          // Ingestion always downloads the baseline and uses its content hash
          // to avoid duplicating an unchanged baseline source version.
          includeBaseline: true,
          noticeIds: newNotices.map(notice => notice.id),
          outputDir: resolve(
            REPO_ROOT,
            'data/hkgov/landsd/street',
            safeFilePart(sourceVersion),
          ),
          sourceUrl,
          target,
          promptForCuration: options.skipPrompts !== true,
          onProgress: options.onProgress,
        })
        await publishLandsdStreetReleasePayloads(target, result.releases, {
          invocationCwd: process.env.SAANSEOI_INVOCATION_CWD ?? process.cwd(),
          onProgress: ({ current, sourceVersion, total }) =>
            options.onProgress?.({
              current,
              message: `Publishing street release ${current + 1}/${total}: v${sourceVersion}`,
              total,
            }),
          releaseNotesUrl: sourceUrl,
          forceUpload: options.forceUpload === true,
        })
      },
      message: `${newNotices.length} paired LandsD notice row(s) through ${latestDate}; evidence and a single active-only street snapshot will be published together.`,
      releaseLastRevisedAt: en.lastModified,
      sourceCursor: [...knownNoticeIds, ...newNotices.map(notice => notice.id)].sort(),
      sourceKey: dataset.code,
      sourceUrl,
      status: 'new' as const,
      version: sourceVersion,
      versionKey: sourceVersion,
    } satisfies DatasetUpdate,
  ]
}

function readStreetSourceDate(versionKey: string) {
  return versionKey.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
}
