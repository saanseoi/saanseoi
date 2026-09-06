import { resolve } from 'node:path'
import type {
  StatsAggregation,
  StatsFieldComparability,
  StatsPeriodicity,
  StatsStatisticKind,
} from '@repo/db'

export type CenstatdFieldCurationEntry = {
  aggregation: Exclude<StatsAggregation, 'unreviewed'>
  aggregationPercentile?: number
  periodicity?: StatsPeriodicity
  comparability?: StatsFieldComparability
  denominatorFieldName?: string | null
  dimensions: Readonly<Record<string, string>>
  localisations: readonly CenstatdFieldLocalisation[]
  /** The dimension-free statistic represented by this source-field mapping. */
  measureCode: string
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  fieldName: string
  schemaSpecification?: {
    sha256: string
    url: string
  }
  sourceNullOption?: string | null
  sourceField: string
  unitCode: string
}

export type CenstatdFieldCurationManifest = {
  datasetCode: string
  fields: CenstatdFieldCurationEntry[]
  schemaVersion: 8
}

export type CenstatdFieldCurationDecision = CenstatdFieldCurationEntry & {
  datasetCode: string
}

export type CenstatdFieldCurationRegistry = {
  fields: CenstatdFieldCurationDecision[]
}

export type CenstatdFieldForCuration = {
  datasetCode: string
  sourceField: string
  unitCode: string
  valueKind: string
}

export type CenstatdFieldMetadata = {
  aggregation: Exclude<StatsAggregation, 'unreviewed'>
  aggregationPercentile?: number
  periodicity?: StatsPeriodicity
  comparability?: StatsFieldComparability
  denominatorFieldName?: string | null
  dimensions: Readonly<Record<string, string>>
  localisations: readonly CenstatdFieldLocalisation[]
  measureCode: string
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  fieldName: string
  sourceNullOption?: string | null
  unitCode: string
}

export type CenstatdMeasureMetadata = {
  localisations: readonly CenstatdFieldLocalisation[]
  measureCode: string
}

export type CenstatdFieldLocalisation = {
  description: string
  isTranslationVerified: boolean
  locale: 'en' | 'zh-Hans' | 'zh-Hant'
  name: string
}

export type CenstatdSchemaMeasureCandidate = {
  localisations: readonly CenstatdFieldLocalisation[]
  fieldName: string
  sourceReleaseUrl: string
  schemaSpecification: {
    sha256: string
    url: string
  }
  sourceNullOption: string
}

export const DEFAULT_CURATION_DIRECTORY = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/curations/hkgov-censtatd-statistics',
)

export const DEFAULT_MEASURE_CURATION_DIRECTORY = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/curations/hkgov-censtatd-statistics-measures',
)

export const DEFAULT_UNITS_PATH = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/units/standard.json',
)

export type UnitRegistryFixture = {
  versionHash: string
  units: Array<{
    code: string
    dimension: string
    symbol: string
    i18n: Array<{
      locale: 'en' | 'zh-Hans' | 'zh-Hant'
      name: string
      description?: string
    }>
  }>
}
