export const jsonApiResourceTypes = [
  'addresses',
  'divisions',
  'division-areas',
  'division-boundaries',
  'streets',
  'places',
  'place-divisions',
  'street-addresses',
  'api-release-set-sources',
  'api-release-set-snapshots',
] as const

import { apiProfileNames } from '@repo/core'

export const profileNames = apiProfileNames

export const resolverCodes = [
  'direct_copy',
  'join_lookup',
  'lookup_fk',
  'derive_uuid_v5',
  'format_hkgov_als_address',
  'map_division_level',
  'map_division_type',
  'derive_variant_from_source',
  'derive_bbox_from_geometry',
  'prefer_hkgov_then_overture',
  'prefer_overture_then_hkgov',
  'merge_first_non_empty',
  'normalise_whitespace',
] as const

export const datasetReleaseTypes = ['snapshot', 'static'] as const
export const datasetReleaseFrequencies = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'half-yearly',
  'five-yearly',
  'yearly',
  'ad-hoc',
  'as-needed',
  'one-off',
  'census',
] as const
export const datasetThemes = [
  'addresses',
  'base',
  'divisions',
  'transport',
  'places',
  'streets',
  'stats',
] as const
export const datasetTypes = [
  'address',
  'division',
  'divisionArea',
  'divisionBoundary',
  'divisionStatistic',
  'place',
  'street',
] as const
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
  'uploading',
  'staged',
  'processing',
  'published',
  'superseded',
  'revoked',
  'failed',
] as const

export const ingestRunStatuses = ['queued', 'running', 'completed', 'error'] as const

export const apiVersionStatuses = ['draft', 'current', 'deprecated', 'retired'] as const

export const apiReleaseSetStatuses = ['draft', 'current', 'archived'] as const
export const apiFamilyTypes = [
  'addresses',
  'divisions',
  'places',
  'streets',
  'stats',
] as const
export const snapshotStatuses = ['draft', 'published', 'archived'] as const
export const apiReleaseSetSourceRoles = [
  'primary',
  'geometry',
  'enrichment',
  'fallback',
  'lookup',
] as const
export const historyVersionEntityTypes = [
  'division',
  'divisionArea',
  'divisionBoundary',
  'address2d',
  'address3d',
  'street',
  'place',
] as const
export const apiEndpointMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export const provenanceContributionTypes = [
  'primary',
  'fallback',
  'enrichment',
  'resolver-input',
  'merge-input',
] as const

export const dataShardTypes = ['meta', 'current', 'history', 'source'] as const
export const dataShardEnvironments = ['preview', 'production'] as const
export const dataShardStatuses = [
  'provisioning',
  'active',
  'readonly',
  'retired',
] as const

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
export type ApiFamilyType = (typeof apiFamilyTypes)[number]
export type SnapshotStatus = (typeof snapshotStatuses)[number]
export type ApiReleaseSetSourceRole = (typeof apiReleaseSetSourceRoles)[number]
export type HistoryVersionEntityType = (typeof historyVersionEntityTypes)[number]
export type ApiEndpointMethod = (typeof apiEndpointMethods)[number]
export type ProvenanceContributionType = (typeof provenanceContributionTypes)[number]
export type DataShardType = (typeof dataShardTypes)[number]
export type DataShardEnvironment = (typeof dataShardEnvironments)[number]
export type DataShardStatus = (typeof dataShardStatuses)[number]
