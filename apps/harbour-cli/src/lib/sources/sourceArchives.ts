import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'

import { strFromU8, zipSync } from 'fflate'
import shp from 'shpjs'

import type { UploadTarget } from '../cli/options.ts'
import { buildManagedAssetUrl, uploadManagedSourceAsset } from './sourceAssets.ts'
import { readFileGeodatabaseArchive } from './fileGeodatabase.ts'
import {
  HKGOV_TD_PEDESTRIAN_STREET_LAYERS,
  readHkgovTdPedestrianStreetArchive,
} from './hkgov/hkgovHyd.ts'
import { readSafeZipArchive } from './zipArchive.ts'

const SOURCE_ARCHIVE_ROOT = 'by-source'
const CSDI_ARCHIVE_PUBLISHER = 'hkgov-csdi'

export type CsdiSourceArchive = {
  datasetCode: string
  datasetId: string
  releaseSlot: string
  sourceFormat?: string
  sourceLayers?: string[]
  sourceUrl: string
}

export type SourceArchiveManifest = {
  schemaVersion: 1
  archive: {
    byteLength: number
    objectKey: string
    packaging: 'publisher-zip' | 'saanseoi-lossless-zip'
    sha256: string
  }
  contents: {
    files: string[]
    layers: Array<{
      featureCount?: number
      geometryTypes?: string[]
      name: string
      properties?: string[]
      sourceCrs?: string
    }>
  }
  dataset: {
    code: string
    id: string
    publisher: typeof CSDI_ARCHIVE_PUBLISHER
    region: 'hk'
  }
  original: {
    byteLength: number
    fileName: string
    sha256: string
  }
  provenance: {
    format?: string
    releaseSlot: string
    sourceUrl: string
  }
  semantic?: {
    fingerprint: string
    schemaFingerprint: string
  }
}

export type PreparedSourceArchive = {
  manifest: SourceArchiveManifest
  manifestPath: string
  sourcePath: string
}

export function buildSourceArchivePrefix(input: { datasetId: string }) {
  assertDatasetId(input.datasetId)
  return [SOURCE_ARCHIVE_ROOT, 'hk', CSDI_ARCHIVE_PUBLISHER, input.datasetId].join('/')
}

export function buildSourceArchiveObjectKey(
  input: { datasetId: string; sha256: string },
  fileName: 'manifest.json' | 'source.zip',
) {
  assertSha256(input.sha256)
  return `${buildSourceArchivePrefix(input)}/${input.sha256}-${fileName}`
}

export async function prepareCsdiSourceArchive(input: {
  archive: CsdiSourceArchive
  inputPath: string
  originalFileName?: string
  outputPath: string
}): Promise<PreparedSourceArchive> {
  const original = await readFile(input.inputPath)
  const originalSha256 = sha256(original)
  const originalFileName = input.originalFileName ?? basename(input.inputPath)
  const publisherZip = isZip(original)
  const archiveBytes = publisherZip
    ? original
    : zipSync({ [normaliseArchiveMemberName(originalFileName)]: original })

  await mkdir(dirname(input.outputPath), { recursive: true })
  if (publisherZip && resolve(input.inputPath) !== resolve(input.outputPath)) {
    await copyFile(input.inputPath, input.outputPath)
  } else if (!publisherZip) {
    await writeFile(input.outputPath, archiveBytes)
  }

  const archiveSha256 = sha256(archiveBytes)
  const manifest = await buildSourceArchiveManifest({
    archive: input.archive,
    archiveBytes,
    archiveSha256,
    originalByteLength: original.byteLength,
    originalFileName,
    originalSha256,
    packaging: publisherZip ? 'publisher-zip' : 'saanseoi-lossless-zip',
  })
  const manifestPath = `${input.outputPath}.manifest.json`
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  return { manifest, manifestPath, sourcePath: input.outputPath }
}

