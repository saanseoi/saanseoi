export const apiFieldResourceTypes = ['address', 'division', 'street', 'place'] as const

export const jsonApiResourceTypes = [
  'addresses',
  'divisions',
  'streets',
  'places',
  'place-divisions',
  'street-addresses',
  'api-release-set-members',
] as const

export const profileNames = ['compact', 'default', 'full', 'map'] as const

export const resolverCodes = [
  'direct_copy',
  'join_lookup',
  'lookup_fk',
  'derive_bbox_from_geometry',
  'prefer_hkgov_then_overture',
  'prefer_overture_then_hkgov',
  'merge_first_non_empty',
  'normalize_whitespace',
] as const

export const datasetReleaseTypes = ['snapshot', 'static'] as const
export const datasetReleaseFrequencies = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'half-yearly',
  'yearly',
  'ad-hoc',
] as const
export const datasetThemes = [
  'addresses',
  'base',
  'divisions',
  'transport',
  'places',
] as const
export const datasetTypes = ['address', 'division', 'place', 'street'] as const
export const datasetCategories = ['terrain', 'transit', 'places', 'cultural'] as const

export const datasetStatuses = [
  'uploading',
  'staged',
  'processing',
  'current',
  'historic',
  'revoked',
  'failed',
] as const

export const releaseStatuses = [
  'staged',
  'processing',
  'published',
  'superseded',
  'revoked',
  'failed',
] as const

export const ingestRunStatuses = ['queued', 'running', 'completed', 'error'] as const

export const apiVersionStatuses = ['draft', 'active', 'deprecated', 'retired'] as const

export const apiReleaseSetStatuses = ['draft', 'active', 'archived'] as const
export const apiReleaseSetMemberRoles = [
  'primary',
  'enrichment',
  'fallback',
  'lookup',
] as const
export const apiEndpointMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export const apiEndpointUsageTypes = [
  'primary',
  'filter',
  'lookup',
  'enrichment',
  'join',
] as const
export const provenanceContributionTypes = [
  'primary',
  'fallback',
  'enrichment',
  'merge-input',
] as const

export const dataShardKinds = ['meta', 'current', 'history', 'source'] as const
export const dataShardEnvironments = ['preview', 'production'] as const
export const dataShardStatuses = [
  'provisioning',
  'active',
  'readonly',
  'retired',
] as const

export type ApiFieldResourceType = (typeof apiFieldResourceTypes)[number]
export type JsonApiResourceType = (typeof jsonApiResourceTypes)[number]
export type ProfileName = (typeof profileNames)[number]
export type ResolverCode = (typeof resolverCodes)[number]
export type DatasetReleaseType = (typeof datasetReleaseTypes)[number]
export type DatasetReleaseFrequency = (typeof datasetReleaseFrequencies)[number]
export type DatasetTheme = (typeof datasetThemes)[number]
export type DatasetType = (typeof datasetTypes)[number]
export type DatasetCategory = (typeof datasetCategories)[number]
export type DatasetStatus = (typeof datasetStatuses)[number]
export type ReleaseStatus = (typeof releaseStatuses)[number]
export type IngestRunStatus = (typeof ingestRunStatuses)[number]
export type ApiVersionStatus = (typeof apiVersionStatuses)[number]
export type ApiReleaseSetStatus = (typeof apiReleaseSetStatuses)[number]
export type ApiReleaseSetMemberRole = (typeof apiReleaseSetMemberRoles)[number]
export type ApiEndpointMethod = (typeof apiEndpointMethods)[number]
export type ApiEndpointUsageType = (typeof apiEndpointUsageTypes)[number]
export type ProvenanceContributionType = (typeof provenanceContributionTypes)[number]
export type DataShardKind = (typeof dataShardKinds)[number]
export type DataShardEnvironment = (typeof dataShardEnvironments)[number]
export type DataShardStatus = (typeof dataShardStatuses)[number]
