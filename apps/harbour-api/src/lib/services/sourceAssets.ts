import { and, eq, or, sql, metaAssets } from '@repo/db'

import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  resolveManagedAssetOwnership,
  assertSourceAssetManifestLink,
  linkSourceAssetManifest,
} from '@repo/core/sourceAssets'

export { linkManagedSourceAssetToRelease } from '@repo/core/sourceAssets'

import {
  hasVerifiedSourceObject,
  completeSourceAssetTransfer,
  cleanupSourceAssetTransfer,
  type SourceAssetPart,
  type SourceAssetStore,
} from '@repo/core/sourceAssetTransfer'

type AssetBucket = SourceAssetStore

export type SourceAssetMetadata = {
  assetKey: string
  contentHash: string
  datasetId?: string
  mediaType: string
  role: string
  retrievedAt: string
  sourceAssetId?: string
  originalUrl?: string
  resourceReleaseId?: string
  sourceReleaseId?: string
  sourcePageLocale?: string
  sourcePageUrl?: string
}

export async function preflightManagedSourceAsset(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: AssetBucket,
  input: { byteLength: number; metadata: SourceAssetMetadata },
) {
  assertMetadata(input.metadata)
  await resolveManagedAssetOwnership(db, input.metadata)
  await assertSourceAssetManifestLink(db, input.metadata)
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 0) {
    throw new Error('Source asset byteLength must be a non-negative integer.')
  }

  if (
    !(await hasVerifiedSourceObject(
      bucket,
      input.metadata.assetKey,
      input.metadata.contentHash,
      input.byteLength,
    ))
  )
    return { needsUpload: true as const }

  const assetId = await registerSourceAssetMetadata(
    db,
    input.metadata,
    input.byteLength,
  )
  return { assetId, needsUpload: false as const, status: 'existing' as const }
}

export async function registerManagedSourceAsset(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: AssetBucket,
  input: {
    fileName: string
    byteLength: number
    parts: SourceAssetPart[]
    metadata: SourceAssetMetadata
  },
) {
  assertMetadata(input.metadata)
  await resolveManagedAssetOwnership(db, input.metadata)
  await assertSourceAssetManifestLink(db, input.metadata)
  const status = await completeSourceAssetTransfer(bucket, {
    ...input.metadata,
    fileName: input.fileName,
    byteLength: input.byteLength,
    parts: input.parts,
  })
  const assetId = await registerSourceAssetMetadata(
    db,
    input.metadata,
    input.byteLength,
  )
  // A failed cleanup leaves resumable evidence; it must not hide a successful registration.
  await cleanupSourceAssetTransfer(bucket, input.metadata.assetKey, input.parts).catch(
    () => {},
  )
  return { assetId, status }
}

/**
 * Remove a managed object only while its metadata still proves the caller's
 * release ownership. R2 and D1 have no shared transaction, so the object is
 * deleted first; repeating this operation is safe after an interrupted run.
 */
export async function deleteManagedSourceAsset(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: AssetBucket,
  input: { assetId: string; resourceReleaseId: string },
) {
  const asset = await db
    .select({ assetKey: metaAssets.assetKey, id: metaAssets.id })
    .from(metaAssets)
    .where(
      and(
        eq(metaAssets.id, input.assetId),
        or(
          eq(metaAssets.resourceReleaseId, input.resourceReleaseId),
          sql`${metaAssets.sourceReleaseId} = (SELECT sourceReleaseId FROM resourceReleases WHERE id = ${input.resourceReleaseId})`,
        ),
      ),
    )
    .get()
  if (!asset)
    throw new Error('Managed source asset is not owned by the specified release.')
  await bucket.delete(asset.assetKey)
  await db.delete(metaAssets).where(eq(metaAssets.id, asset.id)).run()
  return { assetId: asset.id, status: 'deleted' as const }
}

async function registerSourceAssetMetadata(
  db: HarbourReadableDb & HarbourWritableDb,
  metadata: SourceAssetMetadata,
  byteLength: number,
) {
  const existingAsset = await db
    .select({ contentHash: metaAssets.contentHash, id: metaAssets.id })
    .from(metaAssets)
    .where(eq(metaAssets.assetKey, metadata.assetKey))
    .get()

  if (existingAsset) {
    if (existingAsset.contentHash !== metadata.contentHash) {
      throw new Error(
        `Registered source asset conflict for ${metadata.assetKey}; existing hash differs.`,
      )
    }
    await linkSourceAssetManifest(db, existingAsset.id, metadata)
    return existingAsset.id
  }

  const ownership = await resolveManagedAssetOwnership(db, metadata)
  const assetId = crypto.randomUUID()
  await db
    .insert(metaAssets)
    .values({
      assetKey: metadata.assetKey,
      byteLength,
      contentHash: metadata.contentHash,
      id: assetId,
      sourceAssetId: metadata.sourceAssetId ?? null,
      mediaType: metadata.mediaType,
      originalUrl: metadata.originalUrl ?? null,
      retrievedAt: metadata.retrievedAt,
      role: metadata.role,
      sourcePageLocale: metadata.sourcePageLocale ?? null,
      sourcePageUrl: metadata.sourcePageUrl ?? null,
      sourceRecordId: null,
      ...ownership,
    })
    .onConflictDoNothing()
    .run()

  const registeredAsset = await db
    .select({ contentHash: metaAssets.contentHash, id: metaAssets.id })
    .from(metaAssets)
    .where(eq(metaAssets.assetKey, metadata.assetKey))
    .get()
  if (!registeredAsset || registeredAsset.contentHash !== metadata.contentHash) {
    throw new Error(`Could not register source asset ${metadata.assetKey}.`)
  }

  await linkSourceAssetManifest(db, registeredAsset.id, metadata)
  return registeredAsset.id
}

export function parseSourceAssetMetadata(value: string) {
  if (typeof value !== 'string') {
    throw new Error('Source asset upload requires a JSON `metadata` field.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Source asset metadata must be valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Source asset metadata must be a JSON object.')
  }
  return parsed as SourceAssetMetadata
}

function assertMetadata(value: SourceAssetMetadata) {
  if (
    !/^by-source\/[a-z]{2}\/[a-z0-9-]+(?:\/[A-Za-z0-9._-]+)*\/[a-f0-9]{64}-[A-Za-z0-9._-]+$/.test(
      value.assetKey,
    )
  ) {
    throw new Error(`Invalid immutable source asset key: ${value.assetKey}`)
  }
  if (!/^[a-f0-9]{64}$/.test(value.contentHash)) {
    throw new Error('Source asset contentHash must be a lowercase SHA-256 digest.')
  }
  if (!value.assetKey.split('/').at(-1)?.startsWith(`${value.contentHash}-`))
    throw new Error('Source asset key must contain its declared SHA-256 digest.')
  if (typeof value.mediaType !== 'string' || !value.mediaType.trim())
    throw new Error('Source asset mediaType is required.')
  if (typeof value.role !== 'string' || !value.role.trim())
    throw new Error('Source asset role is required.')
  if (Number.isNaN(Date.parse(value.retrievedAt))) {
    throw new Error('Source asset retrievedAt must be an ISO timestamp.')
  }
}
