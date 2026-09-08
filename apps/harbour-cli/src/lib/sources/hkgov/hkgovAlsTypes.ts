import type { CurrentDatabase, HistoryDatabase, MetaDatabase } from '@repo/db'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay'
import type { UploadEnvironment } from '../../cli/options.ts'
import type {
  HkgovAlsIdentityDecisions,
  HkgovAlsIdentityDriftCandidate,
  HkgovAlsIdentityHistory,
  HkgovAlsIdentityRecord,
} from './hkgovAlsDrift.ts'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import type { AddressDivisionQualityCounts } from '@repo/core/pipeline/services/stats'
import type { HkgovAls3dParentBlockEnrichment } from './hkgovAls3dBlockEnrichment.ts'

export type PrepareHkgovAlsOptions = {
  dbPath?: string
  environment: UploadEnvironment
  currentDb?: CurrentDatabase
  historyDb?: HistoryDatabase
  historyShards?: ReadonlyMap<string, ReplayShard>
  identityDecisions?: HkgovAlsIdentityDecisions
  identityHistory?: HkgovAlsIdentityHistory
  metaDb?: MetaDatabase
  outputFile: string
  cohortKey: string
  divisionCohortKey?: string
  sourceDir: string
  sourceVersion: string
  postProcessPremiseStructure?: boolean
  writeOutput?: boolean
  skipCurationChecks?: boolean
}

export type DivisionLookupMaps = {
  areaByEn: Map<string, string>
  areaByZh: Map<string, string>
  ambiguousAreaEn: Set<string>
  ambiguousAreaZh: Set<string>
  countryId: string | null
  districtByEn: Map<string, string>
  districtByZh: Map<string, string>
  ambiguousDistrictEn: Set<string>
  ambiguousDistrictZh: Set<string>
  snapshotId: string
}

export type HkgovAlsGeoJson = {
  features?: HkgovAlsFeature[]
}

export type HkgovAlsFeature = {
  geometry?: {
    coordinates?: [number, number]
    type?: string
  } | null
  properties?: {
    Address?: {
      PremisesAddress?: HkgovPremisesAddress | null
    } | null
    Easting?: number | null
    Northing?: number | null
  } | null
}

export type HkgovAlsSourceDuplicateGroup = {
  address: string
  canonicalRecord?: Record<string, unknown>
  ignoredRecords?: Array<Record<string, unknown>>
  occurrences: Array<{
    featureIndexOneBased: number
    sourceFile: string
  }>
}

export type HkgovAlsSourceFeature = {
  feature: HkgovAlsFeature
  featureIndexOneBased: number
  sourceFile: string
}

type HkgovPremisesAddress = {
  BuildingCsuInformation?: {
    CsuId?: string | null
  } | null
  ChiPremisesAddress?: HkgovLocalisedPremisesAddress | null
  EngPremisesAddress?: HkgovLocalisedPremisesAddress | null
  GeoAddress?: string | null
}

export type HkgovLocalisedPremisesAddress = {
  Region?: string | null
  ChiDistrict?: string | null
  EngDistrict?: string | null
  BuildingName?: string | null
  ChiBlock?: {
    BlockDescriptor?: string | null
    BlockNo?: string | number | null
  } | null
  EngBlock?: {
    BlockDescriptor?: string | null
    BlockDescriptorPrecedenceIndicator?: string | null
    BlockNo?: string | number | null
  } | null
  ChiEstate?: {
    EstateName?: string | null
  } | null
  EngEstate?: {
    EstateName?: string | null
  } | null
  ChiPhase?: {
    PhaseName?: string | null
    PhaseNo?: string | number | null
  } | null
  EngPhase?: {
    PhaseName?: string | null
    PhaseNo?: string | number | null
  } | null
  ChiStreet?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    StreetName?: string | null
  } | null
  EngStreet?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    StreetName?: string | null
  } | null
  ChiVillage?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    LocationName?: string | null
    VillageName?: string | null
  } | null
  EngVillage?: {
    BuildingNoFrom?: string | number | null
    BuildingNoTo?: string | number | null
    LocationName?: string | null
    VillageName?: string | null
  } | null
  ChiUnit?: {
    UnitDescriptor?: string | null
    UnitNo?: string | number | null
  } | null
  EngUnit?: {
    UnitDescriptor?: string | null
    UnitNo?: string | number | null
  } | null
}

