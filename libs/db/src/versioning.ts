import { createHash } from 'node:crypto'

import type { ResourceType } from '@repo/core'

export type ApiFamily = 'addresses' | 'divisions' | 'places' | 'streets' | 'stats'

function normaliseCodeSlug(value: string) {
  const normalised = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[:_\s]+/g, '-')
    .toLowerCase()

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalised)) {
    throw new Error(`Invalid code slug="${value}".`)
  }

  return normalised
}

const API_FAMILY_BY_RESOURCE_TYPE: Record<ResourceType, ApiFamily> = {
  address: 'addresses',
  division: 'divisions',
  divisionArea: 'divisions',
  divisionBoundary: 'divisions',
  divisionStatistic: 'stats',
  place: 'places',
  street: 'streets',
}

export function getApiFamilyForResourceType(resourceType: ResourceType) {
  return API_FAMILY_BY_RESOURCE_TYPE[resourceType]
}

export function buildApiVersionCode(resourceType: ResourceType, version: string) {
  return `api-${getApiFamilyForResourceType(resourceType)}-v${version}`
}

export function buildSchemaVersionCode(resourceType: ResourceType, version: string) {
  return `sv-${normaliseCodeSlug(resourceType)}-v${version}`
}

export function buildRulesetVersionCode(
  resourceType: ResourceType,
  strategy: string,
  version: string,
) {
  return `rs-${normaliseCodeSlug(resourceType)}-${normaliseCodeSlug(strategy)}-v${version}`
}

export function normaliseCohortKey(value: string) {
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
  resourceType: ResourceType,
  cohortKey: string,
  variant = 'default',
  revision = 0,
) {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(`Invalid snapshot revision="${revision}". Expected 0 or more.`)
  }

  const normalisedVariant = normaliseCodeSlug(variant)
  const variantSegment =
    normalisedVariant === 'default' || normalisedVariant === 'overture'
      ? ''
      : `-${normalisedVariant}`
  const revisionSegment = revision === 0 ? '' : `-r${revision}`

  return `ss-${normaliseCodeSlug(regionCode)}-${normaliseCodeSlug(resourceType)}${variantSegment}-${normaliseCohortKey(cohortKey)}${revisionSegment}`
}

export function buildSnapshotLineageCode(
  datasetCode: string,
  resourceType: ResourceType,
  variant = 'default',
) {
  // A source dataset can expose structured subvariants (for example C&SD
  // census cohorts). Keep ordinary source variants concise because their
  // dataset code already contains that scope. Some source datasets intentionally
  // expose more than one resource type, so qualify a resource type that is not
  // already represented by the dataset code.
  const normalisedDatasetCode = normaliseCodeSlug(datasetCode)
  const normalisedResourceType = normaliseCodeSlug(resourceType)
  const resourceTypeIsInDatasetCode =
    normalisedDatasetCode.endsWith(`-${normalisedResourceType}`) ||
    normalisedDatasetCode.includes(`-${normalisedResourceType}-`)
  const resourceTypeSegment = resourceTypeIsInDatasetCode
    ? ''
    : `-${normalisedResourceType}`
  const variantSegment = variant.includes(':') ? `-${normaliseCodeSlug(variant)}` : ''
  return `sl-${normalisedDatasetCode}${resourceTypeSegment}${variantSegment}`
}

export function buildDataReleaseSetCode(
  regionCode: string,
  apiFamily: ApiFamily,
  cohortKey: string,
  revision = 0,
) {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(`Invalid release-set revision="${revision}". Expected 0 or more.`)
  }

  const revisionSegment = revision === 0 ? '' : `-r${revision}`

  return `data-${regionCode}-${apiFamily}-${normaliseCohortKey(cohortKey)}${revisionSegment}`
}

export function buildApiCatalogRevisionCode(
  regionCode: string,
  apiFamily: ApiFamily,
  apiVersion: string,
  publicationDate: string,
  revision = 0,
) {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(`Invalid catalogue revision="${revision}". Expected 0 or more.`)
  }

  const normalisedDate = publicationDate.trim()
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(normalisedDate)) {
    throw new Error(
      `Invalid catalogue publicationDate="${publicationDate}". Expected YYYY-MM-DD.`,
    )
  }

  return `catalog-${regionCode}-${apiFamily}-v${normaliseCohortKey(apiVersion)}-${normalisedDate}.${revision}`
}

export function cohortKeyEffectiveFrom(cohortKey: string) {
  const normalised = normaliseCohortKey(cohortKey)
  const date = normalised.match(/^(20\d{2}-\d{2}-\d{2})/)?.[1]
  if (date) return `${date}T00:00:00.000Z`

  const month = normalised.match(/^(20\d{2}-\d{2})(?:$|[._-])/)?.[1]
  if (month) return `${month}-01T00:00:00.000Z`

  const year = normalised.match(/^(20\d{2})(?:$|[._-])/)?.[1]
  if (year) return `${year}-01-01T00:00:00.000Z`

  return null
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

  const serialised = JSON.stringify(value)

  if (serialised === undefined) {
    throw new Error(
      `computeVersionHash only accepts JSON-serialisable values. Received ${String(value)}.`,
    )
  }

  return serialised
}

export function computeVersionHash(value: unknown) {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`
}

export function buildDeterministicUuidV5(namespace: string, name: string) {
  const namespaceBytes = parseUuidBytes(namespace)
  const nameBytes = new TextEncoder().encode(name.trim())
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length)

  input.set(namespaceBytes)
  input.set(nameBytes, namespaceBytes.length)

  const hash = createHash('sha1').update(input).digest()
  const bytes = Uint8Array.from(hash.subarray(0, 16))

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  return formatUuidBytes(bytes)
}

function parseUuidBytes(value: string) {
  const hex = value.replaceAll('-', '')

  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error(`Invalid UUID namespace: ${value}`)
  }

  return Uint8Array.from(
    Array.from({ length: 16 }, (_, index) =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    ),
  )
}

function formatUuidBytes(bytes: Uint8Array) {
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}
