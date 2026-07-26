import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import type { StreetEvidenceAsset } from '@repo/db'
import { parquetWriteBuffer } from 'hyparquet-writer'

import {
  LANDSD_STREET_NAMING_URL,
  LANDSD_STREET_PDF_URL,
  governmentNoticeIdentity,
  type LandsdStreetPageLocale,
  type PairedLandsdGovernmentNoticePdfEntry,
  type LandsdStreetSourceLink,
  parseLandsdGovernmentNoticePdfText,
  pairLandsdGovernmentNoticePdfEntries,
  pairLandsdStreetNoticePages,
  parseLandsdStreetPdfText,
  parseLandsdStreetSourcePage,
  type PairedLandsdStreetNotice,
} from './landsdStreet.ts'
import {
  loadLandsdStreetCuration,
  promptForLandsdStreetCuration,
  resolveLandsdStreetCuration,
  saveLandsdStreetCuration,
  type LandsdStreetAppliedCuration,
  type LandsdStreetLifecycleReview,
} from './landsdStreetCuration.ts'
import {
  buildSourceAssetObjectKey,
  prepareSourceAsset,
  uploadPreparedSourceAsset,
  type PreparedSourceAsset,
  type SourceAssetRole,
} from '../sourceAssets.ts'
import type { UploadTarget } from '../options.ts'

export const LANDSD_STREET_DATASET_CODE = 'ds-hk-hkgov-landsd-street'
export const LANDSD_STREET_INITIAL_SOURCE_VERSION = '2016-01-01.0'
const DEFAULT_CURATION_PATH = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/curations/hkgov-landsd-street.json',
)

export type LandsdStreetAssetLink = StreetEvidenceAsset

export type LandsdStreetLocaleRecord = {
  description: string | null
  locale: 'en' | 'zh-Hant'
  name: string
}

export type LandsdStreetRecord = {
  application: {
    sourceStreetId: string | null
    resultStreetId: string | null
    disposition: 'apply' | 'noOp'
    method: 'automatic' | 'manual'
    nameChangeScope: 'whole' | 'partial' | null
    retainedDescriptions: Record<string, string> | null
  } | null
  districtCodes: string[]
  noticeType: PairedLandsdStreetNotice['governmentNoticeType'] | null
  i18n: LandsdStreetLocaleRecord[]
  deferToNotices: boolean
  gazetteDate: string | null
  noticeRef: string | null
  effectiveDate: string | null
  parserDiagnostics: Record<string, unknown> | null
  previousNoticeRefs: string[]
  rawExtractedText: Record<string, unknown> | null
  evidenceAssets: LandsdStreetAssetLink[]
  sourceKind: 'baseline' | 'historical-notice' | 'notice'
  recordKey: string
  streetId: string | null
}

export type LandsdStreetReleasePayload = {
  fixturePath: string | null
  parquetPath: string
  records: LandsdStreetRecord[]
  sourceVersion: string
}

export type LandsdStreetOperatorReport = {
  assetFailures: Array<{ role: SourceAssetRole; url: string; message: string }>
  baselineCoverage: { ambiguous: string[]; missing: string[] } | null
  pairedNoticeCount: number
  pairingFailures: string[]
  pdfExtraction: { failed: number; success: number }
  unmatchedPdfMappings: string[]
  ambiguousLifecycleTargets: string[]
  curationRequired: Array<{
    governmentNoticeType: string
    sourceRecordId: string
  }>
  lifecycleReview: LandsdStreetLifecycleReview[]
  sourcePageRows: { en: number; zhHant: number }
}

type PublishedPreparedAsset = {
  link: LandsdStreetAssetLink
  prepared: PreparedSourceAsset
}

export type LandsdStreetAssetPublisher = (asset: PreparedSourceAsset) => Promise<{
  source: { assetId: string; url: string }
  manifest: { assetId: string; url: string }
}>

export type LandsdStreetIngestProgress = {
  current?: number
  message: string
  total?: number
  waitingForInput?: boolean
}

/**
 * Downloads, pairs, parses, preserves and serialises a LandsD Street Name
 * release. It deliberately does not update the updater cursor: callers may
 * advance it only after their source/history/current release transaction has
 * also succeeded.
 */
