import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'

import { zipSync } from 'fflate'

import { resolveAtlasBaseUrl } from '@repo/core'
import { linkManagedSourceAssetToRelease as linkManagedSourceAssetToReleaseInDb } from '@repo/core/sourceAssets'
import { runWithWriteRetry } from '@repo/core/pipeline/utils'
import { eq, metaAssets } from '@repo/db'
import type { MetaDatabase } from '@repo/db'

import { getAuthHeaders, resolveHarbourApiUrl } from '../api/api.ts'
import { withLocalMetaDb } from '../dbCache/localDbCache.ts'
import type { UploadTarget } from '../cli/options.ts'

export const LANDSD_SOURCE_ASSET_PREFIX = 'by-source/hk/hkgov-landsd/street-naming'

export type SourceAssetRole =
  | 'gazettePlan'
  | 'gazettePlanPreview'
  | 'governmentNotice'
  | 'historicalGovernmentNotice'
  | 'manifest'
  | 'sourceArchive'
  | 'sourcePage'
  | 'sourcePdf'

export type SourceAssetManifest = {
  schemaVersion: 1
  artefact: {
    byteLength: number
    mediaType: string
    objectKey: string
    role: SourceAssetRole
    sha256: string
  }
  downloadedAt: string
  original: {
    fileName: string
    url: string
  }
  provenance: {
    sourcePageLocale?: 'en' | 'zh-Hant'
    sourcePageUrl?: string
  }
}

export type PreparedSourceAsset = {
  fileName: string
  filePath: string
  manifest: SourceAssetManifest
  manifestFilePath: string
  manifestObjectKey: string
  objectKey: string
}

export type UploadedSourceAsset = {
  assetId: string
  url: string
}

export type ManagedSourceAssetUpload = {
  fileName: string
  filePath: string
  metadata: {
    assetKey: string
    contentHash: string
    datasetId?: string
    manifest?: unknown
    mediaType: string
    originalUrl?: string
    releaseId?: string
    retrievedAt: string
    role: SourceAssetRole
    sourcePageLocale?: 'en' | 'zh-Hant'
    sourcePageUrl?: string
  }
}

export type SourceReleaseAssetInput = {
  datasetCode: string
  datasetId: string
  filePath: string
  fileName?: string
  mediaType?: string
  publisherCode: string
  releaseCode: string
  releaseId: string
  sourceVersion: string
}

type LocalSourceAssetObjectUpload = (input: {
  fileName: string
  filePath: string
  mediaType: string
  objectKey: string
}) => Promise<void>

type LocalSourceAssetUploadOptions = {
  putObject?: LocalSourceAssetObjectUpload
  withMetaDb?: typeof withLocalMetaDb
}

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const HARBOUR_WRANGLER_CONFIG_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-api/wrangler.jsonc',
)
const LOCAL_R2_BUCKET_NAME = 'ss-assets-preview'
const LOCAL_R2_PERSIST_DIR = resolve(REPO_ROOT, '.local/d1/dev')
const WRANGLER_CONFIG_HOME = resolve(REPO_ROOT, '.local/wrangler')
const WRANGLER_LOG_PATH = resolve(WRANGLER_CONFIG_HOME, 'logs')

// Miniflare persists both the local R2 bucket and D1 metadata in SQLite. Asset
// registration is therefore serialised within one CLI process to avoid lock
// contention while an immutable object and its metadata are committed.
let localSourceAssetRegistration = Promise.resolve()

