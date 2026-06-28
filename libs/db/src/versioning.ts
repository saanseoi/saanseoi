import type { DatasetType } from './constants/schema'

export type ApiFamily = 'addresses' | 'divisions' | 'places' | 'streets'
export type SnapshotResourceType = Extract<
  DatasetType,
  'address' | 'division' | 'street' | 'place'
>

const API_FAMILY_BY_RESOURCE_TYPE: Record<SnapshotResourceType, ApiFamily> = {
  address: 'addresses',
  division: 'divisions',
  place: 'places',
  street: 'streets',
}

export function getApiFamilyForResourceType(resourceType: SnapshotResourceType) {
  return API_FAMILY_BY_RESOURCE_TYPE[resourceType]
}

export function buildApiVersionCode(
  resourceType: SnapshotResourceType,
  version: string,
) {
  return `api-${getApiFamilyForResourceType(resourceType)}-v${version}`
}

export function buildSchemaVersionCode(
  resourceType: SnapshotResourceType,
  version: string,
) {
  return `sv-${resourceType}-v${version}`
}

export function buildRulesetVersionCode(
  resourceType: SnapshotResourceType,
  strategy: string,
  version: string,
) {
  return `rs-${resourceType}-${strategy}-v${version}`
}

export function extractReleaseDateFromSourceVersion(sourceVersion: string) {
  const match = sourceVersion.trim().match(/^(20\d{2}-\d{2}-\d{2})/)

  if (!match) {
    throw new Error(
      `Could not derive release date from sourceVersion="${sourceVersion}". Expected YYYY-MM-DD.* format.`,
    )
  }

  return match[1]
}

export function buildSnapshotVersionCode(
  regionCode: string,
  resourceType: SnapshotResourceType,
  releaseDate: string,
  increment = 0,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    throw new Error(
      `Invalid releaseDate="${releaseDate}" for snapshot version code. Expected YYYY-MM-DD.`,
    )
  }

  return `ss-${regionCode}-${resourceType}-${releaseDate}.${increment}`
}
