/** File exports are release-pinned, finite-lived derivatives, never source archives. */
export type ExportSelection = {
  apiReleaseSetId: string
  apiVersion: string
  family: 'divisions' | 'streets' | 'addresses' | 'places' | 'stats'
  domain: string
  region: string
  snapshots: Array<{ resourceType: string; snapshotId: string; variant: string }>
}
export type ExportHooks = {
  prepare(selection: ExportSelection): Promise<void>
  published(selection: ExportSelection): Promise<void>
}
export type ExportFile = {
  key: string
  format: 'json' | 'ndjson'
  envelope: 'array' | 'records'
  mediaType: string
  recordCount: number
  byteLength: number
  sha256: string
}
export type ExportProjection = {
  status: 'ready' | 'not_implemented'
  recordCount?: number
  files: ExportFile[]
}
export type ExportManifest = {
  schemaVersion: 1
  apiReleaseSetId: string
  apiVersion: string
  family: 'divisions' | 'streets' | 'addresses' | 'places' | 'stats'
  domain: string
  variant: 'saanseoi'
  region: string
  snapshots: ExportSelection['snapshots']
  locales: readonly ['en', 'zh-Hant', 'zh-Hans']
  divisionCodeRegistryHash?: string
  crs: 'OGC:CRS84'
  bboxSemantics: 'canonical-saanseoi-area'
  projections: Record<string, ExportProjection>
}

/** Select only supported canonical families; a new SaanSeoi snapshot enables Divisions exports. */
export function supportsExports(selection: ExportSelection): boolean {
  return (
    (selection.family === 'divisions' &&
      selection.domain === 'geographic' &&
      selection.snapshots.some(
        row => row.resourceType === 'division' && row.variant === 'saanseoi',
      )) ||
    (selection.family === 'streets' && selection.domain === 'physical')
  )
}

/** Namespace every object under the exact release; never mix with source assets. */
export function exportPrefix(
  selection: Pick<
    ExportSelection,
    'family' | 'apiVersion' | 'domain' | 'region' | 'apiReleaseSetId'
  >,
): string {
  return `exports/v1/${selection.family}/${selection.apiVersion}/${selection.region}/${selection.domain}/saanseoi/${selection.apiReleaseSetId}/`
}
