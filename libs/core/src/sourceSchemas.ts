const SOURCE_SCHEMA_RELEASES = [
  { source: 'overture', schema: '1.11.0', version: '2025-07-23.0' },
  { source: 'overture', schema: '1.11.0', version: '2025-08-20.0' },
  { source: 'overture', schema: '1.12.0', version: '2025-09-24.0' },
  { source: 'overture', schema: '1.13.0', version: '2025-10-22.0' },
  { source: 'overture', schema: '1.14.0', version: '2025-11-19.0' },
  { source: 'overture', schema: '1.15.0', version: '2025-12-17.0' },
  { source: 'overture', schema: '1.15.0', version: '2026-01-21.0' },
  { source: 'overture', schema: '1.16.0', version: '2026-02-18.0' },
  { source: 'overture', schema: '1.16.0', version: '2026-03-18.0' },
  { source: 'overture', schema: '1.16.0', version: '2026-04-15.0' },
  { source: 'overture', schema: '1.17.0', version: '2026-05-20.0' },
  { source: 'overture', schema: '1.17.0', version: '2026-06-17.0' },
  { source: 'overture', schema: '1.18.0', version: '2026-07-22.0' },
  { source: 'hkgov-had', schema: '1.2', version: '2022' },
  { source: 'hkgov-censtatd', schema: '1.0', version: '2016' },
  { source: 'hkgov-censtatd', schema: '1.0', version: '2021' },
  { source: 'hkgov-censtatd', schema: '1.0', version: '2022' },
  { source: 'hkgov-censtatd', schema: '1.0', version: '2024' },
  { source: 'hkgov-pland-pu', schema: '1.0', version: '2001' },
  { source: 'hkgov-pland-pu', schema: '1.0', version: '2006' },
  { source: 'hkgov-pland-pu', schema: '1.0', version: '2011' },
  { source: 'hkgov-pland-pu', schema: '1.0', version: '2016' },
  { source: 'hkgov-pland-pu', schema: '2.0', version: '2021' },
  { source: 'hkgov-pland-new-town', schema: '1.0', version: '2006' },
  { source: 'hkgov-pland-new-town', schema: '1.0', version: '2011' },
  { source: 'hkgov-pland-new-town', schema: '1.0', version: '2016' },
  { source: 'hkgov-pland-new-town', schema: '1.0', version: '2021' },
] as const

const OVERTURE_SOURCE_SCHEMA_RELEASES = SOURCE_SCHEMA_RELEASES.filter(
  release => release.source === 'overture',
).map(({ schema, version }) => ({ schema, version }))

const SOURCE_SCHEMA_DEFAULTS: Record<string, string> = {
  'hkgov-dpo': '3.2',
  // GEO_PLACE_NAME has an observed stable point-gazetteer shape. New release
  // dates are publisher revisions, not schema revisions.
  'hkgov-landsd': '1.0',
}

type ResolveSourceSchemaVersionArgs = {
  source: string
  sourceVersion: string
  storedSourceSchemaVersion?: string | null
  allowOlderMappedRelease?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function compareReleaseVersions(left: string, right: string) {
  if (left === right) return 0

  const [leftDate = left, leftPatch = '0'] = left.split('.')
  const [rightDate = right, rightPatch = '0'] = right.split('.')
  const dateComparison = leftDate.localeCompare(rightDate)

  if (dateComparison !== 0) {
    return dateComparison
  }

  return Number.parseInt(leftPatch, 10) - Number.parseInt(rightPatch, 10)
}

async function resolveOvertureSourceSchemaVersionFromCatalog(sourceVersion: string) {
  if (typeof fetch !== 'function') {
    return null
  }

  const timeoutMs = 5_000
  const timeoutSignal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : null
  const timeoutController =
    timeoutSignal === null && typeof AbortController === 'function'
      ? new AbortController()
      : null
  const timeoutId =
    timeoutController !== null
      ? setTimeout(() => timeoutController.abort(), timeoutMs)
      : null

  try {
    const response = await fetch(
      `https://stac.overturemaps.org/${sourceVersion}/catalog.json`,
      { signal: timeoutSignal ?? timeoutController?.signal },
    )

    if (!response.ok) {
      return null
    }

    const catalog = (await response.json()) as unknown
    const catalogRecord = isRecord(catalog) ? catalog : null
    const properties = catalogRecord?.properties
    const schemaVersion =
      typeof catalogRecord?.['schema:version'] === 'string'
        ? catalogRecord['schema:version']
        : isRecord(properties) && typeof properties['schema:version'] === 'string'
          ? properties['schema:version']
          : null

    return schemaVersion?.trim() || null
  } catch {
    return null
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

export function getLatestKnownSafeOvertureRelease() {
  return OVERTURE_SOURCE_SCHEMA_RELEASES.at(-1) ?? null
}

export function isKnownSafeSourceRelease(args: {
  source: string
  sourceVersion: string
}) {
  if (args.source !== 'overture') {
    return true
  }

  return OVERTURE_SOURCE_SCHEMA_RELEASES.some(
    release => compareReleaseVersions(release.version, args.sourceVersion) === 0,
  )
}

export async function assertKnownSafeSourceRelease(args: {
  source: string
  sourceVersion: string
}) {
  if (isKnownSafeSourceRelease(args)) {
    return
  }

  if (args.source !== 'overture') {
    return
  }

  const latestKnownSafeRelease = getLatestKnownSafeOvertureRelease()

  const resolvedSourceSchemaVersion =
    await resolveOvertureSourceSchemaVersionFromCatalog(args.sourceVersion)

  throw new Error(
    [
      `Overture sourceVersion ${args.sourceVersion} is not marked as a known safe release.`,
      latestKnownSafeRelease
        ? `Latest known safe release: ${latestKnownSafeRelease.version} (schema ${latestKnownSafeRelease.schema}).`
        : 'No known safe Overture releases are configured.',
      resolvedSourceSchemaVersion
        ? `Catalogue reports source schema version ${resolvedSourceSchemaVersion}.`
        : 'Harbour could not confirm the source schema version from the Overture catalogue.',
      'Add the release to the known-safe mapping and accepted upload schema windows before uploading it.',
    ].join(' '),
  )
}

export async function resolveSourceSchemaVersion(args: ResolveSourceSchemaVersionArgs) {
  if (args.storedSourceSchemaVersion?.trim()) {
    return args.storedSourceSchemaVersion.trim()
  }

  const defaultSchemaVersion = SOURCE_SCHEMA_DEFAULTS[args.source]
  if (defaultSchemaVersion) {
    return defaultSchemaVersion
  }

  const exactMatch = SOURCE_SCHEMA_RELEASES.find(
    release =>
      release.source === args.source &&
      compareReleaseVersions(release.version, args.sourceVersion) === 0,
  )

  if (exactMatch) {
    return exactMatch.schema
  }

  if (args.source !== 'overture') {
    throw new Error(
      `No ${args.source} source schema mapping found for sourceVersion=${args.sourceVersion}.`,
    )
  }

  const catalogSchemaVersion = await resolveOvertureSourceSchemaVersionFromCatalog(
    args.sourceVersion,
  )

  if (catalogSchemaVersion) {
    return catalogSchemaVersion
  }

  if (args.allowOlderMappedRelease) {
    const candidates = OVERTURE_SOURCE_SCHEMA_RELEASES.filter(
      release => compareReleaseVersions(release.version, args.sourceVersion) <= 0,
    )
    const match = candidates.at(-1)

    if (match) {
      return match.schema
    }
  }

  throw new Error(
    `No ${args.source} source schema mapping found for sourceVersion=${args.sourceVersion}.`,
  )
}
