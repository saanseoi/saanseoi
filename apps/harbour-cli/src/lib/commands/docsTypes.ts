export type ApiReleaseSetDocsRow = {
  id: string
  apiFamily: string
  apiVersion: string
  code: string
  domainCode: string
  status: string
  schemaVersion: string
  rulesetVersion: string
  publishedAt: string | null
  validFrom: string | null
  validTo: string | null
  notes: string | null
  guide: string | null
  createdAt: string
  updatedAt: string
  sources?: ApiReleaseSetSourceDocsRow[]
}

export type ApiReleaseSetSourceDocsRow = {
  datasetCode: string
  datasetI18n: Array<{ description?: string | null; locale: string; name: string }>
  publisherCode: string
  publisherI18n: Array<{ locale: string; name: string; nameShort?: string | null }>
  releaseCode: string
  resourceType: string
  role: 'primary' | 'supporting'
  sourceVersion: string
  variant: string
}

export type ReleaseDocsRow = {
  id: string
  datasetId: string
  datasetCode: string
  regionCode: string
  theme: string
  source: string
  code: string
  sourceVersion: string
  sourceSchemaVersion: string | null
  cohortKey: string | null
  publicationDate: string | null
  status: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ParsedReleaseSetCode = {
  apiFamily: string
  cohortKey: string
  regionCode: string
  sequence: number
}

export type DocsFixture = {
  body: string
  frontmatter: Record<string, string>
  path: string
}

export type ParsedApiReleaseSetDocsRow = ApiReleaseSetDocsRow & {
  parsedCode: ParsedReleaseSetCode
}

export type DocsScope = 'apiReleaseSets' | 'releases'

export type PublishDocsScope = DocsScope | 'all'
