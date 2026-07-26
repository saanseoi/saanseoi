import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { streetLocaleCodes } from '@repo/db'
import type {
  LandsdStreetNameChangeScope,
  LandsdStreetNoticeApplicationDisposition,
  LandsdStreetNoticeApplicationMethod,
  StreetEvidenceAsset,
  StreetLocaleCode,
} from '@repo/db'
import { parquetWriteBuffer } from 'hyparquet-writer'

import {
  LANDSD_STREET_NAMING_URL,
  LANDSD_STREET_PDF_URL,
  governmentNoticeIdentity,
  parseLandsdGovernmentNoticeType,
  type LandsdStreetPageLocale,
  type LandsdStreetSourceKind,
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
  egazetteArchiveFilePath,
  loadEgazetteStreetNameArchive,
  type EgazetteStreetNameRecord,
} from './egazetteStreetName.ts'
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
} from '../../sourceAssets.ts'
import type { UploadTarget } from '../../../cli/options.ts'

export const LANDSD_STREET_DATASET_CODE = 'ds-hk-hkgov-landsd-street'
export const LANDSD_STREET_INITIAL_SOURCE_VERSION = '2016-01-01.0'
const DEFAULT_CURATION_PATH = resolve(
  import.meta.dir,
  '../../../../../../../fixtures/meta/curations/hkgov-landsd-street.json',
)
const REPO_ROOT = resolve(import.meta.dir, '../../../../../../..')
const DEFAULT_EGAZETTE_ARCHIVE_DIR = join(
  REPO_ROOT,
  'data/hkgov/gld/egazette/street-name',
)
const PADDLE_OCR_SCRIPT = join(
  REPO_ROOT,
  'apps/harbour-dataops/paddleocrTraditional.py',
)
const PADDLE_OCR_PYTHON =
  process.env.SAANSEOI_PADDLEOCR_PYTHON ??
  join(REPO_ROOT, 'apps/harbour-dataops/.venv/bin/python')

export type LandsdStreetAssetLink = StreetEvidenceAsset

export type LandsdStreetLocaleRecord = {
  description: string | null
  locale: StreetLocaleCode
  name: string
}

