import { createHash } from 'node:crypto'

import type { SnapshotResourceType } from './constants/schema'

export type ApiFamily = 'addresses' | 'divisions' | 'places' | 'streets'

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

  const releaseDate = match[1]

  if (!releaseDate) {
    throw new Error(
      `Source version matched without a release date capture: "${sourceVersion}".`,
    )
  }

  return releaseDate
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(entry => stableStringify(entry)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'versionHash')
      .sort(([left], [right]) => left.localeCompare(right))

    return `{${entries
      .map(
        ([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`,
      )
      .join(',')}}`
  }

  return JSON.stringify(value)
}

export function computeVersionHash(value: unknown) {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`
}
