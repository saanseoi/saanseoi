import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { streetLocaleCodes } from '@repo/db'
import {
  LANDSD_STREET_NAMING_URL,
  LANDSD_STREET_PDF_URL,
  type LandsdStreetPageLocale,
  type PairedLandsdGovernmentNoticePdfEntry,
  pairLandsdStreetNoticePages,
  parseLandsdStreetPdfText,
  parseLandsdStreetSourcePage,
  type PairedLandsdStreetNotice,
} from './landsdStreet.ts'
import { egazetteArchiveFilePath } from './egazetteStreetName.ts'
import {
  loadLandsdStreetCuration,
  promptForLandsdStreetCuration,
  resolveLandsdStreetCuration,
  saveLandsdStreetCuration,
  type LandsdStreetBaselineCandidate,
} from './landsdStreetCuration.ts'
import {
  prepareSourceAsset,
  uploadPreparedSourceAsset,
  type PreparedSourceAsset,
  type SourceAssetRole,
} from '../../../sourceAssets.ts'
import { formatInteractiveRetry } from '../../../../cli/interactiveRetry.ts'
import type { UploadTarget } from '../../../../cli/options.ts'
import type {
  LandsdStreetAssetLink,
  LandsdStreetAssetPublisher,
  LandsdStreetIngestProgress,
  LandsdStreetNoticeDateRange,
  LandsdStreetOperatorReport,
  LandsdStreetReleasePayload,
  PublishedPreparedAsset,
} from './landsdStreetIngestTypes.ts'
import {
  DEFAULT_CURATION_PATH,
  DEFAULT_EGAZETTE_ARCHIVE_DIR,
  LANDSD_STREET_DATASET_CODE,
  REPO_ROOT,
} from './landsdStreetIngestConfig.ts'
import {
  buildRegisteredLocalSourceAssetLink,
  loadLocalSourceAssetIds,
  loadPersistedPublishedSourceAssets,
  loadPersistedSourceAssets,
  persistPublishedSourceAssetLink,
  sourceAssetCacheKey,
  writePersistedPublishedSourceAssets,
} from './landsdStreetIngestAssets.ts'
import {
  emptyParsedEgazetteStreetNameArchive,
  filterNoticesByDate,
  parseEgazetteStreetNameArchive,
  parseNoticePdfs,
} from './landsdStreetIngestEvidence.ts'
import {
  fetchRequired,
  fileNameFromUrl,
  hashBytes,
  isLifecycleCurationNotice,
  mediaTypeForRole,
  pdfToText,
  requiredAssetBytes,
  uniqueCount,
} from './landsdStreetIngestIo.ts'
import {
  buildOperatorReport,
  writeLifecycleReview,
  writeOperatorReport,
} from './landsdStreetIngestOutput.ts'
import {
  buildBaselineRecords,
  buildNoticeRecord,
  createLandsdStreetBaselineCandidates,
  createPlanPreviews,
  writeReleasePayloads,
} from './landsdStreetIngestRecords.ts'

/**
 * Downloads, pairs, parses, preserves and serialises a LandsD Street Name
 * release. It deliberately does not update the updater cursor: callers may
 * advance it only after their source/history/current release transaction has
 * also succeeded.
 */