export type LandsdStreetRecord = {
  application: {
    sourceStreetId: string | null
    resultStreetId: string | null
    disposition: LandsdStreetNoticeApplicationDisposition
    method: LandsdStreetNoticeApplicationMethod
    nameChangeScope: LandsdStreetNameChangeScope | null
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
  sourceKind: LandsdStreetSourceKind
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
  egazetteArchiveDir?: string
  includeEgazetteHistory?: boolean
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
  const egazetteArchiveDir = options.egazetteArchiveDir ?? DEFAULT_EGAZETTE_ARCHIVE_DIR
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

  const egazette = options.includeEgazetteHistory
    ? await (async () => {
        reportProgress({
          message: 'Validating and parsing historical e-Gazette street-name PDFs',
        })
        return parseEgazetteStreetNameArchive({
          archiveDir: egazetteArchiveDir,
          onProgress: reportProgress,
          repoRoot: REPO_ROOT,
        })
      })()
    : emptyParsedEgazetteStreetNameArchive()

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
  let notices = requestedNoticeIds
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
  const historicalAssetsByNoticeRef = new Map<string, LandsdStreetAssetLink[]>()
  const historicalAssetRecords = [...egazette.assetRecords.entries()]
  const assetTotal =
    uniqueCount([
      ...notices.flatMap(notice => [
        ...(notice.governmentNotices.en
          ? [['governmentNotice', notice.governmentNotices.en.url, 'en']]
          : []),
        ...(notice.governmentNotices.zhHant
          ? [['governmentNotice', notice.governmentNotices.zhHant.url, 'zh-Hant']]
          : []),
        ...notice.planUrls.map(link => ['gazettePlan', link.url, 'en']),
      ]),
      ...historicalAssetRecords.flatMap(([, record]) => [
        ['historicalGovernmentNotice', record.assets.en.officialUrl, 'en'],
        ['historicalGovernmentNotice', record.assets['zh-Hant'].officialUrl, 'zh-Hant'],
      ]),
    ]) + 1
  let preservedAssets = 0
  reportProgress({
    current: preservedAssets,
    message: `Paired ${pairedNotices.length} LandsD and ${egazette.notices.length} historical e-Gazette notice row(s); preserving ${assetTotal} source PDF(s)`,
    total: assetTotal,
  })
  for (const [recordKey, record] of historicalAssetRecords) {
    const assets: LandsdStreetAssetLink[] = []
    for (const locale of streetLocaleCodes) {
      const source = record.assets[locale]
      const localPath = egazetteArchiveFilePath(REPO_ROOT, source.localPath)
      reportProgress({
        current: preservedAssets,
        message: `Preserving historical e-Gazette PDF ${preservedAssets + 1}/${assetTotal}: ${recordKey} (${locale})`,
        total: assetTotal,
      })
      const published = await materialise({
        bytes: new Uint8Array(await readFile(localPath)),
        fileName: basename(localPath),
        label: recordKey,
        mediaType: 'application/pdf',
        role: 'historicalGovernmentNotice',
        sourcePageLocale: locale,
        sourcePageUrl: 'https://egazette.gld.gov.hk/en/search-gazette',
        url: source.officialUrl,
      })
      evidence.set(
        ['historicalGovernmentNotice', source.officialUrl, locale].join('\0'),
        published,
      )
      assets.push({ ...published.link, publisherIdentifier: recordKey })
      preservedAssets += 1
    }
    historicalAssetsByNoticeRef.set(recordKey, assets)
  }
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
    notices = parsed.notices
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

  // The current LandsD page is the forward feed. The archive supplies the
  // missing pre-2016 ledger. Later archive PDFs remain independent evidence
  // on matching forward-feed events, rather than duplicating lifecycle events.
  const historicalNotices = requestedNoticeIds
    ? []
    : egazette.notices.filter(
        notice => `${notice.publicationDate}.0` < LANDSD_STREET_INITIAL_SOURCE_VERSION,
      )
  const allNotices = [...historicalNotices, ...notices]
  const allParsedNoticeEntries = new Map([...egazette.entries, ...parsedNoticeEntries])
  const curationPath = options.curationPath ?? DEFAULT_CURATION_PATH
  let curationManifest = await loadLandsdStreetCuration(curationPath)
  let curation = resolveLandsdStreetCuration({
    manifest: curationManifest,
    notices: allNotices,
    parsedEntries: allParsedNoticeEntries,
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
      notices: allNotices,
      parsedEntries: allParsedNoticeEntries,
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
      supplementalEvidenceAssets:
        (notice.noticeIdentity
          ? historicalAssetsByNoticeRef.get(notice.noticeIdentity)
          : undefined) ?? [],
    }),
  )
  const historicalNoticeRecords = historicalNotices.map(notice =>
    buildNoticeRecord(notice, {
      assetRole: 'historicalGovernmentNotice',
      curation: curation.applied.get(notice.id) ?? null,
      evidence,
      parsedPdfEntry: egazette.entries.get(notice.id) ?? null,
      previewsByPlanUrl: new Map(),
      sourceKind: 'historical-notice',
      supplementalEvidenceAssets: [],
    }),
  )
  const allNoticeRecords = [...historicalNoticeRecords, ...noticeRecords]
  const baseline = buildBaselineRecords(
    baselineRows,
    allNoticeRecords,
    baselineAsset.link,
  )

  reportProgress({ message: 'Writing release payload and operator report' })
  const releases = await writeReleasePayloads({
    baselineRecords: baseline.records,
    noticeRecords: allNoticeRecords,
    outputDir,
    writeFixtures: options.writeFixtures ?? true,
  })
  const report = buildOperatorReport({
    assetFailures,
    pairedNoticeCount: pairedNotices.length + historicalNotices.length,
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
    assetRole?: 'governmentNotice' | 'historicalGovernmentNotice'
    curation: LandsdStreetAppliedCuration | null
    evidence: Map<string, PublishedPreparedAsset>
    parsedPdfEntry: PairedLandsdGovernmentNoticePdfEntry | null
    previewsByPlanUrl: Map<string, LandsdStreetAssetLink[]>
    sourceKind?: 'historical-notice' | 'notice'
    supplementalEvidenceAssets?: LandsdStreetAssetLink[]
  },
): LandsdStreetRecord {
  const noticeRef = governmentNoticeIdentity(notice.governmentNotices.en)
  const governmentNoticeAssets = [
    getEvidence(
      options.evidence,
      options.assetRole ?? 'governmentNotice',
      notice.governmentNotices.en,
      'en',
    ),
    getEvidence(
      options.evidence,
      options.assetRole ?? 'governmentNotice',
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
    districtCodes: districtCodesForNotice(notice, options.parsedPdfEntry),
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
    evidenceAssets: [
      ...governmentNoticeAssets,
      ...planAssets,
      ...(options.supplementalEvidenceAssets ?? []),
    ],
    sourceKind: options.sourceKind ?? 'notice',
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

const DISTRICT_CODES_BY_NAME: Record<string, string> = {
  'central and western': 'c&w',
  eastern: 'e',
  islands: 'i',
  'kowloon city': 'kc',
  'kwun tong': 'kt',
  north: 'n',
  southern: 's',
  'sai kung': 'sk',
  'sham shui po': 'ssp',
  'sha tin': 'st',
  'tai po': 'tp',
  'tsuen wan': 'tw',
  'tuen mun': 'tm',
  'wan chai': 'wc',
  'wong tai sin': 'wts',
  'yau tsim mong': 'ytm',
  'yuen long': 'yl',
}

function districtCodesForNotice(
  notice: PairedLandsdStreetNotice,
  parsedPdfEntry: PairedLandsdGovernmentNoticePdfEntry | null,
) {
  const label = parsedPdfEntry?.districts?.en ?? notice.district.en
  const normalised = label
    .toLocaleLowerCase('en')
    .replaceAll('&', 'and')
    .replaceAll(/\bdistrict\b/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
  const code = DISTRICT_CODES_BY_NAME[normalised]
  return code ? [code] : []
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
    '../../../../../../../fixtures/meta/releases',
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
    const pdfPaths = [
      ['English', missingNonReviewable.governmentNotices.en, 'en'] as const,
      [
        'Traditional Chinese',
        missingNonReviewable.governmentNotices.zhHant,
        'zh-Hant',
      ] as const,
    ].flatMap(([label, link, locale]) => {
      if (!link) return []
      const prepared = evidence.get(['governmentNotice', link.url, locale].join('\0'))
      return prepared ? [`${label} PDF: ${prepared.prepared.filePath}`] : []
    })
    throw new Error(
      [
        `${missingNonReviewable.id}: Government Notice PDF layout was not parseable.`,
        ...pdfPaths,
      ].join('\n'),
    )
  }
  return {
    entries,
    notices: expandIntentionNotices({
      entries,
      english,
      notices,
      zhHant,
    }),
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

function expandIntentionNotices(input: {
  entries: Map<string, PairedLandsdGovernmentNoticePdfEntry>
  english: Map<string, ReturnType<typeof parseLandsdGovernmentNoticePdfText>>
  notices: PairedLandsdStreetNotice[]
  zhHant: Map<string, ReturnType<typeof parseLandsdGovernmentNoticePdfText>>
}) {
  const groups = new Map<string, PairedLandsdStreetNotice[]>()
  for (const notice of input.notices) {
    if (notice.governmentNoticeType !== 'intention') continue
    const key = notice.noticeIdentity ?? notice.id
    groups.set(key, [...(groups.get(key) ?? []), notice])
  }
  if (groups.size === 0) return input.notices

  const replacedIds = new Set<string>()
  const expanded: PairedLandsdStreetNotice[] = []
  for (const notices of groups.values()) {
    const source = notices[0]
    if (!source) continue
    const english = input.english.get(source.id)
    const zhHant = input.zhHant.get(source.id)
    if (!english || !zhHant || english.entries.length !== zhHant.entries.length) {
      throw new Error(
        `${source.noticeIdentity ?? source.id}: intention notice PDF rows are not bilingual-aligned.`,
      )
    }
    for (const notice of notices) replacedIds.add(notice.id)
    for (const [ordinal, englishEntry] of english.entries.entries()) {
      const zhHantEntry = zhHant.entries[ordinal]
      if (!zhHantEntry || !englishEntry.name || !zhHantEntry.name) {
        throw new Error(
          `${source.noticeIdentity ?? source.id}: intention notice PDF row ${ordinal + 1} has no bilingual street name.`,
        )
      }
      const englishReferences = new Set(englishEntry.previousNoticeRefs)
      const zhHantReferences = new Set(zhHantEntry.previousNoticeRefs)
      if (
        englishReferences.size > 0 &&
        zhHantReferences.size > 0 &&
        !(
          englishReferences.size === zhHantReferences.size &&
          [...englishReferences].every(reference => zhHantReferences.has(reference))
        )
      ) {
        throw new Error(
          `${source.noticeIdentity ?? source.id}: intention notice PDF row ${ordinal + 1} has bilingual Previous G.N. disagreement.`,
        )
      }
      const id = `${source.id}:pdf-row:${hashText(`${englishEntry.name}\0${zhHantEntry.name}\0${ordinal}`)}`
      const parsedEntry: PairedLandsdGovernmentNoticePdfEntry = {
        descriptions: {
          en: englishEntry.description,
          zhHant: zhHantEntry.description,
        },
        districts: { en: englishEntry.district, zhHant: zhHantEntry.district },
        effectiveDate: englishEntry.effectiveDate ?? zhHantEntry.effectiveDate,
        gazetteDate:
          english.gazetteDate ?? zhHant.gazetteDate ?? source.publicationDate,
        parserDiagnostics: { en: english.diagnostics, zhHant: zhHant.diagnostics },
        previousNoticeRefs: [
          ...new Set([
            ...englishEntry.previousNoticeRefs,
            ...zhHantEntry.previousNoticeRefs,
          ]),
        ].sort(),
        rawExtractedText: { en: english.rawText, zhHant: zhHant.rawText },
      }
      input.entries.set(id, parsedEntry)
      expanded.push({
        ...source,
        id,
        names: { en: englishEntry.name, zhHant: zhHantEntry.name },
        noticeOrdinal: ordinal,
        sourceOrdinals: { en: ordinal, zhHant: ordinal },
      })
    }
  }
  return [...input.notices.filter(notice => !replacedIds.has(notice.id)), ...expanded]
}

type ParsedEgazetteStreetNameArchive = {
  assetRecords: Map<string, EgazetteStreetNameRecord>
  entries: Map<string, PairedLandsdGovernmentNoticePdfEntry>
  notices: PairedLandsdStreetNotice[]
}

function emptyParsedEgazetteStreetNameArchive(): ParsedEgazetteStreetNameArchive {
  return { assetRecords: new Map(), entries: new Map(), notices: [] }
}

async function extractChineseEgazetteNoticeText(input: {
  nativeText: string
  pdfPath: string
}) {
  const native = parseLandsdGovernmentNoticePdfText(input.nativeText, 'zh-Hant')
  if (hasUsableChineseNoticeRows(native)) {
    return { nativeText: null, parsed: native }
  }
  const ocr = await ocrPdfToTraditionalChineseText(input.pdfPath)
  const text = ocr.text
  const parsed = parseLandsdGovernmentNoticePdfText(text, 'zh-Hant')
  return {
    nativeText: input.nativeText,
    parsed: {
      ...parsed,
      diagnostics: {
        ...parsed.diagnostics,
        extraction: {
          engine: 'PaddleOCR',
          engineVersion: ocr.engineVersion,
          language: 'zh-Hant',
          method: 'ocr' as const,
          model: ocr.model,
          nativeTextStatus: 'unparseable' as const,
          renderDpi: 300,
        },
      },
    },
  }
}

function hasUsableChineseNoticeRows(
  value: ReturnType<typeof parseLandsdGovernmentNoticePdfText>,
) {
  return (
    value.diagnostics.status === 'success' && value.entries.every(entry => entry.name)
  )
}

/**
 * PaddleOCR word coordinates are rebuilt into sparse fixed-width lines so the
 * existing Gazette parser keeps responsibility for table interpretation.
 */
async function ocrPdfToTraditionalChineseText(pdfPath: string) {
  const temporaryDir = await mkdtemp(join(tmpdir(), 'saanseoi-egazette-ocr-'))
  try {
    const prefix = join(temporaryDir, 'page')
    await runCommand('pdftoppm', ['-r', '300', '-png', pdfPath, prefix])
    const images = (await readdir(temporaryDir))
      .filter(file => /^page-\d+\.png$/.test(file))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    if (images.length === 0) {
      throw new Error(`OCR could not render any pages from ${pdfPath}.`)
    }
    const pages: string[] = []
    let engineVersion: string | undefined
    let model: string | undefined
    for (const image of images) {
      const output = await runCommandStdout(PADDLE_OCR_PYTHON, [
        PADDLE_OCR_SCRIPT,
        join(temporaryDir, image),
      ])
      const page = parsePaddleOcrOutput(output)
      engineVersion ??= page.engineVersion
      model ??= page.model
      pages.push(layoutPaddleOcrWords(page.words))
    }
    return { engineVersion, model, text: pages.join('\n') }
  } catch (error) {
    throw new Error(
      `Traditional Chinese e-Gazette OCR failed for ${pdfPath}. Ensure the UV runtime is installed with \`uv sync --project apps/harbour-dataops --python 3.12\` and that PaddleOCR can download or access its initial model weights (the underlying error identifies the missing runtime or model): ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    await rm(temporaryDir, { recursive: true, force: true })
  }
}

function parsePaddleOcrOutput(value: string) {
  type Word = { left: number; text: string; top: number }
  let engineVersion: string | undefined
  let model: string | undefined
  const words: Word[] = []
  for (const [index, line] of value.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    let item: Record<string, unknown>
    try {
      item = JSON.parse(line) as Record<string, unknown>
    } catch {
      throw new Error(`PaddleOCR emitted invalid JSON on line ${index + 1}.`)
    }
    if (item.type === 'metadata') {
      if (typeof item.engineVersion === 'string') engineVersion = item.engineVersion
      if (typeof item.model === 'string') model = item.model
      continue
    }
    if (
      item.type === 'word' &&
      typeof item.left === 'number' &&
      typeof item.top === 'number' &&
      typeof item.text === 'string' &&
      item.text.trim()
    ) {
      words.push({ left: item.left, text: item.text.trim(), top: item.top })
    }
  }
  if (!engineVersion || !model || words.length === 0) {
    throw new Error('PaddleOCR returned no recognized Traditional Chinese text.')
  }
  return { engineVersion, model, words }
}

function layoutPaddleOcrWords(
  words: Array<{ left: number; text: string; top: number }>,
) {
  const lines = new Map<string, Array<{ left: number; text: string; top: number }>>()
  for (const word of words) {
    // Separate table columns often become separate OCR blocks. Group by their
    // visual baseline instead, preserving the column positions below.
    const key = Math.round(word.top / 16).toString()
    const line = lines.get(key) ?? []
    line.push(word)
    lines.set(key, line)
  }
  return [...lines.values()]
    .map(words => {
      const sorted = [...words].sort((left, right) => left.left - right.left)
      let line = ''
      for (const word of sorted) {
        const column = Math.max(0, Math.round(word.left / 8))
        line += `${' '.repeat(Math.max(1, column - line.length))}${word.text}`
      }
      return line
    })
    .join('\n')
}

/**
 * The archive has no mutable HTML row model. Its bilingual PDFs are therefore
 * parsed as the source record itself, and every mismatch identifies the exact
 * manifest entry and local files that need repair.
 */
export async function parseEgazetteStreetNameArchive(input: {
  archiveDir: string
  onProgress: (progress: LandsdStreetIngestProgress) => void
  repoRoot: string
}): Promise<ParsedEgazetteStreetNameArchive> {
  const records = await loadEgazetteStreetNameArchive({
    archiveDir: input.archiveDir,
    repoRoot: input.repoRoot,
  })
  const assetRecords = new Map<string, EgazetteStreetNameRecord>()
  const entries = new Map<string, PairedLandsdGovernmentNoticePdfEntry>()
  const notices: PairedLandsdStreetNotice[] = []

  for (const [index, record] of records.entries()) {
    const label = `${record.publicationDate} ${record.issueVolume} ${record.subject}`
    input.onProgress({
      current: index,
      message: `Parsing historical e-Gazette PDF ${index + 1}/${records.length}: ${label}`,
      total: records.length,
    })
    const enPath = egazetteArchiveFilePath(input.repoRoot, record.assets.en.localPath)
    const zhHantPath = egazetteArchiveFilePath(
      input.repoRoot,
      record.assets['zh-Hant'].localPath,
    )
    const [enText, zhHantNativeText] = await Promise.all([
      pdfToText(enPath),
      pdfToText(zhHantPath),
    ])
    const english = parseLandsdGovernmentNoticePdfText(enText, 'en')
    const chinese = await extractChineseEgazetteNoticeText({
      nativeText: zhHantNativeText,
      pdfPath: zhHantPath,
    })
    const zhHant = chinese.parsed
    const details = `${label}; English ${record.assets.en.localPath}; Traditional Chinese ${record.assets['zh-Hant'].localPath}`
    const noticeRef = parseEgazetteNoticeRef(enText, details)
    const recordKey = `gn${noticeRef.slice(2)}`

    if (
      english.diagnostics.status !== 'success' ||
      zhHant.diagnostics.status !== 'success'
    ) {
      throw new Error(
        `e-Gazette PDF parsing failed for ${details}. English: ${english.diagnostics.message ?? english.diagnostics.layout}; Traditional Chinese: ${zhHant.diagnostics.message ?? zhHant.diagnostics.layout}.`,
      )
    }
    if (english.gazetteDate !== record.publicationDate) {
      throw new Error(
        `e-Gazette publication-date mismatch for ${details}. Manifest ${record.publicationDate}; English ${english.gazetteDate ?? 'unparsed'}.`,
      )
    }
    const englishType = parseLandsdGovernmentNoticeType(enText, 'en')
    if (!englishType) {
      throw new Error(
        `e-Gazette notice type is not parseable from the authoritative English PDF for ${details}.`,
      )
    }
    if (english.entries.length !== zhHant.entries.length) {
      throw new Error(
        `e-Gazette bilingual row-count mismatch for ${details}. English ${english.entries.length}; Traditional Chinese ${zhHant.entries.length}.`,
      )
    }
    assetRecords.set(recordKey, record)
    for (const [ordinal, englishEntry] of english.entries.entries()) {
      const zhHantEntry = zhHant.entries[ordinal]
      if (!zhHantEntry || !englishEntry.name || !zhHantEntry.name) {
        throw new Error(
          `e-Gazette street row ${ordinal + 1} is not parseable for ${details}. English name ${englishEntry.name ? 'present' : 'missing'}; Traditional Chinese name ${zhHantEntry?.name ? 'present' : 'missing'}.`,
        )
      }
      const id = `hkgov-gld-egazette-street:${hashText(`${recordKey}\0${record.publicationDate}\0${ordinal}`)}`
      notices.push({
        district: { en: '', zhHant: '' },
        governmentNotices: {
          en: {
            label: `G.N. ${noticeRef.slice(2)}`,
            url: record.assets.en.officialUrl,
          },
          zhHant: {
            label: `第${noticeRef.slice(2)}號`,
            url: record.assets['zh-Hant'].officialUrl,
          },
        },
        governmentNoticeType: englishType,
        id,
        noticeIdentity: noticeRef,
        names: { en: englishEntry.name, zhHant: zhHantEntry.name },
        noticeOrdinal: ordinal,
        planUrls: [],
        publicationDate: record.publicationDate,
        sourceOrdinals: { en: ordinal, zhHant: ordinal },
      })
      entries.set(id, {
        descriptions: {
          en: englishEntry.description,
          zhHant: zhHantEntry.description,
        },
        // Gazette identity, effective dates, kinds and Previous G.N. values
        // remain English-PDF facts. Chinese OCR only supplies the publisher's
        // localized name and description when its text layer is absent.
        effectiveDate: englishEntry.effectiveDate,
        gazetteDate: record.publicationDate,
        parserDiagnostics: { en: english.diagnostics, zhHant: zhHant.diagnostics },
        previousNoticeRefs: [...new Set([...englishEntry.previousNoticeRefs])].sort(),
        rawExtractedText: {
          en: english.rawText,
          zhHant: zhHant.rawText,
          ...(chinese.nativeText ? { zhHantNative: chinese.nativeText } : {}),
        },
      })
    }
  }
  return { assetRecords, entries, notices }
}

function parseEgazetteNoticeRef(english: string, label: string) {
  const en = english.match(/\bG\.?N\.?\s*(\d{2,})\b/i)?.[1]
  if (!en) {
    throw new Error(
      `e-Gazette Government Notice reference is not parseable from the authoritative English PDF for ${label}.`,
    )
  }
  return `gn${en}`
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
    notice.governmentNoticeType === 'corrigendum' ||
    notice.governmentNoticeType === 'intention'
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

async function runCommandStdout(command: string, args: string[]) {
  const child = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`${command} failed: ${stderr.trim() || `exit code ${exitCode}`}`)
  }
  return stdout
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

function uniqueCount(values: string[][]) {
  return new Set(values.map(value => value.join('\0'))).size
}

function required(name: string, data: string[]) {
  return { data, name, nullable: false, type: 'STRING' as const }
}

function nullable(name: string, data: Array<string | null>) {
  return { data, name, nullable: true, type: 'STRING' as const }
}
