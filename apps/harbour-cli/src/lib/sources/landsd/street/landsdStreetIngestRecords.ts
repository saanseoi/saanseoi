import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { streetLocaleCodes } from '@repo/db'
import {
  governmentNoticeIdentity,
  type LandsdStreetPageLocale,
  type PairedLandsdGovernmentNoticePdfEntry,
  type LandsdStreetSourceLink,
  type PairedLandsdStreetNotice,
} from './landsdStreet.ts'
import type {
  LandsdStreetAppliedCuration,
  LandsdStreetTextCorrection,
  LandsdStreetBaselineCandidate,
} from './landsdStreetCuration.ts'
import { mintLandsdStreetId } from './landsdStreetIds.ts'
import type { SourceAssetRole } from '../../sourceAssets.ts'
import type {
  LandsdStreetAssetLink,
  LandsdStreetIngestProgress,
  LandsdStreetRecord,
  LandsdStreetReleasePayload,
  PublishedPreparedAsset,
} from './landsdStreetIngestTypes.ts'
import { getEvidence } from './landsdStreetIngestEvidence.ts'
import {
  cachedPlanPreviewPaths,
  hashText,
  renderPlanPdfToWebp,
} from './landsdStreetIngestIo.ts'
import {
  buildStreetReleaseNotes,
  fixturePathFor,
  writeStreetParquet,
} from './landsdStreetIngestOutput.ts'

export function buildNoticeRecord(
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
          correction: options.curation.correction,
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
    previousNoticeRefs: correctedPreviousNoticeRefs(
      options.parsedPdfEntry?.previousNoticeRefs ?? [],
      options.curation?.correction ?? null,
    ),
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

function correctedPreviousNoticeRefs(
  refs: string[],
  correction: LandsdStreetTextCorrection | null,
) {
  if (!correction?.fields.includes('previousNoticeRefs')) return refs
  const normalise = (value: string) =>
    /^\d+$/.test(value) ? `gn${value}` : value.toLocaleLowerCase('en')
  const from = normalise(correction.from)
  const to = normalise(correction.to)
  return [...new Set(refs.map(ref => (normalise(ref) === from ? to : ref)))].sort()
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
        correction: null,
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

export function buildBaselineRecords(
  rows: Array<{ englishName: string; chineseName: string; districtCode: string }>,
  noticeRecords: LandsdStreetRecord[],
  candidatesByRecordKey: ReadonlyMap<string, LandsdStreetBaselineCandidate>,
  evidenceAssets: LandsdStreetAssetLink[] = [],
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
      evidenceAssets: [...evidenceAssets],
      sourceKind: 'baseline',
      recordKey: baselineRecordKey(row),
      rawExtractedText: null,
      streetId: candidatesByRecordKey.get(baselineRecordKey(row))?.streetId ?? null,
    })
  }
  return { records }
}

export function createLandsdStreetBaselineCandidates(
  rows: Array<{ chineseName: string; districtCode: string; englishName: string }>,
  existing: readonly LandsdStreetBaselineCandidate[] = [],
) {
  const existingByRecordKey = new Map(
    existing.map(candidate => [candidate.recordKey, candidate]),
  )
  return rows.map(row => {
    const recordKey = baselineRecordKey(row)
    const candidate = existingByRecordKey.get(recordKey)
    return {
      districtCodes: [row.districtCode],
      names: { en: row.englishName, zhHant: row.chineseName },
      recordKey,
      streetId: candidate?.streetId ?? mintLandsdStreetId(),
    } satisfies LandsdStreetBaselineCandidate
  })
}

export function landsdStreetBaselineCandidatesFromRecords(
  records: readonly LandsdStreetRecord[],
) {
  return records.flatMap(record => {
    if (record.sourceKind !== 'baseline' || !record.streetId) return []
    const en = record.i18n.find(item => item.locale === 'en')?.name
    const zhHant = record.i18n.find(item => item.locale === 'zh-Hant')?.name
    if (!en || !zhHant) return []
    return [
      {
        districtCodes: record.districtCodes,
        names: { en, zhHant },
        recordKey: record.recordKey,
        streetId: record.streetId,
      } satisfies LandsdStreetBaselineCandidate,
    ]
  })
}

