import type { RegionCode } from '@repo/core'
import type {
  LandsdStreetNameChangeScope,
  LandsdStreetNoticeApplicationDisposition,
  LandsdStreetNoticeApplicationMethod,
  StreetEvidenceAsset,
  StreetLocaleCode,
} from '@repo/db'
import type {
  LandsdStreetChangelogEntry,
  LandsdStreetMaterialisedStreet,
  LandsdStreetLifecycleTextCorrection,
} from '../../sources/hkgov/landsd/street/landsdStreetLifecycle.ts'
import type { LandsdStreetSourceKind } from '../../sources/hkgov/landsd/street/landsdStreet.ts'

export type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

export type LandsdStreetUploadPlan = {
  cohortKey: string
  regionCode: RegionCode
  releaseCode: string
  rowCount: number
  source: 'hkgov-landsd'
  sourceVersion: string
  theme: 'streets'
  resourceType: 'street'
}

export type AssetLink = {
  assetId: string
  assetUrl: string
  byteLength: number
  contentHash: string
  manifest: StreetEvidenceAsset['manifest']
  mediaType: string
  objectKey: string
  originalUrl: string
  publisherIdentifier?: string | null
  retrievedAt: string
  role: StreetEvidenceAsset['role']
  sourcePageLocale?: StreetLocaleCode
  sourcePageUrl?: string
}

export type PreparedStreetI18n = {
  description: string | null
  locale: StreetLocaleCode
  name: string
}

export type PreparedStreet = {
  base: {
    districtIds: string[]
    noticeType: string | null
    id: string
    gazetteDate: string | null
    sources: Record<string, unknown>
    yearBuilt: null
  }
  application: {
    sourceStreetId: string | null
    resultStreetId: string | null
    disposition: LandsdStreetNoticeApplicationDisposition
    method: LandsdStreetNoticeApplicationMethod
    nameChangeScope: LandsdStreetNameChangeScope | null
    retainedDescriptions: Partial<Record<'en' | 'zh-Hant' | 'zh-Hans', string>> | null
    correction: LandsdStreetLifecycleTextCorrection | null
  } | null
  districtCodes: string[]
  i18n: PreparedStreetI18n[]
  deferToNotices: boolean
  noticeRef: string | null
  effectiveDate: string | null
  parserDiagnostics: Record<string, unknown> | null
  previousNoticeRefs: string[]
  rawExtractedText: Record<string, unknown> | null
  evidenceAssets: AssetLink[]
  sourceHash: string
  sourceKind: LandsdStreetSourceKind
  streetId: string | null
}

export type PreparedMaterialisedStreet = LandsdStreetMaterialisedStreet & {
  versionHash: string
}

export type PreparedStreetChangelog = LandsdStreetChangelogEntry & {
  sourceReleaseId: string
  sourceShardId: string
  versionHash: string
}
