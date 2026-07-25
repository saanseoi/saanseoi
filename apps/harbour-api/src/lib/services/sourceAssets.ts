import { eq, metaAssets } from '@repo/db'

import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'

const SOURCE_ASSET_PREFIX = 'by-source/'

type AssetBucket = Pick<R2Bucket, 'head' | 'put'>

export type SourceAssetMetadata = {
  assetKey: string
  contentHash: string
  mediaType: string
  role: string
  retrievedAt: string
  manifest?: unknown
  originalUrl?: string
  sourcePageLocale?: string
  sourcePageUrl?: string
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

  const existingAsset = await db
    .select({ contentHash: metaAssets.contentHash, id: metaAssets.id })
    .from(metaAssets)
    .where(eq(metaAssets.assetKey, metadata.assetKey))
    .get()

  if (existingAsset) {
    if (existingAsset.contentHash !== contentHash) {
      throw new Error(
        `Registered source asset conflict for ${metadata.assetKey}; existing hash differs.`,
      )
    }
    return { assetId: existingAsset.id, status: 'existing' as const }
  }

  const assetId = crypto.randomUUID()
  await db
    .insert(metaAssets)
    .values({
      assetKey: metadata.assetKey,
      byteLength: body.byteLength,
      contentHash,
      id: assetId,
      manifest: metadata.manifest ?? null,
      mediaType: metadata.mediaType,
      originalUrl: metadata.originalUrl ?? null,
      retrievedAt: metadata.retrievedAt,
      role: metadata.role,
      sourcePageLocale: metadata.sourcePageLocale ?? null,
      sourcePageUrl: metadata.sourcePageUrl ?? null,
      sourceRecordId: null,
      datasetId: null,
      releaseId: null,
    })
    .onConflictDoNothing()
    .run()

  const registeredAsset = await db
    .select({ contentHash: metaAssets.contentHash, id: metaAssets.id })
    .from(metaAssets)
    .where(eq(metaAssets.assetKey, metadata.assetKey))
    .get()
  if (!registeredAsset || registeredAsset.contentHash !== contentHash) {
    throw new Error(`Could not register source asset ${metadata.assetKey}.`)
  }

  return {
    assetId: registeredAsset.id,
    status:
      registeredAsset.id === assetId ? ('uploaded' as const) : ('existing' as const),
  }
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
