import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metaAssets } from '@repo/db'
import type { LandsdStreetPageLocale } from './landsdStreet.ts'
import {
  buildManagedAssetUrl,
  buildSourceAssetObjectKey,
  type PreparedSourceAsset,
  type SourceAssetRole,
} from '../../../sourceAssets.ts'
import { withLocalMetaDb } from '../../../../dbCache/localDbCache.ts'
import type { UploadTarget } from '../../../../cli/options.ts'
import { hashBytes } from './landsdStreetIngestIo.ts'
import type {
  LandsdStreetAssetLink,
  PersistedPublishedSourceAssets,
} from './landsdStreetIngestTypes.ts'

export async function loadPersistedSourceAssets(outputDir: string) {
  const artefactDir = join(outputDir, 'artefacts')
  const entries = await readdir(artefactDir, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  })
  const assets = new Map<string, PreparedSourceAsset>()
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.manifest.json')) continue
    const manifestFilePath = join(artefactDir, entry.name)
    const manifestBytes = await readFile(manifestFilePath)
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
      artefact?: {
        byteLength?: unknown
        mediaType?: unknown
        objectKey?: unknown
        role?: unknown
        sha256?: unknown
      }
      downloadedAt?: unknown
      original?: { fileName?: unknown; url?: unknown }
      provenance?: { sourcePageLocale?: unknown; sourcePageUrl?: unknown }
      schemaVersion?: unknown
    }
    const artefact = manifest.artefact
    const original = manifest.original
    const fileStem = entry.name.slice(0, -'.manifest.json'.length)
    const contentHash = artefact?.sha256
    if (
      manifest.schemaVersion !== 1 ||
      typeof contentHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(contentHash) ||
      !fileStem.startsWith(`${contentHash}-`) ||
      typeof artefact?.role !== 'string' ||
      typeof artefact.mediaType !== 'string' ||
      typeof artefact.objectKey !== 'string' ||
      typeof artefact.byteLength !== 'number' ||
      typeof original?.fileName !== 'string' ||
      typeof original.url !== 'string' ||
      typeof manifest.downloadedAt !== 'string'
    ) {
      continue
    }
    const filePath = join(artefactDir, fileStem)
    if (!(await Bun.file(filePath).exists())) continue
    const fileName = fileStem.slice(contentHash.length + 1)
    const role = artefact.role as Exclude<SourceAssetRole, 'manifest'>
    const sourcePageLocale =
      manifest.provenance?.sourcePageLocale === 'en' ||
      manifest.provenance?.sourcePageLocale === 'zh-Hant'
        ? manifest.provenance.sourcePageLocale
        : undefined
    const sourcePageUrl =
      typeof manifest.provenance?.sourcePageUrl === 'string'
        ? manifest.provenance.sourcePageUrl
        : undefined
    const prepared: PreparedSourceAsset = {
      fileName,
      filePath,
      manifest: {
        schemaVersion: 1,
        artefact: {
          byteLength: artefact.byteLength,
          mediaType: artefact.mediaType,
          objectKey: artefact.objectKey,
          role,
          sha256: contentHash,
        },
        downloadedAt: manifest.downloadedAt,
        original: { fileName: original.fileName, url: original.url },
        provenance: {
          ...(sourcePageLocale ? { sourcePageLocale } : {}),
          ...(sourcePageUrl ? { sourcePageUrl } : {}),
        },
      },
      manifestFilePath,
      manifestObjectKey: buildSourceAssetObjectKey(
        hashBytes(manifestBytes),
        `manifest-for-${contentHash}-${fileName}.json`,
      ),
      objectKey: artefact.objectKey,
    }
    assets.set(
      sourceAssetCacheKey({
        role,
        sourcePageLocale,
        url: original.url,
      }),
      prepared,
    )
  }
  return assets
}

export async function loadPersistedPublishedSourceAssets(outputDir: string) {
  const path = join(outputDir, 'published-assets.json')
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map()
    throw error
  }
  if (
    !value ||
    typeof value !== 'object' ||
    (value as Partial<PersistedPublishedSourceAssets>).version !== 1 ||
    !(value as Partial<PersistedPublishedSourceAssets>).assets ||
    typeof (value as Partial<PersistedPublishedSourceAssets>).assets !== 'object'
  ) {
    throw new Error(`${path} is not a valid published source-asset cache.`)
  }
  return new Map(Object.entries((value as PersistedPublishedSourceAssets).assets))
}

export async function loadLocalSourceAssetIds(target: UploadTarget) {
  if (target.remote) return new Map<string, string>()
  const rows = await withLocalMetaDb(db =>
    db
      .select({ assetKey: metaAssets.assetKey, id: metaAssets.id })
      .from(metaAssets)
      .all(),
  )
  return new Map(rows.map(row => [row.assetKey, row.id]))
}

export async function buildRegisteredLocalSourceAssetLink(
  asset: PreparedSourceAsset,
  label: string | null | undefined,
  assetIds: ReadonlyMap<string, string>,
  target: UploadTarget,
) {
  if (target.remote) return null
  const assetId = assetIds.get(asset.objectKey)
  const manifestAssetId = assetIds.get(asset.manifestObjectKey)
  if (!assetId || !manifestAssetId) return null
  const role = asset.manifest.artefact.role
  if (role === 'manifest')
    throw new Error('A source artefact cannot have the manifest role.')
  return {
    assetId,
    assetUrl: buildManagedAssetUrl(target, assetId),
    byteLength: asset.manifest.artefact.byteLength,
    contentHash: asset.manifest.artefact.sha256,
    label: label ?? null,
    mediaType: asset.manifest.artefact.mediaType,
    originalUrl: asset.manifest.original.url,
    retrievedAt: asset.manifest.downloadedAt,
    role,
    objectKey: asset.objectKey,
    ...(asset.manifest.provenance.sourcePageLocale
      ? { sourcePageLocale: asset.manifest.provenance.sourcePageLocale }
      : {}),
    ...(asset.manifest.provenance.sourcePageUrl
      ? { sourcePageUrl: asset.manifest.provenance.sourcePageUrl }
      : {}),
    manifest: {
      assetId: manifestAssetId,
      assetUrl: buildManagedAssetUrl(target, manifestAssetId),
      contentHash: hashBytes(await readFile(asset.manifestFilePath)),
      objectKey: asset.manifestObjectKey,
    },
  } satisfies LandsdStreetAssetLink
}

export async function persistPublishedSourceAssetLink(
  outputDir: string,
  assets: Map<string, LandsdStreetAssetLink>,
  key: string,
  link: LandsdStreetAssetLink,
) {
  assets.set(key, link)
  await writePersistedPublishedSourceAssets(outputDir, assets)
}

export async function writePersistedPublishedSourceAssets(
  outputDir: string,
  assets: ReadonlyMap<string, LandsdStreetAssetLink>,
) {
  const path = join(outputDir, 'published-assets.json')
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`
  const value: PersistedPublishedSourceAssets = {
    assets: Object.fromEntries(assets),
    version: 1,
  }
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

export function sourceAssetCacheKey(input: {
  role: Exclude<SourceAssetRole, 'manifest'>
  url: string
  sourcePageLocale?: LandsdStreetPageLocale
}) {
  return [input.role, input.url, input.sourcePageLocale ?? ''].join('\0')
}