export async function downloadAndPrepareSourceAsset(input: {
  downloadedAt: string
  fileName?: string
  mediaType?: string
  outputDir: string
  role: Exclude<SourceAssetRole, 'manifest'>
  sourcePageLocale?: 'en' | 'zh-Hant'
  sourcePageUrl?: string
  url: string
}) {
  const response = await fetch(input.url)
  if (!response.ok) {
    throw new Error(
      `Source asset download failed with HTTP ${response.status}: ${input.url}`,
    )
  }
  const mediaType =
    input.mediaType ??
    response.headers.get('content-type') ??
    'application/octet-stream'
  const fileName = input.fileName ?? fileNameFromUrl(input.url, mediaType)
  return prepareSourceAsset({
    bytes: new Uint8Array(await response.arrayBuffer()),
    downloadedAt: input.downloadedAt,
    fileName,
    mediaType,
    outputDir: input.outputDir,
    role: input.role,
    sourcePageLocale: input.sourcePageLocale,
    sourcePageUrl: input.sourcePageUrl,
    url: input.url,
  })
}

export async function prepareSourceAsset(input: {
  bytes: Uint8Array
  downloadedAt: string
  fileName: string
  mediaType: string
  outputDir: string
  role: Exclude<SourceAssetRole, 'manifest'>
  sourcePageLocale?: 'en' | 'zh-Hant'
  sourcePageUrl?: string
  url: string
}): Promise<PreparedSourceAsset> {
  const sha256 = hash(input.bytes)
  const fileName = safeFileName(input.fileName)
  const objectKey = buildSourceAssetObjectKey(sha256, fileName)
  const filePath = join(resolve(input.outputDir), `${sha256}-${fileName}`)
  const manifest: SourceAssetManifest = {
    schemaVersion: 1,
    artefact: {
      byteLength: input.bytes.byteLength,
      mediaType: input.mediaType,
      objectKey,
      role: input.role,
      sha256,
    },
    downloadedAt: input.downloadedAt,
    original: { fileName: input.fileName, url: input.url },
    provenance: {
      ...(input.sourcePageLocale ? { sourcePageLocale: input.sourcePageLocale } : {}),
      ...(input.sourcePageUrl ? { sourcePageUrl: input.sourcePageUrl } : {}),
    },
  }
  const manifestBytes = new TextEncoder().encode(
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  const manifestObjectKey = buildSourceAssetObjectKey(
    hash(manifestBytes),
    `manifest-for-${sha256}-${fileName}.json`,
  )
  const manifestFilePath = `${filePath}.manifest.json`

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, input.bytes)
  await writeFile(manifestFilePath, manifestBytes)
  return {
    fileName,
    filePath,
    manifest,
    manifestFilePath,
    manifestObjectKey,
    objectKey,
  }
}

export async function uploadPreparedSourceAsset(
  target: UploadTarget,
  asset: PreparedSourceAsset,
) {
  const [source, manifest] = await Promise.all([
    uploadManagedSourceAsset(target, {
      fileName: asset.fileName,
      filePath: asset.filePath,
      metadata: {
        assetKey: asset.objectKey,
        contentHash: asset.manifest.artefact.sha256,
        manifest: { manifestObjectKey: asset.manifestObjectKey, ...asset.manifest },
        mediaType: asset.manifest.artefact.mediaType,
        originalUrl: asset.manifest.original.url,
        retrievedAt: asset.manifest.downloadedAt,
        role: asset.manifest.artefact.role,
        sourcePageLocale: asset.manifest.provenance.sourcePageLocale,
        sourcePageUrl: asset.manifest.provenance.sourcePageUrl,
      },
    }),
    uploadManagedSourceAsset(target, {
      fileName: basename(asset.manifestFilePath),
      filePath: asset.manifestFilePath,
      metadata: {
        assetKey: asset.manifestObjectKey,
        contentHash: hash(await readFile(asset.manifestFilePath)),
        mediaType: 'application/json; charset=utf-8',
        originalUrl: asset.manifest.original.url,
        retrievedAt: asset.manifest.downloadedAt,
        role: 'manifest',
        sourcePageLocale: asset.manifest.provenance.sourcePageLocale,
        sourcePageUrl: asset.manifest.provenance.sourcePageUrl,
      },
    }),
  ])

  return { manifest, source }
}

export function buildSourceAssetObjectKey(sha256: string, fileName: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Expected a SHA-256 digest.')
  return `${LANDSD_SOURCE_ASSET_PREFIX}/${sha256}-${safeFileName(fileName)}`
}

