import { listSnapshotResourceReleases } from '@repo/core/db/metaRegistry'
import { eq, metaSchema, sql } from '@repo/db'
import type { AppEnv } from '../types'

/** Resolve primary and included evidence together; compact responses have no sources. */
export async function hydrateCanonicalSourceDocument(
  document: { data?: unknown; included?: unknown[]; meta?: Record<string, unknown> },
  databases: { metaDb: AppEnv['Variables']['metaDb'] },
) {
  const resources = [
    ...(Array.isArray(document.data) ? document.data : [document.data]),
    ...(document.included ?? []),
  ]
  const releases = new Set<string>()
  const native = resources.flatMap(resource => {
    const row = resource as {
      attributes?: {
        snapshotId?: string
        sources?: {
          hkgovCenstatd?: Array<Record<string, unknown>>
          hkgovPland?: Array<Record<string, unknown>>
        }
      }
    }
    const provider = row?.attributes?.sources?.hkgovPland
      ? 'hkgov-pland'
      : 'hkgov-censtatd'
    const references =
      row?.attributes?.sources?.hkgovPland ?? row?.attributes?.sources?.hkgovCenstatd
    return row?.attributes?.snapshotId &&
      Array.isArray(references) &&
      references.some(
        reference =>
          typeof reference.record_id === 'string' ||
          typeof reference.cell_id === 'string',
      )
      ? [{ snapshotId: row.attributes.snapshotId, references, provider }]
      : []
  })
  if (native.length) {
    const selections = await listSnapshotResourceReleases(databases.metaDb as never, [
      ...new Set(native.map(row => row.snapshotId)),
    ])
    for (const row of native) {
      const candidates = selections.filter(
        selection =>
          selection.snapshotId === row.snapshotId &&
          selection.datasetCode.includes(row.provider),
      )
      if (candidates.length !== 1)
        throw new Error(`Ambiguous native source specification for ${row.snapshotId}.`)
      for (const reference of row.references) {
        reference.resourceReleaseId = candidates[0]!.sourceReleaseId
        reference.dataset = candidates[0]!.datasetCode
      }
    }
  }
  for (const resource of resources) {
    const fields = (
      resource as {
        attributes?: { fieldSources?: Array<{ sourceReleaseId?: string }> }
      } | null
    )?.attributes?.fieldSources
    for (const field of fields ?? [])
      if (field.sourceReleaseId) releases.add(field.sourceReleaseId)
    const sources = (resource as { attributes?: { sources?: unknown } } | null)
      ?.attributes?.sources
    if (!sources || typeof sources !== 'object') continue
    for (const references of Object.values(sources)) {
      if (!Array.isArray(references)) continue
      for (const reference of references)
        if (reference && typeof reference.resourceReleaseId === 'string')
          releases.add(reference.resourceReleaseId)
    }
  }
  if (releases.size) {
    const release = metaSchema.metaResourceReleaseDetails
    const dataset = metaSchema.metaDatasets
    const sourceRelease = metaSchema.metaSourceReleases
    const specifications = await databases.metaDb
      .select({
        id: release.id,
        resourceReleaseCode: release.code,
        datasetCode: dataset.code,
        sourceReleaseId: release.sourceReleaseId,
        sourceReleaseCode: sourceRelease.code,
        sourceVersion: release.sourceVersion,
        cohortKey: release.cohortKey,
        sourceSchemaVersion: release.sourceSchemaVersion,
        // Archive names are not retained on resource releases.
        originalFileName: sql<string | null>`NULL`,
      })
      .from(release)
      .innerJoin(dataset, eq(release.datasetId, dataset.id))
      .innerJoin(sourceRelease, eq(release.sourceReleaseId, sourceRelease.id))
      .where(
        sql`${release.id} IN (SELECT value FROM json_each(${JSON.stringify([...releases])}))`,
      )
      .all()
    if (specifications.length !== releases.size)
      throw new Error('Selected source specification is missing.')
    document.meta = {
      ...document.meta,
      sourceSpecifications: Object.fromEntries(
        specifications.map(({ id, ...specification }) => [id, specification]),
      ),
    }
  }
}

export function requiresCanonicalSourceExpansion(path: string, profile?: string) {
  return profile === 'full' || /\/addresses\/v0(?:\.1)?\/[^/]+\/units\/?$/.test(path)
}