export async function ingestLandsdStreetSource(options: {
  baselineCohort?: { sha256: string; sourceVersion: string }
  curationPath?: string
  baselineCandidates?: readonly LandsdStreetBaselineCandidate[]
  egazetteArchiveDir?: string
  includeEgazetteHistory?: boolean
  includeBaseline?: boolean
  includeLandsdNotices?: boolean
  egazetteNoticeDateRange?: LandsdStreetNoticeDateRange
  landsdNoticeDateRange?: LandsdStreetNoticeDateRange
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
  pdfToText?: (pdfPath: string) => Promise<string>
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
  const persistedPublishedAssets = await loadPersistedPublishedSourceAssets(outputDir)
  const localAssetIds = await loadLocalSourceAssetIds(options.target)
  if (persistedAssets.size > 0) {
    reportProgress({
      message: `Found ${persistedAssets.size} cached source PDF artefact(s) in this stage directory; matching PDFs will be reused by role, URL and locale`,
    })
  }
  if (persistedPublishedAssets.size > 0) {
    reportProgress({
      message: `Found ${persistedPublishedAssets.size} completed evidence registration(s) from an earlier run; their asset links will be reused without local D1/R2 work`,
    })
  }

  const egazette = options.includeEgazetteHistory
    ? await (async () => {
        reportProgress({
          message: 'Validating and parsing historical e-Gazette street-name PDFs',
        })
        return parseEgazetteStreetNameArchive({
          archiveDir: egazetteArchiveDir,
          dateRange: options.egazetteNoticeDateRange,
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
          outputDir: join(outputDir, 'artefacts'),
          role: input.role,
          sourcePageLocale: input.sourcePageLocale,
          sourcePageUrl: input.sourcePageUrl,
          url: input.url,
        }))
      const uploaded = await publisher(asset)
      const role = asset.manifest.artefact.role
      if (role === 'manifest') {
        throw new Error('A source artefact cannot have the manifest role.')
      }
      return {
        prepared: asset,
        link: {
          assetId: uploaded.source.assetId,
          assetUrl: uploaded.source.url,
          byteLength: asset.manifest.artefact.byteLength,
          contentHash: asset.manifest.artefact.sha256,
          label: input.label ?? null,
          mediaType: asset.manifest.artefact.mediaType,
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
      const cacheKey = sourceAssetCacheKey(input)
      const cachedAsset = persistedAssets.get(cacheKey)
      const cachedLink = persistedPublishedAssets.get(cacheKey)
      if (cachedAsset && cachedLink) {
        return {
          link: cachedLink,
          prepared: cachedAsset,
        } satisfies PublishedPreparedAsset
      }
      if (cachedAsset) {
        const registeredLink = await buildRegisteredLocalSourceAssetLink(
          cachedAsset,
          input.label,
          localAssetIds,
          options.target,
        )
        if (registeredLink) {
          await persistPublishedSourceAssetLink(
            outputDir,
            persistedPublishedAssets,
            cacheKey,
            registeredLink,
          )
          return {
            link: registeredLink,
            prepared: cachedAsset,
          } satisfies PublishedPreparedAsset
        }
        const published = await materialise({
          ...input,
          cachedAsset,
          fileName: cachedAsset.fileName,
          mediaType: cachedAsset.manifest.artefact.mediaType,
        })
        await persistPublishedSourceAssetLink(
          outputDir,
          persistedPublishedAssets,
          cacheKey,
          published.link,
        )
        return published
      }
      const response = await fetchRequired(fetchImplementation, input.url)
      const published = await materialise({
        bytes: new Uint8Array(await response.arrayBuffer()),
        fileName: input.fileName ?? fileNameFromUrl(input.url),
        label: input.label,
        mediaType: response.headers.get('content-type') ?? mediaTypeForRole(input.role),
        role: input.role,
        sourcePageLocale: input.sourcePageLocale,
        sourcePageUrl: input.sourcePageUrl,
        url: input.url,
      })
      await persistPublishedSourceAssetLink(
        outputDir,
        persistedPublishedAssets,
        cacheKey,
        published.link,
      )
      return published
    } catch (error) {
      assetFailures.push({
        role: input.role,
        url: input.url,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  let sourcePageRows = { en: 0, zhHant: 0 }
  let pairedNotices: PairedLandsdStreetNotice[] = []
  if (options.includeLandsdNotices ?? true) {
    reportProgress({
      message:
        'Refreshing English and Traditional Chinese source-page indexes to discover notices; cached PDFs will not be downloaded again',
    })
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
    sourcePageRows = { en: en.notices.length, zhHant: zhHant.notices.length }
    reportProgress({
      message: `Parsed ${en.notices.length} English and ${zhHant.notices.length} Traditional Chinese source-page row(s); pairing bilingual notices`,
    })
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
        sourcePageRows,
      })
      const reportPath = await writeOperatorReport(outputDir, report)
      throw new Error(`LandsD bilingual pairing failed. See ${reportPath}.`, {
        cause: error,
      })
    }
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
  notices = filterNoticesByDate(notices, options.landsdNoticeDateRange)
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
    ]) + ((options.includeBaseline ?? true) ? 1 : 0)
  let preservedAssets = 0
  for (const [recordKey, record] of historicalAssetRecords) {
    const assets: LandsdStreetAssetLink[] = []
    for (const locale of streetLocaleCodes) {
      const source = record.assets[locale]
      const localPath = egazetteArchiveFilePath(REPO_ROOT, source.localPath)
      reportProgress({
        current: preservedAssets,
        message: `Reading archived historical e-Gazette PDF ${preservedAssets + 1}/${assetTotal}; registering evidence asset: ${recordKey} (${locale})`,
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
  let recoveredPublishedAssetLinks = false
  for (const item of uniqueNoticeEvidence) {
    const key = sourceAssetCacheKey({
      role: item.role,
      sourcePageLocale: item.locale,
      url: item.link.url,
    })
    if (persistedPublishedAssets.has(key)) continue
    const cachedAsset = persistedAssets.get(key)
    if (!cachedAsset) continue
    const link = await buildRegisteredLocalSourceAssetLink(
      cachedAsset,
      item.link.label,
      localAssetIds,
      options.target,
    )
    if (!link) continue
    persistedPublishedAssets.set(key, link)
    recoveredPublishedAssetLinks = true
  }
  if (recoveredPublishedAssetLinks)
    await writePersistedPublishedSourceAssets(outputDir, persistedPublishedAssets)
  const cachedNoticeEvidenceCount = uniqueNoticeEvidence.filter(item =>
    persistedAssets.has(
      sourceAssetCacheKey({
        role: item.role,
        sourcePageLocale: item.locale,
        url: item.link.url,
      }),
    ),
  ).length
  const registeredNoticeEvidenceCount = uniqueNoticeEvidence.filter(item =>
    persistedPublishedAssets.has(
      sourceAssetCacheKey({
        role: item.role,
        sourcePageLocale: item.locale,
        url: item.link.url,
      }),
    ),
  ).length
  const cachedBaseline =
    (options.includeBaseline ?? true) &&
    persistedAssets.has(
      sourceAssetCacheKey({
        role: 'sourcePdf',
        sourcePageLocale: 'en',
        url: LANDSD_STREET_PDF_URL,
      }),
    )
  const cachedSourcePdfCount = cachedNoticeEvidenceCount + Number(cachedBaseline)
  const registeredBaseline =
    (options.includeBaseline ?? true) &&
    persistedPublishedAssets.has(
      sourceAssetCacheKey({
        role: 'sourcePdf',
        sourcePageLocale: 'en',
        url: LANDSD_STREET_PDF_URL,
      }),
    )
  const registeredSourcePdfCount =
    registeredNoticeEvidenceCount + Number(registeredBaseline)
  const downloadableSourcePdfCount =
    uniqueNoticeEvidence.length +
    Number(options.includeBaseline ?? true) -
    cachedSourcePdfCount
  reportProgress({
    current: preservedAssets,
    message: `Paired ${pairedNotices.length} LandsD and ${egazette.notices.length} historical e-Gazette notice row(s); processing ${assetTotal} evidence PDF(s): ${registeredSourcePdfCount} already registered, ${cachedSourcePdfCount - registeredSourcePdfCount} cached PDF(s) still need local registration, ${downloadableSourcePdfCount} need downloading, and ${historicalAssetRecords.length * streetLocaleCodes.length} archived e-Gazette PDF(s) need reading`,
    total: assetTotal,
  })
  for (const item of uniqueNoticeEvidence) {
    const cacheKey = [item.role, item.link.url, item.locale].join('\0')
    reportProgress({
      current: preservedAssets,
      message: persistedPublishedAssets.has(
        sourceAssetCacheKey({
          role: item.role,
          sourcePageLocale: item.locale,
          url: item.link.url,
        }),
      )
        ? `Reusing registered evidence asset ${preservedAssets + 1}/${assetTotal}: ${item.link.label ?? item.link.url}`
        : persistedAssets.has(
              sourceAssetCacheKey({
                role: item.role,
                sourcePageLocale: item.locale,
                url: item.link.url,
              }),
            )
          ? `Reusing cached source PDF ${preservedAssets + 1}/${assetTotal}; registering evidence asset: ${item.link.label ?? item.link.url}`
          : `Downloading source PDF ${preservedAssets + 1}/${assetTotal}; preserving and registering evidence asset: ${item.link.label ?? item.link.url}`,
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

  const baselineAsset =
    (options.includeBaseline ?? true)
      ? await (async () => {
          reportProgress({
            current: preservedAssets,
            message: registeredBaseline
              ? `Reusing registered evidence asset ${preservedAssets + 1}/${assetTotal}: Gazetted Street Name`
              : cachedBaseline
                ? `Reusing cached source PDF ${preservedAssets + 1}/${assetTotal}; registering evidence asset: Gazetted Street Name`
                : `Downloading source PDF ${preservedAssets + 1}/${assetTotal}; preserving and registering evidence asset: Gazetted Street Name`,
            total: assetTotal,
          })
          const asset = await fetchAsset({
            fileName: 'Gazetted_Street_Name.pdf',
            label: 'Gazetted Street Name',
            role: 'sourcePdf',
            sourcePageLocale: 'en',
            sourcePageUrl: sourceUrl,
            url: LANDSD_STREET_PDF_URL,
          })
          preservedAssets += 1
          return asset
        })()
      : null

  if (assetFailures.length > 0) {
    const report = buildOperatorReport({
      assetFailures,
      pairedNoticeCount: pairedNotices.length,
      pairingFailures: [],
      pdfExtraction: { failed: 0, success: 0 },
      unmatchedPdfMappings: [],
      ambiguousLifecycleTargets: [],
      curationRequired: [],
      sourcePageRows,
      baselineCoverage: null,
    })
    const reportPath = await writeOperatorReport(outputDir, report)
    throw new Error(
      `LandsD evidence preservation failed for ${assetFailures.length} asset(s). See ${reportPath}.`,
    )
  }
  if ((options.includeBaseline ?? true) && !baselineAsset) {
    throw new Error('LandsD baseline PDF could not be preserved.')
  }

  let parsedNoticeEntries: Map<string, PairedLandsdGovernmentNoticePdfEntry>
  let pdfExtraction = { failed: 0, success: 0 }
  let unmatchedPdfMappings: string[] = []
  try {
    const parsed = await parseNoticePdfs(
      notices,
      evidence,
      reportProgress,
      options.pdfToText ?? pdfToText,
    )
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
      sourcePageRows,
      unmatchedPdfMappings: [error instanceof Error ? error.message : String(error)],
    })
    const reportPath = await writeOperatorReport(outputDir, report)
    throw new Error(`LandsD Government Notice PDF parsing failed. See ${reportPath}.`, {
      cause: error,
    })
  }

  const historicalNotices = requestedNoticeIds ? [] : egazette.notices
  const allNotices = [...historicalNotices, ...notices]
  const allParsedNoticeEntries = new Map([...egazette.entries, ...parsedNoticeEntries])
  const curationPath = options.curationPath ?? DEFAULT_CURATION_PATH
  let baselineRows: Array<{
    chineseName: string
    districtCode: string
    englishName: string
  }> = []
  if (baselineAsset) {
    reportProgress({ message: 'Extracting the gazetted street-name baseline' })
    baselineRows = parseLandsdStreetPdfText(
      await pdfToText(baselineAsset.prepared.filePath),
    )
  }
  const baselineCandidates =
    baselineRows.length > 0
      ? createLandsdStreetBaselineCandidates(baselineRows, options.baselineCandidates)
      : (options.baselineCandidates ?? [])
  const baselineCandidatesByRecordKey = new Map(
    baselineCandidates.map(candidate => [candidate.recordKey, candidate]),
  )

  let curationManifest = await loadLandsdStreetCuration(curationPath)
  let curation = resolveLandsdStreetCuration({
    baselineCandidates,
    manifest: curationManifest,
    notices: allNotices,
    parsedEntries: allParsedNoticeEntries,
    validateManifestDecisions: options.includeLandsdNotices,
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
      baselineCandidates,
      manifest: curationManifest,
      notices: allNotices,
      parsedEntries: allParsedNoticeEntries,
      validateManifestDecisions: options.includeLandsdNotices,
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
      sourcePageRows,
      unmatchedPdfMappings,
    })
    const [reportPath, reviewPath] = await Promise.all([
      writeOperatorReport(outputDir, report),
      writeLifecycleReview(outputDir, curation.review),
    ])
    const retry = options.promptForCuration
      ? ''
      : `\n\n${formatInteractiveRetry(`./bin/saanseoi update --target ${options.target.remote ? options.target.environment : 'local'} --dataset ${LANDSD_STREET_DATASET_CODE} --download --check-now`)}`
    throw new Error(
      `LandsD notice(s) require lifecycle curation before publication. Review ${reviewPath}, record decisions in ${options.curationPath ?? DEFAULT_CURATION_PATH}, then rerun.${retry}\nOperator report: ${reportPath}.`,
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
  const baseline = baselineAsset
    ? buildBaselineRecords(
        baselineRows,
        allNoticeRecords,
        baselineCandidatesByRecordKey,
        [baselineAsset.link],
      )
    : { records: [] }

  reportProgress({ message: 'Writing release payload and operator report' })
  const releases = await writeReleasePayloads({
    baselineSourceVersion: baselineSourceVersion(
      baselineAsset?.link,
      options.baselineCohort,
    ),
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
    sourcePageRows,
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

function baselineSourceVersion(
  asset: LandsdStreetAssetLink | undefined,
  registered: { sha256: string; sourceVersion: string } | undefined,
) {
  if (!asset) return undefined
  if (registered?.sha256 === asset.contentHash) return registered.sourceVersion
  const date = asset.retrievedAt.match(/^(\d{4}-\d{2}-\d{2})T/)?.[1]
  if (!date) {
    throw new Error(
      `LandsD baseline asset ${asset.assetId} has no ISO retrieval date for release versioning.`,
    )
  }
  return `${date}.0`
}

export { LANDSD_STREET_DATASET_CODE } from './landsdStreetIngestConfig.ts'

export type {
  LandsdStreetAssetLink,
  LandsdStreetLocaleRecord,
  LandsdStreetRecord,
  LandsdStreetReleasePayload,
  LandsdStreetOperatorReport,
  LandsdStreetAssetPublisher,
  LandsdStreetIngestProgress,
  LandsdStreetNoticeDateRange,
} from './landsdStreetIngestTypes.ts'

export {
  createLandsdStreetBaselineCandidates,
  landsdStreetBaselineCandidatesFromRecords,
  assignLandsdStreetBaselineIds,
  createLandsdStreetReleasePayload,
  reconcileLandsdStreetBaselineRecords,
} from './landsdStreetIngestRecords.ts'

export { buildStreetReleaseNotes } from './landsdStreetIngestOutput.ts'

export { parseEgazetteStreetNameArchive } from './landsdStreetIngestEvidence.ts'

export { assertLandsdDownloadUrl } from './landsdStreetIngestIo.ts'