export function buildSourceReleaseAssetFileName(input: {
  datasetCode: string
  fileName?: string
  sourceVersion: string
}) {
  return input.fileName
    ? safeFileName(input.fileName)
    : safeFileName(`${input.datasetCode}-${input.sourceVersion}.parquet`)
}

export function buildSourceReleaseAssetObjectKey(input: {
  datasetCode: string
  publisherCode: string
  releaseCode: string
  sha256: string
  fileName: string
}) {
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
    throw new Error('Expected a SHA-256 digest.')
  }
  for (const value of [input.publisherCode, input.datasetCode, input.releaseCode]) {
    if (!/^[A-Za-z0-9._-]+$/.test(value)) {
      throw new Error(`Invalid source asset path component: ${value}`)
    }
  }
  return [
    'by-source',
    'hk',
    input.publisherCode,
    input.datasetCode,
    input.releaseCode,
    `${input.sha256}-${safeFileName(input.fileName)}`,
  ].join('/')
}

/**
 * Retains publisher evidence as an immutable source Parquet or ZIP. Overture
 * supplies Parquet directly; loose GML and GeoJSON are losslessly packaged.
 */
export async function uploadSourceReleaseAsset(
  target: UploadTarget,
  input: SourceReleaseAssetInput,
  options: {
    now?: () => Date
    upload?: typeof uploadManagedSourceAsset
  } = {},
) {
  const retained = await prepareSourceReleaseAsset(input)
  try {
    const contentHash = hash(retained.bytes)
    const assetKey = buildSourceReleaseAssetObjectKey({
      datasetCode: input.datasetCode,
      fileName: retained.fileName,
      publisherCode: input.publisherCode,
      releaseCode: input.releaseCode,
      sha256: contentHash,
    })
    const retrievedAt = (options.now ?? (() => new Date()))().toISOString()
    const upload = options.upload ?? uploadManagedSourceAsset

    return await upload(target, {
      fileName: retained.fileName,
      filePath: retained.filePath,
      metadata: {
        assetKey,
        contentHash,
        datasetId: input.datasetId,
        manifest: {
          schemaVersion: 1,
          artefact: {
            byteLength: retained.bytes.byteLength,
            mediaType: retained.mediaType,
            objectKey: assetKey,
            role: 'sourceArchive',
            sha256: contentHash,
          },
          dataset: { code: input.datasetCode },
          ...(retained.original ? { original: retained.original } : {}),
          ...(retained.packaging ? { packaging: retained.packaging } : {}),
          provenance: {
            releaseCode: input.releaseCode,
            sourceVersion: input.sourceVersion,
          },
        },
        mediaType: retained.mediaType,
        releaseId: input.releaseId,
        retrievedAt,
        role: 'sourceArchive',
      },
    })
  } finally {
    await retained.cleanup()
  }
}

export function assertRetainableSourceReleaseInput(fileName: string) {
  if (shouldWrapSourceReleaseAsset(fileName)) return
  retainedSourceMediaType(fileName)
}

type RetainedSourceReleaseAsset = {
  bytes: Uint8Array
  cleanup: () => Promise<void>
  fileName: string
  filePath: string
  mediaType: 'application/vnd.apache.parquet' | 'application/zip'
  original?: {
    byteLength: number
    fileName: string
    mediaType: string
    sha256: string
  }
  packaging?: 'saanseoi-lossless-zip'
}

/**
 * Retain publisher evidence only as source Parquet or ZIP. GML and GeoJSON
 * uploads still feed their local preparers directly, but their retained copy
 * is a lossless ZIP with the original bytes and identity in its manifest.
 */
