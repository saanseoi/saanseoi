import type {
  LandsdStreetNameChangeScope,
  LandsdStreetNoticeApplicationDisposition,
  LandsdStreetNoticeApplicationMethod,
  StreetEvidenceAsset,
  StreetLocaleCode,
} from '@repo/db'
import type {
  LandsdStreetSourceKind,
  PairedLandsdStreetNotice,
} from './landsdStreet.ts'
import type {
  LandsdStreetTextCorrection,
  LandsdStreetLifecycleReview,
} from './landsdStreetCuration.ts'
import type { PreparedSourceAsset, SourceAssetRole } from '../../sourceAssets.ts'

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
    correction: LandsdStreetTextCorrection | null
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

export type PublishedPreparedAsset = {
  link: LandsdStreetAssetLink
  prepared: PreparedSourceAsset
}

export type PersistedPublishedSourceAssets = {
  assets: Record<string, LandsdStreetAssetLink>
  version: 1
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

export type LandsdStreetNoticeDateRange = {
  from?: string
  through?: string
}
