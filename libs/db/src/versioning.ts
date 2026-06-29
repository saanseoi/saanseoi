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

export function normalizeCohortKey(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error('cohortKey must not be empty.')
  }

  if (!/^[a-z0-9._-]+$/i.test(trimmed)) {
    throw new Error(
      `Invalid cohortKey="${value}". Use letters, numbers, ".", "_" or "-".`,
    )
  }

  return trimmed
}

export function extractReleaseDateFromSourceVersion(sourceVersion: string) {
  const match = sourceVersion.trim().match(/^(20\d{2}-\d{2}-\d{2})/)

  if (!match) {
    throw new Error(
      `Could not derive release date from sourceVersion="${sourceVersion}". Expected 21st-century YYYY-MM-DD.* format (20xx-...).`,
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
  cohortKey: string,
) {
  return `ss-${regionCode}-${resourceType}-${normalizeCohortKey(cohortKey)}`
}

export function buildDataReleaseSetCode(
  regionCode: string,
  apiFamily: ApiFamily,
  cohortKey: string,
  sequence = 0,
) {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error(`Invalid release-set sequence="${sequence}". Expected 0 or more.`)
  }

  return `data-${regionCode}-${apiFamily}-${normalizeCohortKey(cohortKey)}-${sequence}`
}

function isPlainJsonObject(value: object) {
  const prototype = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(entry => stableStringify(entry)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    if (!isPlainJsonObject(value)) {
      const constructorName =
        (value as { constructor?: { name?: string } }).constructor?.name ?? 'object'

      throw new Error(
        `computeVersionHash only accepts plain JSON objects. Received ${constructorName}.`,
      )
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'versionHash')
      .sort(([left], [right]) => left.localeCompare(right))

    return `{${entries
      .map(
        ([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`,
      )
      .join(',')}}`
  }

  const serialized = JSON.stringify(value)

  if (serialized === undefined) {
    throw new Error(
      `computeVersionHash only accepts JSON-serializable values. Received ${String(value)}.`,
    )
  }

  return serialized
}

export function computeVersionHash(value: unknown) {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`
}
