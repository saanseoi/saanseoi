import { existsSync } from 'node:fs'
import { Database } from 'bun:sqlite'
import { resolveShardBindingName } from './localDbCacheTargets'

const sourceOnlyResources = [
  {
    dataset: 'ds-hk-protomaps-island',
    type: 'divisionArea',
    table: 'protomapsIslandFeatures',
  },
  { dataset: 'ds-hk-hkgov-rvd-division', type: 'division', table: 'hkgovRvdAreas' },
] as const

/** Source-only inputs finish at ingestion, without a canonical delivery receipt. */
export function sourceOnlyCompletion(
  meta: Database,
  files: Record<string, string>,
  release: { id: string; code: string; resourceType: string },
): boolean | null {
  const contract = sourceOnlyResources.find(
    value =>
      release.resourceType === value.type &&
      release.code.startsWith(`${value.dataset.replace(/^ds-/, 'dr-')}-`),
  )
  if (!contract) return null
  const evidence = meta
    .query(`
    SELECT r.sourceVersion FROM resourceReleaseDetails r
    JOIN datasets d ON d.id = r.datasetId
    WHERE r.id = ? AND d.code = ?
      AND EXISTS (SELECT 1 FROM processingAudits a
        WHERE a.resourceReleaseId = r.id AND a.ownerId = r.id
          AND a.stage = 'ingestion' AND a.attemptStatus = 'completed')
      AND EXISTS (SELECT 1 FROM assets a
        WHERE a.sourceReleaseId = r.sourceReleaseId AND a.role = 'releaseSourceArchive'
          AND a.byteLength > 0 AND a.contentHash <> '')
      AND EXISTS (SELECT 1 FROM assets a
        WHERE a.resourceReleaseId = r.id AND a.role = 'resourceSourceArchive'
          AND a.byteLength > 0 AND a.contentHash <> '')
  `)
    .get(release.id, contract.dataset) as { sourceVersion: string } | null
  if (!evidence) return false
  const path = files[resolveShardBindingName('source', 'HK', evidence.sourceVersion)]
  if (!path || !existsSync(path)) return false
  const source = new Database(path, { readonly: true })
  try {
    // Unchanged assertions can originate in an earlier release. Their validity
    // interval, rather than the first-seen release ID, proves retained membership.
    return Boolean(
      source
        .query(`SELECT 1 FROM "${contract.table}"
      WHERE validFromRelease <= ? AND (validToRelease IS NULL OR validToRelease > ?)
      LIMIT 1`)
        .get(evidence.sourceVersion, evidence.sourceVersion),
    )
  } finally {
    source.close()
  }
}