export type PreparedHkgovAlsRow = {
  als3dParentBlockEnrichment?: HkgovAls3dParentBlockEnrichment
  parentAddressId?: string
  curatedGranularity?: 'complex' | 'building' | 'section'
  hierarchyCuration?: string
  id: string
  canonicalId: string
  theme: 'addresses'
  type: 'address'
  country: 'HK'
  region: 'HK'
  cohortKey: string
  sourceVersion: string
  sourceFile: string
  sourceFeatureIndexOneBased: number
  geometry: string | null
  identifiers: string | null
  sources: string
  divisionSnapshotId: string
  areaId: string | null
  areaMatchStatus: HkgovAlsDivisionMatchStatus
  districtId: string | null
  districtMatchStatus: HkgovAlsDivisionMatchStatus
  countryId: string | null
  areaNameEn: string | null
  areaNameZhHant: string | null
  districtNameEn: string | null
  districtNameZhHant: string | null
  geoAddress: string | null
  hkgovCsuId: string | null
  identityAlias: string | null
  identityBuildingId: string
  identityContinuityKey: string
  identityKey: string
  identityMatchMethod: string
  identityPreviousSummary?: Record<string, string | null>
  blockDescriptorPrecedenceIndicator: string | null
  identityNumberFrom: string | null
  identityNumberTo: string | null
  identityRouteNames: string
  identitySummary: Record<string, string | null>
  chiPremisesAddressJson: string | null
  engPremisesAddressJson: string | null
  zhHantFormattedAddress: string | null
  zhHantRegion: string | null
  zhHantDistrict: string | null
  zhHantEstateName: string | null
  zhHantBuildingName: string | null
  zhHantBlockDescriptor: string | null
  zhHantBlockNumber: string | null
  zhHantPhaseName: string | null
  zhHantPhaseRef: string | null
  zhHantStreetName: string | null
  zhHantStreetNumberFrom: string | null
  zhHantStreetNumberTo: string | null
  zhHantVillageName: string | null
  zhHantVillageNumberFrom: string | null
  zhHantVillageNumberTo: string | null
  enFormattedAddress: string | null
  enRegion: string | null
  enDistrict: string | null
  enEstateName: string | null
  enBuildingName: string | null
  enBuildingNameRomanNumeralNormalisation: {
    from: string
    to: string
  } | null
  enBlockDescriptor: string | null
  enBlockNumber: string | null
  enBlockNumberRomanNumeralNormalisation: {
    from: string
    to: string
  } | null
  enStreetName: string | null
  enStreetNumberFrom: string | null
  enStreetNumberTo: string | null
  enVillageName: string | null
  enVillageNumberFrom: string | null
  enVillageNumberTo: string | null
  enPhaseName: string | null
  enPhaseRef: string | null
  enPhaseRomanNumeralNormalisation: {
    from: string
    reference: string
    to: string
  } | null
  easting: number | null
  northing: number | null
}

export type PreparedHkgovAlsResult = {
  curationApplications: Array<{
    fixture:
      | 'hkgov-dpo-address-estate-component-gaps.json'
      | 'hkgov-dpo-address-estate-components.json'
    id: string
    verification: 'unverified' | 'verified'
  }>
  deduplicatedFeatureCount: number
  driftCandidates: HkgovAlsIdentityDriftCandidate[]
  featureCount: number
  identityConsolidatedFeatureCount: number
  identityEquivalentFeatureGroups: HkgovAlsSourceDuplicateGroup[]
  resolvedIdConsolidatedFeatureCount: number
  identityRecords: HkgovAlsIdentityRecord[]
  outputFile: string
  processingActions: ReleaseProcessingAction[]
  sourceDuplicateFeatureGroups: HkgovAlsSourceDuplicateGroup[]
  sourceFileCount: number
  divisionQuality: HkgovAlsDivisionQuality
}

export type HkgovAlsDivisionMatchStatus = 'ambiguous' | 'matched' | 'unmatched'

export type HkgovAlsDivisionQualityIssue = {
  address: string
  areaName: string | null
  areaStatus: HkgovAlsDivisionMatchStatus
  districtName: string | null
  districtStatus: HkgovAlsDivisionMatchStatus
  sourceFeatureIndexOneBased: number
  sourceFile: string
}

export type HkgovAlsDivisionQuality = AddressDivisionQualityCounts & {
  issues: HkgovAlsDivisionQualityIssue[]
}

export type DivisionLookupSource =
  | {
      dbPath: string
      kind: 'sqlite'
    }
  | {
      databaseName: string
      kind: 'wrangler'
      mode: 'remote'
      wranglerEnv: 'preview' | 'production'
    }