export async function ingestLandsdStreetSource(options: {
  curationPath?: string
  includeBaseline?: boolean
  noticeIds?: readonly string[]
  outputDir: string
  sourceUrl?: string
  target: UploadTarget
  writeFixtures?: boolean
  publishAsset?: LandsdStreetAssetPublisher
  promptForCuration?: boolean
  onProgress?: (progress: LandsdStreetIngestProgress) => void
  fetch?: typeof fetch
  now?: () => Date
}): Promise<{
  releases: LandsdStreetReleasePayload[]
  report: LandsdStreetOperatorReport
  reportPath: string
  sourceCursor: string[]
}> {
  const outputDir = resolve(options.outputDir)
  const sourceUrl = options.sourceUrl ?? LANDSD_STREET_NAMING_URL
  const chineseSourceUrl = sourceUrl.replace('/en/', '/tc/')
  const fetchedAt = (options.now ?? (() => new Date()))().toISOString()
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const assetFailures: LandsdStreetOperatorReport['assetFailures'] = []
  const publisher: LandsdStreetAssetPublisher =
    options.publishAsset ?? (asset => uploadPreparedSourceAsset(options.target, asset))
  const assetCache = new Map<string, Promise<PublishedPreparedAsset>>()
  const reportProgress = (progress: LandsdStreetIngestProgress) =>
    options.onProgress?.(progress)
  const persistedAssets = await loadPersistedSourceAssets(outputDir)
  if (persistedAssets.size > 0) {
    reportProgress({
      message: `Found ${persistedAssets.size} cached source artifact(s) from an earlier run`,
    })
  }

  const materialise = (input: {
    bytes?: Uint8Array
    cachedAsset?: PreparedSourceAsset
    fileName: string
    label?: string | null
    mediaType: string
    role: Exclude<SourceAssetRole, 'manifest'>
    sourcePageLocale?: LandsdStreetPageLocale
    sourcePageUrl?: string
    url: string
  }) => {
    const cacheKey = [
      input.role,
      input.url,
      input.sourcePageLocale ?? '',
      input.fileName,
      input.label ?? '',
    ].join('\0')
    const existing = assetCache.get(cacheKey)
    if (existing) return existing
    const prepared = (async () => {
      const asset =
        input.cachedAsset ??
        (await prepareSourceAsset({
          bytes: requiredAssetBytes(input.bytes),
          downloadedAt: fetchedAt,
          fileName: input.fileName,
          mediaType: input.mediaType,
          outputDir: join(outputDir, 'artifacts'),
          role: input.role,
          sourcePageLocale: input.sourcePageLocale,
          sourcePageUrl: input.sourcePageUrl,
          url: input.url,
        }))
      const uploaded = await publisher(asset)
      const role = asset.manifest.artifact.role
      if (role === 'manifest') {
        throw new Error('A source artifact cannot have the manifest role.')
      }
      return {
        prepared: asset,
        link: {
          assetId: uploaded.source.assetId,
          assetUrl: uploaded.source.url,
          byteLength: asset.manifest.artifact.byteLength,
          contentHash: asset.manifest.artifact.sha256,
          label: input.label ?? null,
          mediaType: asset.manifest.artifact.mediaType,
          originalUrl: asset.manifest.original.url,
          retrievedAt: asset.manifest.downloadedAt,
          role,
          objectKey: asset.objectKey,
          ...(asset.manifest.provenance.sourcePageLocale
            ? { sourcePageLocale: asset.manifest.provenance.sourcePageLocale }
            : {}),
          ...(asset.manifest.provenance.sourcePageUrl
            ? { sourcePageUrl: asset.manifest.provenance.sourcePageUrl }
            : {}),
          manifest: {
            assetId: uploaded.manifest.assetId,
            assetUrl: uploaded.manifest.url,
            contentHash: hashBytes(await readFile(asset.manifestFilePath)),
            objectKey: asset.manifestObjectKey,
          },
        },
      } satisfies PublishedPreparedAsset
    })()
    assetCache.set(cacheKey, prepared)
    return prepared
  }

  const fetchAsset = async (input: {
    fileName?: string
    label?: string | null
    role: Exclude<SourceAssetRole, 'manifest'>
    sourcePageLocale?: LandsdStreetPageLocale
    sourcePageUrl?: string
    url: string
  }) => {
    try {
      const cachedAsset = persistedAssets.get(sourceAssetCacheKey(input))
      if (cachedAsset) {
        return await materialise({
          ...input,
          cachedAsset,
          fileName: cachedAsset.fileName,
          mediaType: cachedAsset.manifest.artifact.mediaType,
        })
      }
      const response = await fetchRequired(fetchImplementation, input.url)
      return await materialise({
        bytes: new Uint8Array(await response.arrayBuffer()),
        fileName: input.fileName ?? fileNameFromUrl(input.url),
        label: input.label,
        mediaType: response.headers.get('content-type') ?? mediaTypeForRole(input.role),
        role: input.role,
        sourcePageLocale: input.sourcePageLocale,
        sourcePageUrl: input.sourcePageUrl,
        url: input.url,
      })
    } catch (error) {
      assetFailures.push({
        role: input.role,
        url: input.url,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  reportProgress({ message: 'Fetching English and Traditional Chinese source pages' })
  const [englishPageResponse, traditionalChinesePageResponse] = await Promise.all([
    fetchRequired(fetchImplementation, sourceUrl),
    fetchRequired(fetchImplementation, chineseSourceUrl),
  ])
  const [englishHtml, traditionalChineseHtml] = await Promise.all([
    englishPageResponse.text(),
    traditionalChinesePageResponse.text(),
  ])
  const en = parseLandsdStreetSourcePage(englishHtml, 'en')
  const zhHant = parseLandsdStreetSourcePage(traditionalChineseHtml, 'zh-Hant')
  let pairedNotices: PairedLandsdStreetNotice[]
  try {
    pairedNotices = pairLandsdStreetNoticePages({ en, zhHant })
  } catch (error) {
    const report = buildOperatorReport({
      assetFailures,
      baselineCoverage: null,
      pairedNoticeCount: 0,
      pairingFailures: [error instanceof Error ? error.message : String(error)],
      pdfExtraction: { failed: 0, success: 0 },
      unmatchedPdfMappings: [],
      ambiguousLifecycleTargets: [],
      curationRequired: [],
      sourcePageRows: { en: en.notices.length, zhHant: zhHant.notices.length },
    })
    const reportPath = await writeOperatorReport(outputDir, report)
    throw new Error(`LandsD bilingual pairing failed. See ${reportPath}.`, {
      cause: error,
    })
  }
  const requestedNoticeIds = options.noticeIds ? new Set(options.noticeIds) : null
  const notices = requestedNoticeIds
    ? pairedNotices.filter(notice => requestedNoticeIds.has(notice.id))
    : pairedNotices
  if (requestedNoticeIds) {
    const foundNoticeIds = new Set(notices.map(notice => notice.id))
    const missingNoticeIds = [...requestedNoticeIds].filter(
      id => !foundNoticeIds.has(id),
    )
    if (missingNoticeIds.length > 0) {
      throw new Error(
        `LandsD source no longer contains requested notice IDs: ${missingNoticeIds.join(', ')}.`,
      )
    }
  }
  const evidence = new Map<string, PublishedPreparedAsset>()
  const noticeEvidence = notices.flatMap(notice => [
    ...(notice.governmentNotices.en
      ? [
          {
            link: notice.governmentNotices.en,
            locale: 'en' as const,
            role: 'governmentNotice' as const,
          },
        ]
      : []),
    ...(notice.governmentNotices.zhHant
      ? [
          {
            link: notice.governmentNotices.zhHant,
            locale: 'zh-Hant' as const,
            role: 'governmentNotice' as const,
          },
        ]
      : []),
    ...notice.planUrls.map(link => ({
      link,
      locale: 'en' as const,
      role: 'gazettePlan' as const,
    })),
  ])
  const noticeEvidenceByKey = new Map<string, (typeof noticeEvidence)[number]>()
  for (const item of noticeEvidence) {
    noticeEvidenceByKey.set([item.role, item.link.url, item.locale].join('\0'), item)
  }
  const uniqueNoticeEvidence = [...noticeEvidenceByKey.values()]
  const assetTotal = uniqueNoticeEvidence.length + 1
  let preservedAssets = 0
  reportProgress({
    current: preservedAssets,
    message: `Paired ${pairedNotices.length} bilingual notice(s); preserving ${assetTotal} source PDF(s)`,
    total: assetTotal,
  })
  for (const item of uniqueNoticeEvidence) {
    const cacheKey = [item.role, item.link.url, item.locale].join('\0')
    reportProgress({
      current: preservedAssets,
      message: `Preserving source PDF ${preservedAssets + 1}/${assetTotal}: ${item.link.label ?? item.link.url}`,
      total: assetTotal,
    })
    const asset = await fetchAsset({
      label: item.link.label,
      role: item.role,
      sourcePageLocale: item.locale,
      sourcePageUrl: item.locale === 'en' ? sourceUrl : chineseSourceUrl,
      url: item.link.url,
    })
    if (asset) evidence.set(cacheKey, asset)
    preservedAssets += 1
  }

  // Always preserve and parse the current baseline. The SQL stage decides
  // whether its immutable version is new by content hash.
  reportProgress({
    current: preservedAssets,
    message: `Preserving source PDF ${preservedAssets + 1}/${assetTotal}: Gazetted Street Name`,
    total: assetTotal,
  })
  const baselineAsset = await fetchAsset({
    fileName: 'Gazetted_Street_Name.pdf',
    label: 'Gazetted Street Name',
    role: 'sourcePdf',
    sourcePageLocale: 'en',
    sourcePageUrl: sourceUrl,
    url: LANDSD_STREET_PDF_URL,
  })
  preservedAssets += 1

  if (assetFailures.length > 0) {
    const report = buildOperatorReport({
      assetFailures,
      pairedNoticeCount: pairedNotices.length,
      pairingFailures: [],
      pdfExtraction: { failed: 0, success: 0 },
      unmatchedPdfMappings: [],
      ambiguousLifecycleTargets: [],
      curationRequired: [],
      sourcePageRows: { en: en.notices.length, zhHant: zhHant.notices.length },
      baselineCoverage: null,
    })
    const reportPath = await writeOperatorReport(outputDir, report)
    throw new Error(
      `LandsD evidence preservation failed for ${assetFailures.length} asset(s). See ${reportPath}.`,
    )
  }
  if (!baselineAsset) {
    throw new Error('LandsD baseline PDF could not be preserved.')
  }

  let parsedNoticeEntries: Map<string, PairedLandsdGovernmentNoticePdfEntry>
  let pdfExtraction = { failed: 0, success: 0 }
  let unmatchedPdfMappings: string[] = []
  try {
    const parsed = await parseNoticePdfs(notices, evidence, reportProgress)
    parsedNoticeEntries = parsed.entries
    pdfExtraction = parsed.summary
    unmatchedPdfMappings = parsed.pairingFailures
  } catch (error) {
    const report = buildOperatorReport({
      assetFailures,
      ambiguousLifecycleTargets: [],
      curationRequired: [],
      baselineCoverage: null,
      pairedNoticeCount: pairedNotices.length,
      pairingFailures: [],
      pdfExtraction: {
        failed: notices.filter(isLifecycleCurationNotice).length * 2,
        success: 0,
      },
      sourcePageRows: { en: en.notices.length, zhHant: zhHant.notices.length },
      unmatchedPdfMappings: [error instanceof Error ? error.message : String(error)],
    })
    const reportPath = await writeOperatorReport(outputDir, report)
    throw new Error(`LandsD Government Notice PDF parsing failed. See ${reportPath}.`, {
      cause: error,
    })
  }

  const curationPath = options.curationPath ?? DEFAULT_CURATION_PATH
  let curationManifest = await loadLandsdStreetCuration(curationPath)
  let curation = resolveLandsdStreetCuration({
    manifest: curationManifest,
    notices,
    parsedEntries: parsedNoticeEntries,
  })
  if (curation.unresolved.length > 0 && options.promptForCuration) {
    reportProgress({
      message: `Awaiting lifecycle curation for ${curation.unresolved.length} notice(s)`,
      waitingForInput: true,
    })
    curationManifest = await promptForLandsdStreetCuration({
      manifest: curationManifest,
      review: curation.unresolved,
    })
    await saveLandsdStreetCuration(curationPath, curationManifest)
    curation = resolveLandsdStreetCuration({
      manifest: curationManifest,
      notices,
      parsedEntries: parsedNoticeEntries,
    })
  }
  if (curation.unresolved.length > 0) {
    const report = buildOperatorReport({
      assetFailures,
      ambiguousLifecycleTargets: [],
      baselineCoverage: null,
      curationRequired: curation.unresolved.map(item => ({
        governmentNoticeType: item.governmentNoticeType,
        sourceRecordId: item.sourceRecordId,
      })),
      lifecycleReview: curation.review,
      pairedNoticeCount: pairedNotices.length,
      pairingFailures: [],
      pdfExtraction,
      sourcePageRows: { en: en.notices.length, zhHant: zhHant.notices.length },
      unmatchedPdfMappings,
    })
    const [reportPath, reviewPath] = await Promise.all([
      writeOperatorReport(outputDir, report),
      writeLifecycleReview(outputDir, curation.review),
    ])
    throw new Error(
      `LandsD notice(s) require lifecycle curation before publication. Review ${reviewPath}, record decisions in ${options.curationPath ?? DEFAULT_CURATION_PATH}, then rerun. Operator report: ${reportPath}.`,
    )
  }

  const previewsByPlanUrl = await createPlanPreviews({
    evidence,
    materialise,
    notices,
    onProgress: reportProgress,
    outputDir,
    sourcePageUrl: sourceUrl,
  })
  reportProgress({ message: 'Extracting the gazetted street-name baseline' })
  const baselineRows = parseLandsdStreetPdfText(
    await pdfToText(baselineAsset.prepared.filePath),
  )
  const noticeRecords = notices.map(notice =>
    buildNoticeRecord(notice, {
      curation: curation.applied.get(notice.id) ?? null,
      evidence,
      previewsByPlanUrl,
      parsedPdfEntry: parsedNoticeEntries.get(notice.id) ?? null,
    }),
  )
  const baseline = buildBaselineRecords(baselineRows, noticeRecords, baselineAsset.link)

  reportProgress({ message: 'Writing release payload and operator report' })
  const releases = await writeReleasePayloads({
    baselineRecords: baseline.records,
    noticeRecords,
    outputDir,
    writeFixtures: options.writeFixtures ?? true,
  })
  const report = buildOperatorReport({
    assetFailures,
    pairedNoticeCount: pairedNotices.length,
    pairingFailures: [],
    pdfExtraction,
    unmatchedPdfMappings,
    ambiguousLifecycleTargets: [],
    curationRequired: [],
    sourcePageRows: { en: en.notices.length, zhHant: zhHant.notices.length },
    baselineCoverage: null,
  })
  const reportPath = await writeOperatorReport(outputDir, report)

  return {
    releases,
    report,
    reportPath,
    sourceCursor: pairedNotices.map(notice => notice.id),
  }
}

function buildNoticeRecord(
  notice: PairedLandsdStreetNotice,
  options: {
    curation: LandsdStreetAppliedCuration | null
    evidence: Map<string, PublishedPreparedAsset>
    parsedPdfEntry: PairedLandsdGovernmentNoticePdfEntry | null
    previewsByPlanUrl: Map<string, LandsdStreetAssetLink[]>
  },
): LandsdStreetRecord {
  const noticeRef =
    notice.noticeIdentity ?? governmentNoticeIdentity(notice.governmentNotices.en)
  const governmentNoticeAssets = [
    getEvidence(
      options.evidence,
      'governmentNotice',
      notice.governmentNotices.en,
      'en',
    ),
    getEvidence(
      options.evidence,
      'governmentNotice',
      notice.governmentNotices.zhHant,
      'zh-Hant',
    ),
  ]
    .filter((asset): asset is LandsdStreetAssetLink => Boolean(asset))
    .map(asset => ({ ...asset, publisherIdentifier: noticeRef }))
  const planAssets = notice.planUrls.flatMap(link => {
    const pdf = getEvidence(options.evidence, 'gazettePlan', link, 'en')
    const previews = options.previewsByPlanUrl.get(link.url) ?? []
    return [...(pdf ? [pdf] : []), ...previews].map(asset => ({
      ...asset,
      publisherIdentifier: link.label ?? null,
    }))
  })
  return {
    application: options.curation
      ? {
          sourceStreetId: options.curation.affectedStreetId,
          resultStreetId: options.curation.createdStreetId,
          disposition: options.curation.disposition,
          method: options.curation.method,
          nameChangeScope: options.curation.nameChangeScope,
          retainedDescriptions: options.curation.retainedDescriptions,
        }
      : automaticApplication(notice),
    districtCodes: [],
    noticeType: notice.governmentNoticeType,
    i18n: [
      {
        description: options.parsedPdfEntry?.descriptions.en ?? null,
        locale: 'en',
        name: notice.names.en,
      },
      {
        description: options.parsedPdfEntry?.descriptions.zhHant ?? null,
        locale: 'zh-Hant',
        name: notice.names.zhHant,
      },
    ],
    deferToNotices: true,
    gazetteDate: options.parsedPdfEntry?.gazetteDate ?? null,
    noticeRef,
    effectiveDate: options.parsedPdfEntry?.effectiveDate ?? null,
    parserDiagnostics: options.parsedPdfEntry?.parserDiagnostics ?? null,
    previousNoticeRefs: options.parsedPdfEntry?.previousNoticeRefs ?? [],
    evidenceAssets: [...governmentNoticeAssets, ...planAssets],
    sourceKind: 'notice',
    recordKey: notice.id,
    streetId: null,
    rawExtractedText: options.parsedPdfEntry?.rawExtractedText ?? null,
  }
}

function automaticApplication(
  notice: PairedLandsdStreetNotice,
): LandsdStreetRecord['application'] {
  // A declaration creates a new street and has no existing target. Other
  // notice types need a reviewed mapping: Previous G.N. is provenance only.
  return notice.governmentNoticeType === 'declaration'
    ? {
        sourceStreetId: null,
        resultStreetId: null,
        disposition: 'apply',
        method: 'automatic',
        nameChangeScope: null,
        retainedDescriptions: null,
      }
    : null
}

function buildBaselineRecords(
  rows: Array<{ englishName: string; chineseName: string; districtCode: string }>,
  noticeRecords: LandsdStreetRecord[],
  _sourcePdf: LandsdStreetAssetLink,
) {
  const records: LandsdStreetRecord[] = []

  for (const row of rows) {
    records.push({
      application: null,
      districtCodes: [row.districtCode],
      noticeType: null,
      i18n: [
        {
          description: null,
          locale: 'en',
          name: row.englishName,
        },
        {
          description: null,
          locale: 'zh-Hant',
          name: row.chineseName,
        },
      ],
      // A baseline row that is represented by a declaration/name-change in
      // this notice batch is validation input, not a second street origin.
      deferToNotices:
        noticeRecords.some(
          notice =>
            notice.noticeType === 'declaration' ||
            Boolean(notice.application?.resultStreetId),
        ) &&
        noticeRecords.some(
          notice =>
            notice.i18n.some(
              locale => locale.locale === 'en' && locale.name === row.englishName,
            ) &&
            notice.i18n.some(
              locale => locale.locale === 'zh-Hant' && locale.name === row.chineseName,
            ),
        ),
      gazetteDate: null,
      noticeRef: null,
      effectiveDate: null,
      parserDiagnostics: null,
      previousNoticeRefs: [],
      evidenceAssets: [],
      sourceKind: 'baseline',
      recordKey: `landsd-street:baseline:${hashText(
        [row.englishName, row.chineseName, row.districtCode].join('\0'),
      )}`,
      rawExtractedText: null,
      streetId: null,
    })
  }
  return { records }
}

async function createPlanPreviews(input: {
  evidence: Map<string, PublishedPreparedAsset>
  materialise: (input: {
    bytes: Uint8Array
    fileName: string
    label?: string | null
    mediaType: string
    role: Exclude<SourceAssetRole, 'manifest'>
    sourcePageLocale?: LandsdStreetPageLocale
    sourcePageUrl?: string
    url: string
  }) => Promise<PublishedPreparedAsset>
  notices: PairedLandsdStreetNotice[]
  onProgress: (progress: LandsdStreetIngestProgress) => void
  outputDir: string
  sourcePageUrl: string
}) {
  const previews = new Map<string, LandsdStreetAssetLink[]>()
  const plans = new Map<string, LandsdStreetSourceLink>()
  for (const notice of input.notices) {
    for (const plan of notice.planUrls) plans.set(plan.url, plan)
  }
  let processedPlans = 0
  for (const plan of plans.values()) {
    input.onProgress({
      current: processedPlans,
      message: `Rendering Gazette Plan previews (${processedPlans + 1}/${plans.size}): ${plan.label ?? plan.url}`,
      total: plans.size,
    })
    const pdf = getEvidence(input.evidence, 'gazettePlan', plan, 'en')
    const prepared = input.evidence.get(['gazettePlan', plan.url, 'en'].join('\0'))
    if (!pdf || !prepared) {
      processedPlans += 1
      continue
    }
    const rendered = await renderPlanPdfToWebp(
      prepared.prepared.filePath,
      join(input.outputDir, 'previews'),
    )
    const links: LandsdStreetAssetLink[] = []
    for (const path of rendered) {
      const published = await input.materialise({
        bytes: await readFile(path),
        fileName: basename(path),
        label: plan.label,
        mediaType: 'image/webp',
        role: 'gazettePlanPreview',
        sourcePageLocale: 'en',
        sourcePageUrl: input.sourcePageUrl,
        url: plan.url,
      })
      links.push(published.link)
    }
    previews.set(plan.url, links)
    processedPlans += 1
  }
  return previews
}

async function writeReleasePayloads(input: {
  baselineRecords: LandsdStreetRecord[]
  noticeRecords: LandsdStreetRecord[]
  outputDir: string
  writeFixtures: boolean
}) {
  const records = [...input.baselineRecords, ...input.noticeRecords]
  if (records.length === 0) return []
  const latestNoticeDate = input.noticeRecords
    .map(record => record.gazetteDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1)
  return [
    await writeReleasePayload({
      fixtureKind: input.baselineRecords.length > 0 ? 'initial' : 'notice',
      outputDir: input.outputDir,
      records,
      sourceVersion: latestNoticeDate
        ? `${latestNoticeDate}.0`
        : LANDSD_STREET_INITIAL_SOURCE_VERSION,
      writeFixture: input.writeFixtures,
    }),
  ]
}

async function writeReleasePayload(input: {
  fixtureKind: 'initial' | 'notice'
  outputDir: string
  records: LandsdStreetRecord[]
  sourceVersion: string
  writeFixture: boolean
}): Promise<LandsdStreetReleasePayload> {
  const releaseDir = join(input.outputDir, input.sourceVersion)
  const parquetPath = join(releaseDir, 'landsd-street.parquet')
  await writeStreetParquet(parquetPath, input.records, input.sourceVersion)

  const hasDeclaration = input.records.some(
    record => record.noticeType === 'declaration',
  )
  const fixturePath =
    input.writeFixture && (input.fixtureKind === 'initial' || hasDeclaration)
      ? fixturePathFor(input.sourceVersion)
      : null
  if (fixturePath) {
    await mkdir(dirname(fixturePath), { recursive: true })
    await writeFile(
      fixturePath,
      buildStreetReleaseNotes(input.records, input.sourceVersion, input.fixtureKind),
      'utf8',
    )
  }
  return {
    fixturePath,
    parquetPath,
    records: input.records,
    sourceVersion: input.sourceVersion,
  }
}

function buildStreetReleaseNotes(
  records: LandsdStreetRecord[],
  sourceVersion: string,
  kind: 'initial' | 'notice',
) {
  const declarations = records.filter(record => record.noticeType === 'declaration')
  const otherNotices = records.filter(record => record.noticeType !== 'declaration')
  const lines = [
    '---',
    `dataset: "${LANDSD_STREET_DATASET_CODE}"`,
    `release: "dr-hk-hkgov-landsd-street-${sourceVersion}"`,
    'regionCode: "hk"',
    'source: "hkgov-landsd"',
    `sourceVersion: "${sourceVersion}"`,
    'type: "street"',
    `cohortKey: "${sourceVersion}"`,
    '---',
    '',
    '# EN',
    '',
    kind === 'initial'
      ? 'Initial gazetted street-name register, excluding exact English-name matches that are represented by later Government Notices.'
      : 'Street-name declarations and related Government Notices processed from the LandsD bilingual source pages.',
    '',
  ]
  const visible = kind === 'initial' ? records : declarations
  for (const record of visible) {
    const en = record.i18n.find(item => item.locale === 'en')
    if (!en) continue
    lines.push(`## ${en.name}`, '')
    if (record.gazetteDate) lines.push(`- Gazette date: ${record.gazetteDate}`)
    if (record.noticeType) lines.push(`- Notice type: ${record.noticeType}`)
    const governmentNotice = record.evidenceAssets.find(
      asset => asset.role === 'governmentNotice',
    )
    if (governmentNotice) {
      lines.push(
        `- Government Notice: [${governmentNotice.label ?? 'source PDF'}](${governmentNotice.originalUrl})`,
      )
    }
    for (const plan of record.evidenceAssets.filter(
      asset => asset.role === 'gazettePlan',
    )) {
      lines.push(`- Gazette Plan: [${plan.label ?? 'source PDF'}](${plan.originalUrl})`)
    }
    for (const preview of record.evidenceAssets.filter(
      asset => asset.role === 'gazettePlanPreview',
    )) {
      lines.push(`- ![Gazette plan preview](${preview.assetUrl})`)
    }
    lines.push('')
  }
  if (otherNotices.length > 0 && kind === 'notice') {
    lines.push('## Other notices processed', '')
    for (const record of otherNotices) {
      const en = record.i18n.find(item => item.locale === 'en')
      if (!en) continue
      const governmentNotice = record.evidenceAssets.find(
        asset => asset.role === 'governmentNotice',
      )
      const notice = governmentNotice
        ? ` [${governmentNotice.label ?? 'Government Notice'}](${governmentNotice.originalUrl})`
        : ''
      lines.push(`- ${en.name} — ${record.noticeType ?? 'notice'}${notice}`)
    }
    lines.push('')
  }
  lines.push(
    '# ZH-HANT',
    '',
    '本版本保留地政總署原始中英文通知、憲報圖則及受管資產連結。',
    '',
    '# ZH-HANS',
    '',
    '本版本保留地政总署原始中英文通知、宪报图则及受管资产链接。',
    '',
  )
  return `${lines.join('\n')}`
}

async function writeStreetParquet(
  outputPath: string,
  records: LandsdStreetRecord[],
  sourceVersion: string,
) {
  await mkdir(dirname(outputPath), { recursive: true })
  const parquet = parquetWriteBuffer({
    rowGroupSize: 10_000,
    columnData: [
      required(
        'id',
        records.map(record => record.recordKey),
      ),
      required(
        'theme',
        records.map(() => 'streets'),
      ),
      required(
        'type',
        records.map(() => 'street'),
      ),
      required(
        'source_kind',
        records.map(record => record.sourceKind),
      ),
      required(
        'defer_to_notices',
        records.map(record => String(record.deferToNotices)),
      ),
      nullable(
        'street_id',
        records.map(record => record.streetId),
      ),
      nullable(
        'gazette_date',
        records.map(record => record.gazetteDate),
      ),
      nullable(
        'notice_type',
        records.map(record => record.noticeType),
      ),
      nullable(
        'application',
        records.map(record =>
          record.application ? JSON.stringify(record.application) : null,
        ),
      ),
      nullable(
        'notice_ref',
        records.map(record => record.noticeRef),
      ),
      nullable(
        'effective_date',
        records.map(record => record.effectiveDate),
      ),
      required(
        'previous_notice_refs',
        records.map(record => JSON.stringify(record.previousNoticeRefs)),
      ),
      nullable(
        'raw_extracted_text',
        records.map(record =>
          record.rawExtractedText ? JSON.stringify(record.rawExtractedText) : null,
        ),
      ),
      nullable(
        'parser_diagnostics',
        records.map(record =>
          record.parserDiagnostics ? JSON.stringify(record.parserDiagnostics) : null,
        ),
      ),
      required(
        'district_codes',
        records.map(record => JSON.stringify(record.districtCodes)),
      ),
      required(
        'evidence_assets',
        records.map(record => JSON.stringify(record.evidenceAssets)),
      ),
      required(
        'i18n',
        records.map(record => JSON.stringify(record.i18n)),
      ),
      required(
        'source_version',
        records.map(() => sourceVersion),
      ),
      required(
        'source_url',
        records.map(() => LANDSD_STREET_NAMING_URL),
      ),
    ],
  })
  await writeFile(outputPath, new Uint8Array(parquet))
}

function buildOperatorReport(
  report: Omit<LandsdStreetOperatorReport, 'lifecycleReview'> & {
    lifecycleReview?: LandsdStreetLifecycleReview[]
  },
): LandsdStreetOperatorReport {
  return { ...report, lifecycleReview: report.lifecycleReview ?? [] }
}

async function writeOperatorReport(
  outputDir: string,
  report: LandsdStreetOperatorReport,
) {
  const path = join(outputDir, 'operator-report.json')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return path
}

async function writeLifecycleReview(
  outputDir: string,
  review: LandsdStreetLifecycleReview[],
) {
  const path = join(outputDir, 'lifecycle-review.json')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(review, null, 2)}\n`, 'utf8')
  return path
}

function fixturePathFor(sourceVersion: string) {
  return resolve(
    import.meta.dir,
    '../../../../../fixtures/meta/releases',
    LANDSD_STREET_DATASET_CODE,
    `dr-hk-hkgov-landsd-street-${sourceVersion}.md`,
  )
}

function getEvidence(
  evidence: Map<string, PublishedPreparedAsset>,
  role: SourceAssetRole,
  link: LandsdStreetSourceLink | null,
  locale: LandsdStreetPageLocale,
) {
  return link ? evidence.get([role, link.url, locale].join('\0'))?.link : undefined
}

async function parseNoticePdfs(
  notices: PairedLandsdStreetNotice[],
  evidence: Map<string, PublishedPreparedAsset>,
  onProgress: (progress: LandsdStreetIngestProgress) => void,
) {
  const reviewable = notices.filter(
    notice => notice.governmentNotices.en || notice.governmentNotices.zhHant,
  )
  onProgress({
    current: 0,
    message: `Extracting text from Government Notice PDFs (0/${reviewable.length})`,
    total: reviewable.length,
  })
  const english = new Map<
    string,
    ReturnType<typeof parseLandsdGovernmentNoticePdfText>
  >()
  const zhHant = new Map<
    string,
    ReturnType<typeof parseLandsdGovernmentNoticePdfText>
  >()
  const cache = new Map<
    string,
    Promise<ReturnType<typeof parseLandsdGovernmentNoticePdfText>>
  >()
  const parse = (
    notice: PairedLandsdStreetNotice,
    locale: LandsdStreetPageLocale,
    link: LandsdStreetSourceLink | null,
  ) => {
    if (!link) {
      throw new Error(
        `${notice.id}: lifecycle-review notice is missing its ${locale} Government Notice PDF link.`,
      )
    }
    const key = ['governmentNotice', link.url, locale].join('\0')
    const prepared = evidence.get(key)
    if (!prepared) {
      throw new Error(
        `${notice.id}: preserved ${locale} Government Notice PDF is unavailable.`,
      )
    }
    const existing = cache.get(key)
    if (existing) return existing
    const parsed = pdfToText(prepared.prepared.filePath)
      .then(text => parseLandsdGovernmentNoticePdfText(text, locale))
      .catch(error => {
        if (!isLifecycleCurationNotice(notice)) {
          throw new Error(
            `${notice.id}: unable to extract its ${locale} Government Notice PDF: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        // Preserve the failed parser state so this notice is surfaced to the
        // curator instead of silently becoming a snapshot change.
        return parseLandsdGovernmentNoticePdfText('', locale)
      })
    cache.set(key, parsed)
    return parsed
  }
  for (const [index, notice] of reviewable.entries()) {
    onProgress({
      current: index,
      message: `Extracting Government Notice PDFs (${index + 1}/${reviewable.length}): ${notice.names.en}`,
      total: reviewable.length,
    })
    english.set(notice.id, await parse(notice, 'en', notice.governmentNotices.en))
    zhHant.set(
      notice.id,
      await parse(notice, 'zh-Hant', notice.governmentNotices.zhHant),
    )
  }
  const pairingFailures: string[] = []
  const entries = pairLandsdGovernmentNoticePdfEntries({
    english,
    notices: reviewable,
    zhHant,
    onIssue: issue => pairingFailures.push(issue),
  })
  const missingNonReviewable = reviewable.find(
    notice => !isLifecycleCurationNotice(notice) && !entries.has(notice.id),
  )
  if (missingNonReviewable) {
    throw new Error(
      `${missingNonReviewable.id}: Government Notice PDF layout was not parseable.`,
    )
  }
  return {
    entries,
    summary: {
      failed: [...english.values(), ...zhHant.values()].filter(
        parsed => parsed.diagnostics.status === 'failed',
      ).length,
      success: [...english.values(), ...zhHant.values()].filter(
        parsed => parsed.diagnostics.status === 'success',
      ).length,
    },
    pairingFailures,
  }
}