export function assignLandsdStreetBaselineIds(records: readonly LandsdStreetRecord[]) {
  return records.map(record =>
    record.sourceKind === 'baseline' && !record.streetId
      ? { ...record, streetId: mintLandsdStreetId() }
      : record,
  )
}

function baselineRecordKey(row: {
  chineseName: string
  districtCode: string
  englishName: string
}) {
  return `landsd-street:baseline:${hashText(
    [row.englishName, row.chineseName, row.districtCode].join('\0'),
  )}`
}

export async function createPlanPreviews(input: {
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
    const pdf = getEvidence(input.evidence, 'gazettePlan', plan, 'en')
    const prepared = input.evidence.get(['gazettePlan', plan.url, 'en'].join('\0'))
    if (!pdf || !prepared) {
      processedPlans += 1
      continue
    }
    const previewDirectory = join(input.outputDir, 'previews')
    const cached = await cachedPlanPreviewPaths(
      prepared.prepared.filePath,
      previewDirectory,
    )
    input.onProgress({
      current: processedPlans,
      message: `${cached ? 'Reusing cached' : 'Rendering'} Gazette Plan previews (${processedPlans + 1}/${plans.size}): ${plan.label ?? plan.url}`,
      total: plans.size,
    })
    const rendered =
      cached ??
      (await renderPlanPdfToWebp(prepared.prepared.filePath, previewDirectory))
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

export async function writeReleasePayloads(input: {
  baselineSourceVersion?: string
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
    await createLandsdStreetReleasePayload({
      outputDir: input.outputDir,
      records,
      sourceVersion: latestNoticeDate
        ? `${latestNoticeDate}.0`
        : requireBaselineSourceVersion(input),
      writeFixture: input.writeFixtures,
    }),
  ]
}

function requireBaselineSourceVersion(input: {
  baselineRecords: LandsdStreetRecord[]
  baselineSourceVersion?: string
}) {
  if (input.baselineSourceVersion) return input.baselineSourceVersion
  if (input.baselineRecords.length === 0) {
    throw new Error('A notice-free street release has no baseline source version.')
  }
  throw new Error(
    'The LandsD gazetted-register release needs a publisher or acquisition date; a fictional historic anchor is not permitted.',
  )
}

export async function createLandsdStreetReleasePayload(input: {
  outputDir: string
  records: LandsdStreetRecord[]
  sourceVersion: string
  writeFixture: boolean
}): Promise<LandsdStreetReleasePayload> {
  const releaseDir = join(input.outputDir, input.sourceVersion)
  const parquetPath = join(releaseDir, 'landsd-street.parquet')
  await writeStreetParquet(parquetPath, input.records, input.sourceVersion)

  const fixturePath = input.writeFixture ? fixturePathFor(input.sourceVersion) : null
  if (fixturePath) {
    await mkdir(dirname(fixturePath), { recursive: true })
    await writeFile(
      fixturePath,
      buildStreetReleaseNotes(input.records, input.sourceVersion),
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

/**
 * The baseline is a present-state reconciliation list. Assemble it only after
 * every selected notice stage is present, so matching declarations and name
 * changes remain notice-originated streets rather than duplicate baseline IDs.
 */
export function reconcileLandsdStreetBaselineRecords(records: LandsdStreetRecord[]) {
  const notices = records.filter(record => record.sourceKind !== 'baseline')
  return records.map(record => {
    if (record.sourceKind !== 'baseline') return record
    const deferToNotices = notices.some(
      notice =>
        (notice.noticeType === 'declaration' ||
          Boolean(notice.application?.resultStreetId)) &&
        hasSameBilingualRecordName(notice, record),
    )
    return { ...record, deferToNotices }
  })
}

function hasSameBilingualRecordName(
  left: LandsdStreetRecord,
  right: LandsdStreetRecord,
) {
  return streetLocaleCodes.every(locale => {
    const leftName = left.i18n.find(item => item.locale === locale)?.name
    const rightName = right.i18n.find(item => item.locale === locale)?.name
    return Boolean(leftName && rightName && leftName === rightName)
  })
}