export async function loadPreparedSourceArchive(sourcePath: string) {
  const manifestPath = `${sourcePath}.manifest.json`
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as SourceArchiveManifest
  return { manifest, manifestPath, sourcePath }
}

export async function mirrorCsdiSourceArchive(
  target: UploadTarget,
  archive: CsdiSourceArchive,
  prepared: PreparedSourceArchive,
  options: { upload?: typeof uploadManagedSourceAsset } = {},
) {
  const upload = options.upload ?? uploadManagedSourceAsset
  const manifestBytes = await readFile(prepared.manifestPath)
  const manifestSha256 = sha256(manifestBytes)
  const retrievedAt = new Date().toISOString()
  const sourceKey = prepared.manifest.archive.objectKey
  const manifestKey = buildSourceArchiveObjectKey(
    {
      datasetId: archive.datasetId,
      sha256: manifestSha256,
    },
    'manifest.json',
  )
  const [source, manifest] = await Promise.all([
    upload(target, {
      fileName: 'source.zip',
      filePath: prepared.sourcePath,
      metadata: {
        assetKey: sourceKey,
        contentHash: prepared.manifest.archive.sha256,
        manifest: prepared.manifest,
        mediaType: 'application/zip',
        originalUrl: archive.sourceUrl,
        retrievedAt,
        role: 'sourceArchive',
      },
    }),
    upload(target, {
      fileName: 'manifest.json',
      filePath: prepared.manifestPath,
      metadata: {
        assetKey: manifestKey,
        contentHash: manifestSha256,
        mediaType: 'application/json; charset=utf-8',
        originalUrl: archive.sourceUrl,
        retrievedAt,
        role: 'manifest',
      },
    }),
  ])

  return {
    manifestUrl: buildManagedAssetUrl(target, manifest.assetId),
    sourceUrl: buildManagedAssetUrl(target, source.assetId),
  }
}

async function buildSourceArchiveManifest(input: {
  archive: CsdiSourceArchive
  archiveBytes: Uint8Array
  archiveSha256: string
  originalByteLength: number
  originalFileName: string
  originalSha256: string
  packaging: SourceArchiveManifest['archive']['packaging']
}): Promise<SourceArchiveManifest> {
  const contents = inspectZip(input.archiveBytes)
  const semantic = await inspectNativeSemantics(
    input.archiveBytes,
    input.archive.sourceLayers,
  ).catch(() => undefined)

  return {
    schemaVersion: 1,
    archive: {
      byteLength: input.archiveBytes.byteLength,
      objectKey: buildSourceArchiveObjectKey(
        {
          datasetId: input.archive.datasetId,
          sha256: input.archiveSha256,
        },
        'source.zip',
      ),
      packaging: input.packaging,
      sha256: input.archiveSha256,
    },
    contents: {
      files: contents.files,
      layers: semantic?.layers ?? contents.layers,
    },
    dataset: {
      code: input.archive.datasetCode,
      id: input.archive.datasetId,
      publisher: CSDI_ARCHIVE_PUBLISHER,
      region: 'hk',
    },
    original: {
      byteLength: input.originalByteLength,
      fileName: input.originalFileName,
      sha256: input.originalSha256,
    },
    provenance: {
      format: input.archive.sourceFormat,
      releaseSlot: input.archive.releaseSlot,
      sourceUrl: input.archive.sourceUrl,
    },
    ...(semantic
      ? {
          semantic: {
            fingerprint: semantic.fingerprint,
            schemaFingerprint: semantic.schemaFingerprint,
          },
        }
      : {}),
  }
}

function inspectZip(value: Uint8Array) {
  const { entries, files } = readSafeZipArchive(value, {
    select: file => file.toLowerCase().endsWith('.prj'),
  })
  const layers = files
    .filter(file => file.toLowerCase().endsWith('.shp'))
    .map(file => {
      const base = file.slice(0, -extname(file).length)
      const prj = entries[`${base}.prj`]
      return {
        name: base.split('/').at(-1) as string,
        ...(prj ? { sourceCrs: strFromU8(prj).trim() } : {}),
      }
    })
  return { files, layers }
}