async function prepareSourceReleaseAsset(
  input: SourceReleaseAssetInput,
): Promise<RetainedSourceReleaseAsset> {
  const originalFileName = buildSourceReleaseAssetFileName(input)
  assertRetainableSourceReleaseInput(originalFileName)
  const originalBytes = await readFile(input.filePath)
  const originalMediaType =
    input.mediaType ?? mediaTypeForSourceReleaseFile(originalFileName)

  if (!shouldWrapSourceReleaseAsset(originalFileName)) {
    return {
      bytes: originalBytes,
      cleanup: async () => {},
      fileName: originalFileName,
      filePath: input.filePath,
      mediaType: retainedSourceMediaType(originalFileName),
    }
  }

  const archiveBytes = zipSync({ [safeFileName(originalFileName)]: originalBytes })
  const tempDir = await mkdtemp(join(tmpdir(), 'saanseoi-source-release-'))
  const fileName = `${originalFileName}.zip`
  const filePath = join(tempDir, fileName)
  await writeFile(filePath, archiveBytes)

  return {
    bytes: archiveBytes,
    cleanup: async () => rm(tempDir, { force: true, recursive: true }),
    fileName,
    filePath,
    mediaType: 'application/zip',
    original: {
      byteLength: originalBytes.byteLength,
      fileName: originalFileName,
      mediaType: originalMediaType,
      sha256: hash(originalBytes),
    },
    packaging: 'saanseoi-lossless-zip',
  }
}

function shouldWrapSourceReleaseAsset(fileName: string) {
  const extension = extname(fileName).toLowerCase()
  return extension === '.geojson' || extension === '.gml'
}

function retainedSourceMediaType(
  fileName: string,
): 'application/vnd.apache.parquet' | 'application/zip' {
  switch (extname(fileName).toLowerCase()) {
    case '.parquet':
      return 'application/vnd.apache.parquet'
    case '.zip':
      return 'application/zip'
    default:
      throw new Error(
        `R2 source retention accepts ZIP or Parquet; compress ${safeFileName(fileName)} as ZIP before upload.`,
      )
  }
}

function mediaTypeForSourceReleaseFile(fileName: string) {
  const extension = fileName.toLowerCase().split('.').at(-1)
  switch (extension) {
    case 'csv':
      return 'text/csv; charset=utf-8'
    case 'geojson':
    case 'json':
      return 'application/geo+json'
    case 'gml':
      return 'application/gml+xml'
    case 'parquet':
      return 'application/vnd.apache.parquet'
    case 'zip':
      return 'application/zip'
    default:
      return 'application/octet-stream'
  }
}

export function buildManagedAssetUrl(target: UploadTarget, assetId: string) {
  return `${resolveAtlasBaseUrl(target.environment)}/v0/assets/${assetId}`
}

export async function uploadManagedSourceAsset(
  target: UploadTarget,
  input: ManagedSourceAssetUpload,
  localOptions: LocalSourceAssetUploadOptions = {},
): Promise<UploadedSourceAsset> {
  if (!target.remote) {
    return uploadLocalManagedSourceAsset(target, input, localOptions)
  }
  const fileStat = await stat(input.filePath)
  const preflightResponse = await fetch(
    `${resolveHarbourApiUrl(target)}/v1/assets/preflight`,
    {
      body: JSON.stringify({
        byteLength: fileStat.size,
        metadata: input.metadata,
      }),
      headers: { 'content-type': 'application/json', ...getAuthHeaders() },
      method: 'POST',
    },
  )
  const preflight = (await preflightResponse.json().catch(() => null)) as {
    assetId?: unknown
    assetUrl?: unknown
    needsUpload?: unknown
  } | null
  if (!preflightResponse.ok) {
    const message =
      preflight &&
      typeof preflight === 'object' &&
      typeof (preflight as { message?: unknown }).message === 'string'
        ? (preflight as { message: string }).message
        : `Harbour source asset preflight failed with HTTP ${preflightResponse.status}.`
    throw new Error(message)
  }
  if (preflight?.needsUpload === false && typeof preflight.assetId === 'string') {
    return {
      assetId: preflight.assetId,
      url: buildManagedAssetUrl(target, preflight.assetId),
    }
  }
  const form = new FormData()
  form.set(
    'asset',
    new File([await readFile(input.filePath)], input.fileName, {
      type: input.metadata.mediaType,
    }),
  )
  form.set('metadata', JSON.stringify(input.metadata))
  const response = await fetch(`${resolveHarbourApiUrl(target)}/v1/assets`, {
    body: form,
    headers: getAuthHeaders(),
    method: 'POST',
  })
  const payload = (await response.json().catch(() => null)) as unknown
  if (!response.ok || !isUploadedSourceAsset(payload)) {
    const message =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `Harbour source asset upload failed with HTTP ${response.status}.`
    throw new Error(message)
  }
  return { assetId: payload.assetId, url: payload.assetUrl }
}

