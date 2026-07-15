export type LocalizedRow = {
  locale: string
  name: string
  description?: string | null
}

export type RegistryPublisher = {
  id: string
  code: string
  url?: string | null
  contactUrl?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  parentPublisherId?: string | null
  publisherI18n?: LocalizedRow[]
}

export type ApiRelease = {
  id: string
  apiVersionId: string
  apiFamily: string
  apiVersion: string
  code: string
  schemaVersion: string
  rulesetVersion: string
  status: string
  publishedAt?: string | null
  validFrom?: string | null
  validTo?: string | null
  ingestedAt?: string | null
  notes?: string | null
  rowCounts?: Array<{
    kind?: string | null
    label?: string | null
    rowCount: number
    tableName?: string | null
  }>
  stats?: Array<{
    dimension?: string | null
    metric?: string | null
    metricUnit?: string | null
    value: number
    groupBy?: string | null
    groupValue?: string | null
  }>
  createdAt: string
  updatedAt: string
}

export type RegistryApi = {
  id: string
  code: string
  familyType: string
  version: string
  status: string
  publishedAt?: string | null
  deprecatedAt?: string | null
  retiredAt?: string | null
  releases?: ApiRelease[]
}

export type SourceVersion = {
  id: string
  datasetId: string
  datasetCode: string
  code: string
  sourceVersion: string
  sourceSchemaVersion?: string | null
  publicationDate?: string | null
  cohortKey?: string | null
  releaseNotesUrl?: string | null
  notes?: string | null
  status: string
  ingestedAt?: string | null
  stats?: Array<{
    dimension?: string | null
    metric?: string | null
    metricUnit?: string | null
    value: number
    groupBy?: string | null
    groupValue?: string | null
  }>
  releaseAs?: Array<{
    apiFamily: string
    code: string
    role: 'primary' | 'supporting'
    snapshotCode: string
  }>
  createdAt: string
  updatedAt: string
  license?: {
    id: string | null
    code: string | null
    name: string | null
    url: string | null
  } | null
}

export type RegistrySource = {
  id: string
  publisherId: string
  publisherCode: string
  publisher?: RegistryPublisher | null
  code: string
  regionCode: string
  releaseType: string
  releaseFrequency: string
  theme: string
  type: string
  sourceUrl?: string | null
  licenseId?: string | null
  license?: {
    id: string | null
    code: string | null
    name: string | null
    url: string | null
  } | null
  category?: string | null
  attribution?: string | null
  tags?: unknown
  datasetI18n?: LocalizedRow[]
  sourceVersions?: SourceVersion[]
}
