import { selectApiInventory } from '@repo/core/db/apiInventory'
import { eq, metaSchema, or } from '@repo/db'
import {
  listApiReleaseSetSnapshots,
  resolveApiReleaseSetSnapshotsForRequest,
} from '@repo/core/db/metaRegistry'
import type { GeocodingDatabases, GeocodingRelease } from '../services/geocodingData'

export class DivisionChangesError extends Error {
  constructor(
    public status: 409 | 422 | 503,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/** Exact pins are independent of the current catalogue, including archived sets. */
export async function resolveDivisionChangesRelease(
  db: GeocodingDatabases['metaDb'],
  selector?: string,
  inventory?: string,
  apiVersion = 'api-divisions-v0.1',
): Promise<GeocodingRelease> {
  const {
    metaApiReleaseSets: sets,
    metaApiVersionReleaseSets: versionSets,
    metaApiVersions: versions,
  } = metaSchema
  const pin =
    selector ??
    (
      await resolveApiReleaseSetSnapshotsForRequest(db as never, 'division', {
        apiVersion,
        inventory,
        domainCode: 'geographic',
        regionCode: 'hk',
      })
    )?.releaseSet.id
  if (!pin)
    throw new DivisionChangesError(
      503,
      'release_set_unavailable',
      'No published geographic division release is available.',
    )
  const rows = await db
    .select({
      id: sets.id,
      code: sets.code,
      cohortKey: sets.cohortKey,
      domainCode: sets.domainCode,
      regionCode: sets.regionCode,
      schemaVersion: sets.schemaVersion,
      rulesetVersion: sets.rulesetVersion,
      status: sets.status,
      publishedAt: sets.publishedAt,
      apiVersion: versions.code,
    })
    .from(sets)
    .innerJoin(versions, eq(sets.apiVersionId, versions.id))
    .where(or(eq(sets.id, pin), eq(sets.code, pin)))
    .all()
  const published = rows.filter(
    row => row.status !== 'draft' && row.publishedAt !== null,
  )
  if (!published.length)
    throw new DivisionChangesError(
      503,
      'release_set_unavailable',
      `Release set ${pin} is not published or retained.`,
    )
  const selected = published.find(
    row =>
      row.apiVersion === apiVersion &&
      row.domainCode === 'geographic' &&
      row.regionCode === 'hk',
  )
  if (!selected)
    throw new DivisionChangesError(
      409,
      'incompatible_release_sets',
      `Only Hong Kong geographic division release sets using ${apiVersion} are supported.`,
    )
  const snapshots = await listApiReleaseSetSnapshots(db as never, selected.id)
  if (
    !snapshots.some(
      snapshot =>
        snapshot.snapshotResourceType === 'division' && snapshot.role === 'primary',
    )
  )
    throw new DivisionChangesError(
      503,
      'release_set_unavailable',
      `Release set ${pin} has no primary division snapshot.`,
    )
  return {
    ...selected,
    ...(inventory || apiVersion === 'api-divisions-v0.2'
      ? selectApiInventory(snapshots, 'division', inventory)
      : { snapshots }),
  }
}