async function loadPersistedSourceAssets(outputDir: string) {
  const artifactDir = join(outputDir, 'artifacts')
  const entries = await readdir(artifactDir, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  })
  const assets = new Map<string, PreparedSourceAsset>()
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.manifest.json')) continue
    const manifestFilePath = join(artifactDir, entry.name)
    const manifestBytes = await readFile(manifestFilePath)
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
      artifact?: {
        byteLength?: unknown
        mediaType?: unknown
        objectKey?: unknown
        role?: unknown
        sha256?: unknown
      }
      downloadedAt?: unknown
      original?: { fileName?: unknown; url?: unknown }
      provenance?: { sourcePageLocale?: unknown; sourcePageUrl?: unknown }
      schemaVersion?: unknown
    }
    const artifact = manifest.artifact
    const original = manifest.original
    const fileStem = entry.name.slice(0, -'.manifest.json'.length)
    const contentHash = artifact?.sha256
    if (
      manifest.schemaVersion !== 1 ||
      typeof contentHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(contentHash) ||
      !fileStem.startsWith(`${contentHash}-`) ||
      typeof artifact?.role !== 'string' ||
      typeof artifact.mediaType !== 'string' ||
      typeof artifact.objectKey !== 'string' ||
      typeof artifact.byteLength !== 'number' ||
      typeof original?.fileName !== 'string' ||
      typeof original.url !== 'string' ||
      typeof manifest.downloadedAt !== 'string'
    ) {
      continue
    }
    const filePath = join(artifactDir, fileStem)
    if (!(await Bun.file(filePath).exists())) continue
    const fileName = fileStem.slice(contentHash.length + 1)
    const role = artifact.role as Exclude<SourceAssetRole, 'manifest'>
    const sourcePageLocale =
      manifest.provenance?.sourcePageLocale === 'en' ||
      manifest.provenance?.sourcePageLocale === 'zh-Hant'
        ? manifest.provenance.sourcePageLocale
        : undefined
    const sourcePageUrl =
      typeof manifest.provenance?.sourcePageUrl === 'string'
        ? manifest.provenance.sourcePageUrl
        : undefined
    const prepared: PreparedSourceAsset = {
      fileName,
      filePath,
      manifest: {
        schemaVersion: 1,
        artifact: {
          byteLength: artifact.byteLength,
          mediaType: artifact.mediaType,
          objectKey: artifact.objectKey,
          role,
          sha256: contentHash,
        },
        downloadedAt: manifest.downloadedAt,
        original: { fileName: original.fileName, url: original.url },
        provenance: {
          ...(sourcePageLocale ? { sourcePageLocale } : {}),
          ...(sourcePageUrl ? { sourcePageUrl } : {}),
        },
      },
      manifestFilePath,
      manifestObjectKey: buildSourceAssetObjectKey(
        hashBytes(manifestBytes),
        `manifest-for-${contentHash}-${fileName}.json`,
      ),
      objectKey: artifact.objectKey,
    }
    assets.set(
      sourceAssetCacheKey({
        role,
        sourcePageLocale,
        url: original.url,
      }),
      prepared,
    )
  }
  return assets
}

