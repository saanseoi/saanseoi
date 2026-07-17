import type { ResourceType } from './types'

export const hkAreas = ['HK', 'KL', 'NT'] as const
export const hkDistricts = [
  'CW',
  'EST',
  'ILD',
  'KLC',
  'KC',
  'KT',
  'NTH',
  'SK',
  'ST',
  'SSP',
  'STH',
  'TP',
  'TW',
  'TM',
  'WC',
  'WTS',
  'YTM',
  'YL',
] as const

const RESOURCE_TYPE_CODE_SLUGS: Record<ResourceType, string> = {
  address: 'address',
  division: 'division',
  divisionArea: 'division-area',
  divisionBoundary: 'division-boundary',
  place: 'place',
  street: 'street',
}

function assertLowerKebabCodeSlug(value: string, label: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid ${label} code slug="${value}".`)
  }

  return value
}

export function resourceTypeCodeSlug(resourceType: ResourceType) {
  return RESOURCE_TYPE_CODE_SLUGS[resourceType]
}

export function publisherCodeForSource(source: string) {
  if (source === 'hkgov-pland-pu' || source === 'hkgov-pland-new-town') {
    return 'hkgov-pland'
  }

  return source
}

export function productCodeForSource(source: string, resourceType: ResourceType) {
  if (source === 'hkgov-had' && resourceType === 'divisionArea') return 'district'
  if (
    source === 'hkgov-pland-pu' &&
    (resourceType === 'division' || resourceType === 'divisionArea')
  ) {
    return 'pu'
  }
  if (
    source === 'hkgov-pland-new-town' &&
    (resourceType === 'division' || resourceType === 'divisionArea')
  ) {
    return 'new-town'
  }

  return null
}

export function buildDatasetCode(
  regionCode: string,
  source: string,
  resourceType: ResourceType,
) {
  const productCode = productCodeForSource(source, resourceType)
  const regionSlug = assertLowerKebabCodeSlug(regionCode, 'region')
  const publisherSlug = assertLowerKebabCodeSlug(
    publisherCodeForSource(source),
    'publisher',
  )

  return [
    'ds',
    regionSlug,
    publisherSlug,
    resourceTypeCodeSlug(resourceType),
    productCode,
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join('-')
}

export function buildDatasetReleaseCode(
  regionCode: string,
  source: string,
  sourceVersion: string,
  resourceType: ResourceType,
) {
  const productCode = productCodeForSource(source, resourceType)
  const regionSlug = assertLowerKebabCodeSlug(regionCode, 'region')
  const publisherSlug = assertLowerKebabCodeSlug(
    publisherCodeForSource(source),
    'publisher',
  )

  if (!/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(sourceVersion)) {
    throw new Error(`Invalid source version code segment="${sourceVersion}".`)
  }

  return [
    'dr',
    regionSlug,
    publisherSlug,
    resourceTypeCodeSlug(resourceType),
    productCode,
    sourceVersion,
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join('-')
}

export function datasetVariantForSource(resourceType: ResourceType, source?: string) {
  if (
    resourceType !== 'division' &&
    resourceType !== 'divisionArea' &&
    resourceType !== 'divisionBoundary'
  ) {
    return 'default'
  }

  return source ?? 'overture'
}

export function identityModeForSource(source: string) {
  return source === 'hkgov-pland-new-town' ? 'cohort_scoped' : 'persistent'
}