export async function linkManagedSourceAssetToRelease(
  target: UploadTarget,
  input: { assetKey: string; releaseId: string },
  localOptions: Pick<LocalSourceAssetUploadOptions, 'withMetaDb'> = {},
) {
  if (target.remote) {
    const response = await fetch(
      `${resolveHarbourApiUrl(target)}/v1/assets/link-release`,
      {
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json', ...getAuthHeaders() },
        method: 'POST',
      },
    )
    const payload = (await response.json().catch(() => null)) as unknown
    if (!response.ok || !isLinkedSourceAsset(payload)) {
      const message =
        payload &&
        typeof payload === 'object' &&
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : `Harbour source asset linkage failed with HTTP ${response.status}.`
      throw new Error(message)
    }
    return payload
  }

  const withMetaDb = localOptions.withMetaDb ?? withLocalMetaDb
  return queueLocalSourceAssetRegistration(() =>
    runWithWriteRetry(() =>
      withMetaDb(async metaDb => {
        return linkManagedSourceAssetToReleaseInDb(metaDb, input)
      }),
    ),
  )
}

async function uploadLocalManagedSourceAsset(
  target: UploadTarget,
  input: ManagedSourceAssetUpload,
  options: LocalSourceAssetUploadOptions,
): Promise<UploadedSourceAsset> {
  const withMetaDb = options.withMetaDb ?? withLocalMetaDb
  const assetId = await queueLocalSourceAssetRegistration(() =>
    runWithWriteRetry(() =>
      withMetaDb(metaDb =>
        registerLocalManagedSourceAsset(metaDb, input, {
          putObject: options.putObject ?? putLocalSourceAssetObject,
        }),
      ),
    ),
  )

  return { assetId, url: buildManagedAssetUrl(target, assetId) }
}

async function queueLocalSourceAssetRegistration<T>(work: () => Promise<T>) {
  const previous = localSourceAssetRegistration
  let release: (() => void) | undefined
  localSourceAssetRegistration = new Promise<void>(resolve => {
    release = resolve
  })

  await previous
  try {
    return await work()
  } finally {
    release?.()
  }
}

export async function registerLocalManagedSourceAsset(
  metaDb: MetaDatabase,
  input: ManagedSourceAssetUpload,
  options: { putObject: LocalSourceAssetObjectUpload },
) {
  assertSourceAssetMetadata(input.metadata)
  const bytes = await readFile(input.filePath)
  const contentHash = hash(bytes)
  if (contentHash !== input.metadata.contentHash) {
    throw new Error('Source asset SHA-256 does not match the declared content hash.')
  }
  if (!isContentAddressedSourceAssetKey(input.metadata.assetKey, contentHash)) {
    throw new Error(
      'Source asset key must be immutable and begin with its SHA-256 digest.',
    )
  }

  const existing = await findRegisteredSourceAsset(metaDb, input.metadata.assetKey)
  if (existing) {
    if (existing.contentHash !== contentHash) {
      throw new Error(
        `Registered source asset conflict for ${input.metadata.assetKey}; existing hash differs.`,
      )
    }
    return existing.id
  }

  await options.putObject({
    fileName: input.fileName,
    filePath: input.filePath,
    mediaType: input.metadata.mediaType,
    objectKey: input.metadata.assetKey,
  })

  const assetId = crypto.randomUUID()
  await metaDb
    .insert(metaAssets)
    .values({
      assetKey: input.metadata.assetKey,
      byteLength: bytes.byteLength,
      contentHash,
      id: assetId,
      manifest: input.metadata.manifest ?? null,
      mediaType: input.metadata.mediaType,
      originalUrl: input.metadata.originalUrl ?? null,
      retrievedAt: input.metadata.retrievedAt,
      role: input.metadata.role,
      sourcePageLocale: input.metadata.sourcePageLocale ?? null,
      sourcePageUrl: input.metadata.sourcePageUrl ?? null,
      sourceRecordId: null,
      datasetId: input.metadata.datasetId ?? null,
      releaseId: input.metadata.releaseId ?? null,
    })
    .onConflictDoNothing()
    .run()

  const registered = await findRegisteredSourceAsset(metaDb, input.metadata.assetKey)
  if (!registered || registered.contentHash !== contentHash) {
    throw new Error(`Could not register source asset ${input.metadata.assetKey}.`)
  }
  return registered.id
}

