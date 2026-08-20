export type ReleaseLinkTitlePart = {
  colour?: string
  muted?: boolean
  value: string
}

export type ReleaseLinkHeaderFact = {
  label?: string
  value: string
}

export type ReleaseLinkCardPresentation = {
  accentColour?: string
  detail?: string
  detailLabel?: string
  eyebrow: string
  eyebrowColour?: string
  expanded?: boolean
  headerFacts?: ReleaseLinkHeaderFact[]
  href: string
  id?: string
  publisherLogoSrc?: string
  publisherName?: string
  title: string
  titleColour?: string
  titleParts?: ReleaseLinkTitlePart[]
}

export type ReleaseLinkFact = {
  description?: string
  label: string
  value: string
}

export type ReleaseLinkRequestExample = {
  method?: string
  path: string
  query?: Array<{ key: string; value: string }>
}

export type ReleaseLinkAction = {
  disabled?: boolean
  download?: boolean
  href?: string
  icon?: string
  id: string
  label: string
}

export type ReleaseLinksProvenanceEntry = ReleaseLinkCardPresentation & {
  actions?: ReleaseLinkAction[]
  description?: string
  facts?: ReleaseLinkFact[]
  request?: ReleaseLinkRequestExample
  requestLabel?: string
  /** Structured provenance used by alternate renderings such as tables. */
  datasetName?: string
  publisherCode?: string
  resourceType?: string
  role?: 'primary' | 'supporting'
  snapshotCode?: string
  sourceReleaseCode?: string
}

export type ReleaseLinksProvenanceGroup = {
  entries: ReleaseLinksProvenanceEntry[]
  id?: string
  label?: string
  title?: string
}

export type ReleaseLinksProvenancePresentation = {
  groups: ReleaseLinksProvenanceGroup[]
}
