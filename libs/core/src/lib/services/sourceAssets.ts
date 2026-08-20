import { and, eq, isNull, metaAssets, metaReleases } from '@repo/db'
import type { MetaDatabase } from '@repo/db'

import type { HarbourReadableDb, HarbourWritableDb } from '../db/types'

export async function linkManagedSourceAssetToRelease(
  db: (HarbourReadableDb & HarbourWritableDb) | MetaDatabase,
  input: { assetKey: string; releaseId: string },
) {
  const repository = db as HarbourReadableDb & HarbourWritableDb
  const [asset, targetRelease] = await Promise.all([
    repository
      .select({ assetId: metaAssets.id, releaseId: metaAssets.releaseId })
      .from(metaAssets)
      .where(eq(metaAssets.assetKey, input.assetKey))
      .get(),
    repository
      .select({ sourceReleaseId: metaReleases.sourceReleaseId })
      .from(metaReleases)
      .where(eq(metaReleases.id, input.releaseId))
      .get(),
  ])

  if (!asset) throw new Error(`Source asset not found: ${input.assetKey}`)
  if (!targetRelease) throw new Error(`Release not found: ${input.releaseId}`)
  if (!targetRelease.sourceReleaseId) {
    throw new Error(`Release has no source-release lineage: ${input.releaseId}`)
  }

  if (asset.releaseId) {
    const linkedRelease = await getReleaseSourceLineage(repository, asset.releaseId)
    if (linkedRelease !== targetRelease.sourceReleaseId) {
      throw new Error(
        `Source asset ${input.assetKey} is already linked to a different source release.`,
      )
    }
    return { assetId: asset.assetId, status: 'existing' as const }
  }

  await repository
    .update(metaAssets)
    .set({ releaseId: input.releaseId })
    .where(and(eq(metaAssets.assetKey, input.assetKey), isNull(metaAssets.releaseId)))
    .run()

  const linkedAsset = await repository
    .select({ releaseId: metaAssets.releaseId })
    .from(metaAssets)
    .where(eq(metaAssets.assetKey, input.assetKey))
    .get()
  if (!linkedAsset?.releaseId) {
    throw new Error(`Source asset ${input.assetKey} could not be linked to a release.`)
  }

  const linkedSourceReleaseId = await getReleaseSourceLineage(
    repository,
    linkedAsset.releaseId,
  )
  if (linkedSourceReleaseId !== targetRelease.sourceReleaseId) {
    throw new Error(
      `Source asset ${input.assetKey} is already linked to a different source release.`,
    )
  }

  return {
    assetId: asset.assetId,
    status:
      linkedAsset.releaseId === input.releaseId
        ? ('linked' as const)
        : ('existing' as const),
  }
}

async function getReleaseSourceLineage(db: HarbourReadableDb, releaseId: string) {
  const release = await db
    .select({ sourceReleaseId: metaReleases.sourceReleaseId })
    .from(metaReleases)
    .where(eq(metaReleases.id, releaseId))
    .get()
  if (!release?.sourceReleaseId) {
    throw new Error(`Release has no source-release lineage: ${releaseId}`)
  }
  return release.sourceReleaseId
}