async function findRegisteredSourceAsset(metaDb: MetaDatabase, assetKey: string) {
  return metaDb
    .select({ contentHash: metaAssets.contentHash, id: metaAssets.id })
    .from(metaAssets)
    .where(eq(metaAssets.assetKey, assetKey))
    .get()
}

async function putLocalSourceAssetObject(input: {
  fileName: string
  filePath: string
  mediaType: string
  objectKey: string
}) {
  await mkdir(LOCAL_R2_PERSIST_DIR, { recursive: true })
  await mkdir(WRANGLER_CONFIG_HOME, { recursive: true })
  await mkdir(WRANGLER_LOG_PATH, { recursive: true })

  const command = [
    'bun',
    'x',
    'wrangler',
    'r2',
    'object',
    'put',
    `${LOCAL_R2_BUCKET_NAME}/${input.objectKey}`,
    '--file',
    input.filePath,
    '--content-type',
    input.mediaType,
    '--content-disposition',
    `attachment; filename="${contentDispositionFileName(input.fileName)}"`,
    '--local',
    '--persist-to',
    LOCAL_R2_PERSIST_DIR,
    '--config',
    HARBOUR_WRANGLER_CONFIG_PATH,
  ]
  const child = Bun.spawn(command, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? WRANGLER_LOG_PATH,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? WRANGLER_CONFIG_HOME,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0) {
    throw new Error((stderr || stdout || 'Local R2 source asset upload failed.').trim())
  }
}

function isUploadedSourceAsset(value: unknown): value is {
  assetId: string
  assetUrl: string
  status: 'existing' | 'uploaded'
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { assetId?: unknown }).assetId === 'string' &&
    typeof (value as { assetUrl?: unknown }).assetUrl === 'string'
  )
}

function isLinkedSourceAsset(value: unknown): value is {
  assetId: string
  status: 'existing' | 'linked'
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { assetId?: unknown }).assetId === 'string' &&
    ((value as { status?: unknown }).status === 'existing' ||
      (value as { status?: unknown }).status === 'linked')
  )
}

function assertSourceAssetMetadata(value: ManagedSourceAssetUpload['metadata']) {
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
    assetKey.startsWith('by-source/') &&
    assetKey.split('/').at(-1)?.startsWith(`${contentHash}-`) === true
  )
}

function contentDispositionFileName(value: string) {
  const fileName = value.replaceAll(/[\\"\r\n]/g, '_').trim()
  return fileName || 'source.bin'
}

function fileNameFromUrl(url: string, mediaType: string) {
  const name = new URL(url).pathname.split('/').at(-1)
  if (name) return name
  return mediaType.includes('html') ? 'source.html' : 'source.bin'
}

function safeFileName(value: string) {
  const base = basename(value)
    .normalize('NFKC')
    .replaceAll(/[^A-Za-z0-9._-]+/g, '_')
  if (!base || base === '.' || base === '..') return 'source.bin'
  return base
}

function hash(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}
