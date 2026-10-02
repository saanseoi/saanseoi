import { and, eq, isNull, metaAssets, metaResourceReleases } from '@repo/db'
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
}

export async function linkManagedSourceAssetToRelease(
  db: (HarbourReadableDb & HarbourWritableDb) | MetaDatabase,
  input: { assetKey: string; resourceReleaseId: string },
) {
  const repository = db as HarbourReadableDb & HarbourWritableDb
  const [asset, targetRelease] = await Promise.all([
    repository
      .select({
        assetId: metaAssets.id,
        resourceReleaseId: metaAssets.resourceReleaseId,
      })
      .from(metaAssets)
      .where(eq(metaAssets.assetKey, input.assetKey))
      .get(),
    repository
      .select({ sourceReleaseId: metaResourceReleases.sourceReleaseId })
      .from(metaResourceReleases)
      .where(eq(metaResourceReleases.id, input.resourceReleaseId))
      .get(),
  ])

  if (!asset) throw new Error(`Source asset not found: ${input.assetKey}`)
  if (!targetRelease) throw new Error(`Release not found: ${input.resourceReleaseId}`)
  if (!targetRelease.sourceReleaseId) {
    throw new Error(`Release has no source-release lineage: ${input.resourceReleaseId}`)
  }

  if (asset.resourceReleaseId) {
    const linkedRelease = await getReleaseSourceLineage(
      repository,
      asset.resourceReleaseId,
    )
    if (linkedRelease.sourceReleaseId !== targetRelease.sourceReleaseId) {
      if (linkedRelease.status === 'failed') {
        await repository
          .update(metaAssets)
          .set({ resourceReleaseId: input.resourceReleaseId })
          .where(
            and(
              eq(metaAssets.assetKey, input.assetKey),
              eq(metaAssets.resourceReleaseId, asset.resourceReleaseId),
            ),
          )
          .run()
        return { assetId: asset.assetId, status: 'linked' as const }
      }
      throw new Error(
        `Source asset ${input.assetKey} is already linked to a different source release.`,
      )
    }
    return { assetId: asset.assetId, status: 'existing' as const }
  }

  await repository
    .update(metaAssets)
    .set({ resourceReleaseId: input.resourceReleaseId })
    .where(
      and(
        eq(metaAssets.assetKey, input.assetKey),
        isNull(metaAssets.resourceReleaseId),
      ),
    )
    .run()

  const linkedAsset = await repository
    .select({ resourceReleaseId: metaAssets.resourceReleaseId })
    .from(metaAssets)
    .where(eq(metaAssets.assetKey, input.assetKey))
    .get()
  if (!linkedAsset?.resourceReleaseId) {
    throw new Error(`Source asset ${input.assetKey} could not be linked to a release.`)
  }

  const linkedSourceReleaseId = await getReleaseSourceLineage(
    repository,
    linkedAsset.resourceReleaseId,
  )
  if (linkedSourceReleaseId.sourceReleaseId !== targetRelease.sourceReleaseId) {
    throw new Error(
      `Source asset ${input.assetKey} is already linked to a different source release.`,
    )
  }

  return {
    assetId: asset.assetId,
    status:
      linkedAsset.resourceReleaseId === input.resourceReleaseId
        ? ('linked' as const)
        : ('existing' as const),
  }
}

async function getReleaseSourceLineage(
  db: HarbourReadableDb,
  resourceReleaseId: string,
) {
  const release = await db
    .select({
      sourceReleaseId: metaResourceReleases.sourceReleaseId,
      status: metaResourceReleases.status,
    })
    .from(metaResourceReleases)
    .where(eq(metaResourceReleases.id, resourceReleaseId))
    .get()
  if (!release?.sourceReleaseId) {
    throw new Error(`Release has no source-release lineage: ${resourceReleaseId}`)
  }
  return release
}
