import { and, eq, metaAssets } from '@repo/db'

import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'

export { linkManagedSourceAssetToRelease } from '@repo/core/sourceAssets'

const SOURCE_ASSET_PREFIX = 'by-source/'

type AssetBucket = Pick<R2Bucket, 'delete' | 'head' | 'put'>

export type SourceAssetMetadata = {
  assetKey: string
  contentHash: string
  datasetId?: string
  mediaType: string
  role: string
  retrievedAt: string
  manifest?: unknown
  originalUrl?: string
  releaseId?: string
  sourcePageLocale?: string
  sourcePageUrl?: string
}

export async function preflightManagedSourceAsset(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: AssetBucket,
  input: { byteLength: number; metadata: SourceAssetMetadata },
) {
  assertMetadata(input.metadata)
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 0) {
    throw new Error('Source asset byteLength must be a non-negative integer.')
  }

  const existingObject = await bucket.head(input.metadata.assetKey)
  if (!existingObject) return { needsUpload: true as const }
  if (
    existingObject.size !== input.byteLength ||
    existingObject.customMetadata?.sha256 !== input.metadata.contentHash
  ) {
    throw new Error(
      `Immutable source asset conflict for ${input.metadata.assetKey}; existing bytes differ.`,
    )
  }

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
  file: File,
  metadata: SourceAssetMetadata,
) {
  assertMetadata(metadata)
  const body = await file.arrayBuffer()
  const contentHash = await sha256Hex(body)
  if (contentHash !== metadata.contentHash) {
    throw new Error('Source asset SHA-256 does not match the declared content hash.')
  }
  if (!isContentAddressedSourceAssetKey(metadata.assetKey, contentHash)) {
    throw new Error(
      'Source asset key must be immutable and begin with its SHA-256 digest.',
    )
  }

  const existingObject = await bucket.head(metadata.assetKey)
  if (existingObject) {
    if (
      existingObject.size !== body.byteLength ||
      existingObject.customMetadata?.sha256 !== contentHash
    ) {
      throw new Error(
        `Immutable source asset conflict for ${metadata.assetKey}; existing bytes differ.`,
      )
    }
  } else {
    await bucket.put(metadata.assetKey, body, {
      customMetadata: {
        role: metadata.role,
        sha256: contentHash,
      },
      httpMetadata: {
        contentDisposition: `attachment; filename="${contentDispositionFileName(file.name)}"`,
        contentType: metadata.mediaType,
      },
      sha256: contentHash,
    })
  }

  const assetId = await registerSourceAssetMetadata(db, metadata, body.byteLength)
  return {
    assetId,
    status: existingObject ? ('existing' as const) : ('uploaded' as const),
  }
}

/**
 * Remove a managed object only while its metadata still proves the caller's
 * release ownership. R2 and D1 have no shared transaction, so the object is
 * deleted first; repeating this operation is safe after an interrupted run.
 */
export async function deleteManagedSourceAsset(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: AssetBucket,
  input: { assetId: string; releaseId: string },
) {
  const asset = await db
    .select({ assetKey: metaAssets.assetKey, id: metaAssets.id })
    .from(metaAssets)
    .where(
      and(eq(metaAssets.id, input.assetId), eq(metaAssets.releaseId, input.releaseId)),
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
    return existingAsset.id
  }

  const assetId = crypto.randomUUID()
  await db
    .insert(metaAssets)
    .values({
      assetKey: metadata.assetKey,
      byteLength,
      contentHash: metadata.contentHash,
      id: assetId,
      manifest: metadata.manifest ?? null,
      mediaType: metadata.mediaType,
      originalUrl: metadata.originalUrl ?? null,
      retrievedAt: metadata.retrievedAt,
      role: metadata.role,
      sourcePageLocale: metadata.sourcePageLocale ?? null,
      sourcePageUrl: metadata.sourcePageUrl ?? null,
      sourceRecordId: null,
      datasetId: metadata.datasetId ?? null,
      releaseId: metadata.releaseId ?? null,
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

  return registeredAsset.id
}

export function parseSourceAssetMetadata(value: string | File | null) {
  if (typeof value !== 'string') {
    throw new Error('Source asset upload requires a JSON `metadata` form field.')
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
  if (!value.mediaType.trim()) throw new Error('Source asset mediaType is required.')
  if (!value.role.trim()) throw new Error('Source asset role is required.')
  if (Number.isNaN(Date.parse(value.retrievedAt))) {
    throw new Error('Source asset retrievedAt must be an ISO timestamp.')
  }
}

function isContentAddressedSourceAssetKey(assetKey: string, contentHash: string) {
  return (
    assetKey.startsWith(SOURCE_ASSET_PREFIX) &&
    assetKey.split('/').at(-1)?.startsWith(`${contentHash}-`) === true
  )
}

function contentDispositionFileName(value: string) {
  const fileName = value.replaceAll(/[\\"\r\n]/g, '_').trim()
  return fileName || 'source.bin'
}

async function sha256Hex(value: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', value))
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
