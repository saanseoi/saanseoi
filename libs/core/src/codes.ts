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

export type HkDistrictCode = (typeof hkDistricts)[number]

const RESOURCE_TYPE_CODE_SLUGS: Record<ResourceType, string> = {
  address: 'address',
  division: 'division',
  divisionArea: 'division-area',
  divisionBoundary: 'division-boundary',
  divisionStatistic: 'division-statistic',
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
  if (source.startsWith('hkgov-censtatd-')) {
    return 'hkgov-censtatd'
  }
  return source
}

export function productCodeForSource(source: string, resourceType: ResourceType) {
  if (source === 'hkgov-had' && resourceType === 'divisionArea') return 'district'
  if (source === 'hkgov-censtatd' && resourceType === 'divisionArea') {
    return 'district'
  }
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
  const datasetResourceType =
    (source === 'hkgov-pland-pu' || source === 'hkgov-pland-new-town') &&
    resourceType === 'divisionArea'
      ? 'division'
      : resourceType
  const regionSlug = assertLowerKebabCodeSlug(regionCode, 'region')
  const publisherSlug = assertLowerKebabCodeSlug(
    publisherCodeForSource(source),
    'publisher',
  )

  return [
    'ds',
    regionSlug,
    publisherSlug,
    resourceTypeCodeSlug(datasetResourceType),
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

/**
 * Checks the portable release-code form produced by `buildDatasetReleaseCode`.
 * Source-version segments may use dots, underscores, or hyphens between their
 * alphanumeric components.
 */
export function isDatasetReleaseCode(value: string) {
  return /^dr-[a-z0-9]+(?:-[a-z0-9]+)*(?:-[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*)$/.test(
    value,
  )
}

export function datasetVariantForSource(
  resourceType: ResourceType,
  source?: string,
  options: {
    cohortKey?: string
    datasetCode?: string
    sourceVariant?: string
    sourceVersion?: string
    transform?: string
  } = {},
) {
  if (resourceType === 'divisionStatistic') {
    return options.datasetCode ?? 'default'
  }

  if (
    resourceType !== 'division' &&
    resourceType !== 'divisionArea' &&
    resourceType !== 'divisionBoundary'
  ) {
    return 'default'
  }

  const withTransform = (variant: string) =>
    options.transform ? `${variant}:${options.transform}` : variant

  const isCenstatdProductVariant =
    source === 'hkgov-censtatd' && options.sourceVariant?.startsWith('hkgov-censtatd-')
  if (
    options.sourceVariant &&
    options.sourceVariant !== 'default' &&
    (source !== 'hkgov-censtatd' || isCenstatdProductVariant)
  ) {
    return withTransform(options.sourceVariant)
  }

  if (source === 'hkgov-censtatd') {
    return withTransform('hkgov-censtatd')
  }

  // The Planning Department owns both planning datasets under one publisher
  // code. Preserve the dataset's product segment when a registry record is
  // read back through that publisher, so its API-composition domain remains
  // distinguishable.
  if (source === 'hkgov-pland') {
    if (
      /^ds-[a-z0-9-]+-hkgov-pland-division(?:-area)?-pu$/.test(
        options.datasetCode ?? '',
      )
    ) {
      return withTransform('hkgov-pland-pu')
    }
    if (
      /^ds-[a-z0-9-]+-hkgov-pland-division(?:-area)?-new-town$/.test(
        options.datasetCode ?? '',
      )
    ) {
      return withTransform('hkgov-pland-new-town')
    }
  }

  return withTransform(source ?? 'overture')
}

export function identityModeForSource(source: string) {
  return source === 'hkgov-pland-new-town' ? 'cohort_scoped' : 'persistent'
}
