import {
  and,
  eq,
  isNull,
  sql,
  metaAssets,
  metaResourceReleases,
  metaSourceReleases,
} from '@repo/db'
import type { MetaDatabase } from '@repo/db'

import type { HarbourReadableDb, HarbourWritableDb } from '../db/types'

type SourceAssetManifestLink = { role: string; sourceAssetId?: string }

/** Manifest bodies live in R2; META retains only their source-object relationship. */
export async function assertSourceAssetManifestLink(
  db: (HarbourReadableDb & HarbourWritableDb) | MetaDatabase,
  metadata: SourceAssetManifestLink,
) {
  if ('manifest' in metadata)
    throw new Error(
      'Upload the manifest as a separate managed asset with sourceAssetId.',
    )
  if (metadata.role !== 'manifest') {
    if (metadata.sourceAssetId)
      throw new Error('Only manifest assets may declare sourceAssetId.')
    return
  }
  if (!metadata.sourceAssetId) throw new Error('Manifest assets require sourceAssetId.')
  const repository = db as HarbourReadableDb & HarbourWritableDb
  const source = await repository
    .select({ role: metaAssets.role })
    .from(metaAssets)
    .where(eq(metaAssets.id, metadata.sourceAssetId))
    .get()
  if (!source || source.role === 'manifest')
    throw new Error('Manifest sourceAssetId must identify a registered source object.')
}

/** Replays may attach an unlinked sidecar, but never reassign one to another object. */
export async function linkSourceAssetManifest(
  db: (HarbourReadableDb & HarbourWritableDb) | MetaDatabase,
  assetId: string,
  metadata: SourceAssetManifestLink,
) {
  if (metadata.role !== 'manifest') return
  const repository = db as HarbourReadableDb & HarbourWritableDb
  await repository
    .update(metaAssets)
    .set({ sourceAssetId: metadata.sourceAssetId })
    .where(
      and(
        eq(metaAssets.id, assetId),
        eq(metaAssets.role, 'manifest'),
        isNull(metaAssets.sourceAssetId),
      ),
    )
    .run()
  const asset = await repository
    .select({ role: metaAssets.role, sourceAssetId: metaAssets.sourceAssetId })
    .from(metaAssets)
    .where(eq(metaAssets.id, assetId))
    .get()
  if (asset?.role !== 'manifest' || asset.sourceAssetId !== metadata.sourceAssetId)
    throw new Error('Manifest asset is already linked to a different source object.')
  await repository
    .update(metaAssets)
    .set({
      sourceReleaseId: sql`(SELECT source.sourceReleaseId FROM assets AS source WHERE source.id = ${metadata.sourceAssetId})`,
      resourceReleaseId: sql`(SELECT source.resourceReleaseId FROM assets AS source WHERE source.id = ${metadata.sourceAssetId})`,
      datasetId: sql`coalesce((SELECT source.datasetId FROM assets AS source WHERE source.id = ${metadata.sourceAssetId}), ${metaAssets.datasetId})`,
    })
    .where(eq(metaAssets.id, assetId))
    .run()
}

/** Resolve archive ownership at registration; acquisition can precede a release. */
export async function resolveManagedAssetOwnership(
  db: (HarbourReadableDb & HarbourWritableDb) | MetaDatabase,
  metadata: {
    role: string
    mediaType: string
    datasetId?: string
    sourceReleaseId?: string
    resourceReleaseId?: string
    sourceAssetId?: string
  },
) {
  const repository = db as HarbourReadableDb & HarbourWritableDb
  if (metadata.role === 'sourceArchive')
    throw new Error('Use releaseSourceArchive or resourceSourceArchive.')
  if (
    metadata.role === 'resourceSourceArchive' &&
    (metadata.mediaType !== 'application/vnd.apache.parquet' ||
      !metadata.resourceReleaseId ||
      metadata.sourceReleaseId)
  )
    throw new Error(
      'Resource source archives require Parquet and a resource release owner.',
    )
  if (metadata.role === 'manifest' && metadata.sourceAssetId) {
    const source = await repository
      .select({
        datasetId: metaAssets.datasetId,
        sourceReleaseId: metaAssets.sourceReleaseId,
        resourceReleaseId: metaAssets.resourceReleaseId,
      })
      .from(metaAssets)
      .where(eq(metaAssets.id, metadata.sourceAssetId))
      .get()
    if (!source)
      throw new Error(
        'Manifest sourceAssetId must identify a registered source object.',
      )
    return source
  }
  if (metadata.role === 'releaseSourceArchive' && metadata.resourceReleaseId) {
    const release = await repository
      .select({
        datasetId: metaResourceReleases.datasetId,
        sourceReleaseId: metaResourceReleases.sourceReleaseId,
      })
      .from(metaResourceReleases)
      .where(eq(metaResourceReleases.id, metadata.resourceReleaseId))
      .get()
    if (
      !release ||
      (metadata.sourceReleaseId && metadata.sourceReleaseId !== release.sourceReleaseId)
    )
      throw new Error('Source archive release ownership conflicts.')
    return { ...release, resourceReleaseId: null }
  }
  if (metadata.role === 'releaseSourceArchive' && metadata.sourceReleaseId) {
    const source = await repository
      .select({ datasetId: metaSourceReleases.datasetId })
      .from(metaSourceReleases)
      .where(eq(metaSourceReleases.id, metadata.sourceReleaseId))
      .get()
    if (!source || (metadata.datasetId && metadata.datasetId !== source.datasetId))
      throw new Error('Source archive dataset ownership conflicts.')
    return {
      datasetId: source.datasetId,
      sourceReleaseId: metadata.sourceReleaseId,
      resourceReleaseId: null,
    }
  }
  return {
    datasetId: metadata.datasetId ?? null,
    sourceReleaseId: metadata.sourceReleaseId ?? null,
    resourceReleaseId: metadata.resourceReleaseId ?? null,
  }
}