function sourceAssetCacheKey(input: {
  role: Exclude<SourceAssetRole, 'manifest'>
  url: string
  sourcePageLocale?: LandsdStreetPageLocale
}) {
  return [input.role, input.url, input.sourcePageLocale ?? ''].join('\0')
}

function requiredAssetBytes(bytes: Uint8Array | undefined) {
  if (!bytes)
    throw new Error('Source asset requires bytes when no cached artifact exists.')
  return bytes
}

function isLifecycleCurationNotice(notice: PairedLandsdStreetNotice) {
  return (
    notice.governmentNoticeType === 'change' ||
    notice.governmentNoticeType === 'corrigendum'
  )
}

async function fetchRequired(fetchImplementation: typeof fetch, url: string) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImplementation(url)
      if (response.ok) return response
      lastError = new Error(
        `Source asset download failed with HTTP ${response.status}: ${url}`,
      )
      if (response.status !== 408 && response.status !== 429 && response.status < 500)
        break
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 250))
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Source download failed: ${url}`)
}

async function renderPlanPdfToWebp(pdfPath: string, outputDir: string) {
  await mkdir(outputDir, { recursive: true })
  const temporaryDir = await mkdtemp(join(tmpdir(), 'saanseoi-landsd-plan-preview-'))
  const prefix = join(temporaryDir, 'page')
  try {
    await runCommand('pdftoppm', ['-r', '144', '-png', pdfPath, prefix])
    const images = (await readdir(temporaryDir))
      .filter(file => /^page-\d+\.png$/.test(file))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    const rendered: string[] = []
    for (const [index, image] of images.entries()) {
      const output = join(
        outputDir,
        `${hashText(`${pdfPath}\0${index}`)}-${index + 1}.webp`,
      )
      await runCommand('cwebp', ['-quiet', join(temporaryDir, image), '-o', output])
      rendered.push(output)
    }
    if (rendered.length === 0)
      throw new Error(`No pages were rendered from ${pdfPath}.`)
    return rendered
  } finally {
    await rm(temporaryDir, { recursive: true, force: true })
  }
}

async function pdfToText(pdfPath: string) {
  const child = Bun.spawn(['pdftotext', '-layout', '-nopgbrk', pdfPath, '-'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`pdftotext failed: ${stderr.trim() || `exit code ${exitCode}`}`)
  }
  return stdout
}

async function runCommand(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0)
    throw new Error(`${command} failed: ${stderr.trim() || `exit code ${exitCode}`}`)
}

function mediaTypeForRole(role: Exclude<SourceAssetRole, 'manifest'>) {
  return role === 'sourcePage' ? 'text/html; charset=utf-8' : 'application/pdf'
}

function fileNameFromUrl(url: string) {
  const value = new URL(url).pathname.split('/').at(-1)
  return value?.replaceAll(/[^A-Za-z0-9._-]+/g, '_') || 'source.bin'
}

function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function hashBytes(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function required(name: string, data: string[]) {
  return { data, name, nullable: false, type: 'STRING' as const }
}

function nullable(name: string, data: Array<string | null>) {
  return { data, name, nullable: true, type: 'STRING' as const }
}
