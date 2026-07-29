export type LocalisedRow = {
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
  publisherI18n?: LocalisedRow[]
}

export type ApiRelease = {
  id: string
  apiVersionId: string
  apiFamily: string
  apiVersion: string
  code: string
  regionCode?: string | null
  domainCode?: string
  cohortKey?: string | null
  revision?: number
  schemaVersion: string
  rulesetVersion: string
  status: string
  displayStatus?: 'current' | 'draft' | 'revised' | 'superseded' | 'archived'
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
  processingActions?: Array<{
    id: string
    releaseId: string
    action: string
    mode: 'automatic' | 'manual'
    summary: string
    affectedRecordCount: number
    evidence: unknown
    createdAt: string
    updatedAt: string
    sourceCode?: string
    sourceReleaseCode?: string
  }>
  bulkActions?: Array<{
    id: string
    operationCode: string
    type: 'bulk'
    sourceFieldPath?: string
    targetFieldPath?: string
    condition?: string
    mappings?: Array<{ from: string; to: string }>
    i18n: Array<{ locale: string; description: string }>
    sourceCode: string
    sourceReleaseCode: string
  }>
  contributingSources?: Array<{
    sourceCode: string
    sourceReleaseCode: string
    publisherCode: string
    snapshotCode: string
    role: 'primary' | 'supporting'
    resourceType: string
    sourceVersion: string
    subType: string | null
    variant: string
    sourceArchive?: {
      assetId: string
      mediaType: string
    }
  }>
  createdAt: string
  updatedAt: string
  primaryRecordCount?: number | null
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
  apiComposition?: Array<{
    id: string
    defaultDomainCode?: string | null
    i18n?: Record<string, LocalisedRow[]> | null
    status: string
    version: number
  }>
  apiCatalogRevisions?: Array<{
    code: string
    publicationDate: string
    revision: number
    releases: Array<{
      apiReleaseSetId: string
      domainCode: string
      cohortKey: string
    }>
  }>
  releases?: ApiRelease[]
}

export type SourceVersion = {
  id: string
  datasetId: string
  datasetCode: string
  code: string
  sourceVersion: string
  sourceSchemaVersion?: string | null
  processingRules?: ReleaseMergeRules | null
  publicationDate?: string | null
  cohortKey?: string | null
  sourceArchiveAssetId?: string
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
  processingActions?: Array<{
    id: string
    releaseId: string
    action: string
    mode: 'automatic' | 'manual'
    summary: string
    affectedRecordCount: number
    evidence: unknown
    createdAt: string
    updatedAt: string
  }>
  releaseAs?: Array<{
    apiFamily: string
    apiVersion: string
    cohortKey: string | null
    code: string
    domainCode: string
    revision: number
    role: 'primary' | 'supporting'
    resourceType: string
    snapshotCode: string
    variant: string
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
  subType: string | null
  sourceVariant: string
  resourceTypes: string[]
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
  processingRules?: DatasetMergeRuleReference[] | null
  datasetI18n?: LocalisedRow[]
  transforms?: Array<{
    code: string
    resourceType: string
    sourceVersion: string
    outputVariant: string
    derivation: unknown
  }>
  sourceVersions?: SourceVersion[]
}

export type DatasetMergeRuleReference = {
  rulesetVersion: string
  operationCodes: string[]
}

export type ReleaseMergeRules = {
  rulesets: Array<{
    rulesetVersion: string
    rulesetVersionHash: string
    rules: Array<{
      operationCode: string
      type: 'bulk' | 'record'
      sourceFieldPath?: string
      targetFieldPath?: string
      condition?: string
      mappings?: Array<{ from: string; to: string }>
      i18n: Array<{
        locale: string
        description: string
      }>
    }>
  }>
}