/** Link original archives to their source release, resource archives to their resource. */
export async function linkManagedSourceAssetToRelease(
  db: (HarbourReadableDb & HarbourWritableDb) | MetaDatabase,
  input: { assetKey: string; resourceReleaseId: string },
) {
  const repository = db as HarbourReadableDb & HarbourWritableDb
  const asset = await repository
    .select({
      id: metaAssets.id,
      role: metaAssets.role,
      sourceReleaseId: metaAssets.sourceReleaseId,
      resourceReleaseId: metaAssets.resourceReleaseId,
    })
    .from(metaAssets)
    .where(eq(metaAssets.assetKey, input.assetKey))
    .get()
  const target = await repository
    .select({
      datasetId: metaResourceReleases.datasetId,
      sourceReleaseId: metaResourceReleases.sourceReleaseId,
    })
    .from(metaResourceReleases)
    .where(eq(metaResourceReleases.id, input.resourceReleaseId))
    .get()
  if (!asset || !target) throw new Error('Archive asset or release not found.')
  if (!['releaseSourceArchive', 'resourceSourceArchive'].includes(asset.role))
    throw new Error('Only archive assets can be linked to a release.')
  const sourceOwned = asset.role === 'releaseSourceArchive'
  const ownerColumn = sourceOwned
    ? metaAssets.sourceReleaseId
    : metaAssets.resourceReleaseId
  const owner = sourceOwned ? target.sourceReleaseId : input.resourceReleaseId
  const existing = sourceOwned ? asset.sourceReleaseId : asset.resourceReleaseId
  if (existing && existing !== owner) {
    const previous = sourceOwned
      ? await repository
          .select({ status: metaSourceReleases.status })
          .from(metaSourceReleases)
          .where(eq(metaSourceReleases.id, existing))
          .get()
      : await repository
          .select({ status: metaResourceReleases.status })
          .from(metaResourceReleases)
          .where(eq(metaResourceReleases.id, existing))
          .get()
    if (previous?.status !== 'failed')
      throw new Error('Source asset is already linked to a different release.')
  }
  const result = await repository
    .update(metaAssets)
    .set({
      datasetId: target.datasetId,
      sourceReleaseId: sourceOwned ? owner : null,
      resourceReleaseId: sourceOwned ? null : owner,
    })
    .where(
      and(
        eq(metaAssets.id, asset.id),
        existing ? eq(ownerColumn, existing) : isNull(ownerColumn),
      ),
    )
    .run()
  const linked = await repository
    .select({
      id: metaAssets.id,
      role: metaAssets.role,
      sourceReleaseId: metaAssets.sourceReleaseId,
      resourceReleaseId: metaAssets.resourceReleaseId,
    })
    .from(metaAssets)
    .where(eq(metaAssets.id, asset.id))
    .get()
  if (
    !linked ||
    (sourceOwned ? linked.sourceReleaseId : linked.resourceReleaseId) !== owner
  )
    throw new Error('Concurrent archive ownership conflict.')
  await repository
    .update(metaAssets)
    .set({
      datasetId: target.datasetId,
      sourceReleaseId: linked.sourceReleaseId,
      resourceReleaseId: linked.resourceReleaseId,
    })
    .where(eq(metaAssets.sourceAssetId, asset.id))
    .run()
  const receipt = result as { changes?: number; meta?: { changes?: number } }
  return {
    assetId: asset.id,
    status:
      existing === owner || (receipt.changes ?? receipt.meta?.changes) === 0
        ? ('existing' as const)
        : ('linked' as const),
  }
}