async function inspectNativeSemantics(
  archiveBytes: Uint8Array,
  requestedLayers: string[] | undefined,
) {
  const { files } = readSafeZipArchive(archiveBytes, { select: () => false })
  const parsed = isTdPedestrianStreetLayers(requestedLayers)
    ? readHkgovTdPedestrianStreetArchive(archiveBytes)
    : files.some(file => file.toLowerCase().includes('.gdb/'))
      ? await readFileGeodatabaseArchive(archiveBytes)
      : await shp(Uint8Array.from(archiveBytes).buffer)
  const featureCollections = readFeatureCollections(parsed)
  if (featureCollections.length === 0) return undefined

  const selected = requestedLayers?.length
    ? featureCollections.filter(collection =>
        requestedLayers.some(layer => sameLayerName(layer, collection.name)),
      )
    : featureCollections
  if (requestedLayers?.length && selected.length !== requestedLayers.length) {
    return undefined
  }

  const layers = selected
    .map(collection => {
      const features = collection.features
      return {
        featureCount: features.length,
        geometryTypes: [
          ...new Set(features.map(feature => feature.geometry?.type).filter(Boolean)),
        ]
          .map(String)
          .sort(),
        name: collection.name,
        properties: [
          ...new Set(
            features.flatMap(feature => Object.keys(feature.properties ?? {})),
          ),
        ].sort(),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
  const semanticPayload = selected
    .map(collection => ({
      features: collection.features
        .map(feature => ({
          geometry: feature.geometry ?? null,
          properties: feature.properties ?? {},
        }))
        .map(stableJson)
        .sort(),
      name: collection.name,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    fingerprint: sha256(stableJson(semanticPayload)),
    layers,
    schemaFingerprint: sha256(stableJson(layers)),
  }
}

function isTdPedestrianStreetLayers(layers: string[] | undefined): layers is string[] {
  return (
    layers?.length === HKGOV_TD_PEDESTRIAN_STREET_LAYERS.length &&
    layers.every(layer =>
      (HKGOV_TD_PEDESTRIAN_STREET_LAYERS as readonly string[]).includes(layer),
    )
  )
}

function readFeatureCollections(value: unknown): Array<{
  features: Array<{
    geometry?: { type?: unknown }
    properties?: Record<string, unknown>
  }>
  name: string
}> {
  if (isFeatureCollection(value)) {
    return [
      {
        features: value.features,
        name: typeof value.fileName === 'string' ? value.fileName : 'default',
      },
    ]
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []

  return Object.entries(value)
    .filter(([, collection]) => isFeatureCollection(collection))
    .map(([name, collection]) => ({
      features: collection.features,
      name,
    }))
}

function isFeatureCollection(value: unknown): value is {
  features: Array<{
    geometry?: { type?: unknown }
    properties?: Record<string, unknown>
  }>
  fileName?: unknown
  type: 'FeatureCollection'
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'FeatureCollection' &&
    Array.isArray((value as { features?: unknown }).features)
  )
}

function sameLayerName(left: string, right: string) {
  const normalise = (value: string) =>
    value.replaceAll(/[^a-z0-9]+/gi, '').toLowerCase()
  return normalise(left) === normalise(right)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function isZip(value: Uint8Array) {
  return value[0] === 0x50 && value[1] === 0x4b
}

function normaliseArchiveMemberName(fileName: string) {
  const baseName = basename(fileName).replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
  return baseName || 'source.bin'
}

function sha256(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex')
}

function assertDatasetId(value: string) {
  if (!/^[a-z0-9_-]+$/i.test(value))
    throw new Error(`Invalid CSDI dataset id: ${value}`)
}

function assertSha256(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid SHA-256: ${value}`)
}
