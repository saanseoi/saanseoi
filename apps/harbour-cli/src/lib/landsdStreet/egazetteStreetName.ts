import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

export type EgazetteStreetNameLocale = 'en' | 'zh-Hant'

export type EgazetteStreetNameAsset = {
  byteLength: number
  localPath: string
  officialUrl: string
  sha256: string
}

export type EgazetteStreetNameRecord = {
  assets: Record<EgazetteStreetNameLocale, EgazetteStreetNameAsset>
  issueVolume: string
  publicationDate: string
  subject: string
}

/**
 * Read and validate the locally retrieved e-Gazette manifest before any R2
 * assets are registered. Every path, hash and byte length is part of the
 * archive contract, so a malformed or incomplete retrieval fails with the
 * exact offending Government Notice asset.
 */
export async function loadEgazetteStreetNameArchive(input: {
  archiveDir: string
  repoRoot: string
}): Promise<EgazetteStreetNameRecord[]> {
  const archiveDir = resolve(input.archiveDir)
  const manifestPath = resolve(archiveDir, 'manifest.json')
  const manifest = parseManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
    manifestPath,
  )
  const records = [...manifest.records].sort((left, right) =>
    `${left.publicationDate}\0${left.assets.en.localPath}`.localeCompare(
      `${right.publicationDate}\0${right.assets.en.localPath}`,
    ),
  )
  for (const record of records) {
    for (const locale of ['en', 'zh-Hant'] as const) {
      const asset = record.assets[locale]
      const filePath = resolveArchivePath(input.repoRoot, asset.localPath)
      const details = await stat(filePath).catch(error => {
        throw new Error(
          `e-Gazette ${record.publicationDate} ${locale} PDF is missing: ${asset.localPath} (${error instanceof Error ? error.message : String(error)}).`,
        )
      })
      if (details.size !== asset.byteLength) {
        throw new Error(
          `e-Gazette ${record.publicationDate} ${locale} PDF byte length mismatch: ${asset.localPath}; manifest ${asset.byteLength}, file ${details.size}.`,
        )
      }
    }
  }
  return records
}

export function egazetteArchiveFilePath(repoRoot: string, localPath: string) {
  return resolveArchivePath(repoRoot, localPath)
}

function parseManifest(
  value: unknown,
  manifestPath: string,
): {
  records: EgazetteStreetNameRecord[]
} {
  const root = record(value, manifestPath)
  if (root.schemaVersion !== 1 || !Array.isArray(root.records)) {
    throw new Error(
      `${manifestPath} must be an e-Gazette street-name manifest version 1.`,
    )
  }
  return {
    records: root.records.map((value, index) =>
      parseRecord(value, manifestPath, index),
    ),
  }
}

function parseRecord(
  value: unknown,
  manifestPath: string,
  index: number,
): EgazetteStreetNameRecord {
  const path = `${manifestPath}: records[${index}]`
  const row = record(value, path)
  const publicationDate = string(row.publicationDate, `${path}.publicationDate`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate)) {
    throw new Error(`${path}.publicationDate must be ISO YYYY-MM-DD.`)
  }
  const assets = record(row.assets, `${path}.assets`)
  return {
    assets: {
      en: parseAsset(assets.en, `${path}.assets.en`),
      'zh-Hant': parseAsset(assets['zh-Hant'], `${path}.assets.zh-Hant`),
    },
    issueVolume: string(row.issueVolume, `${path}.issueVolume`),
    publicationDate,
    subject: string(row.subject, `${path}.subject`),
  }
}

function parseAsset(value: unknown, path: string): EgazetteStreetNameAsset {
  const asset = record(value, path)
  const sha256 = string(asset.sha256, `${path}.sha256`)
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`${path}.sha256 must be a lowercase SHA-256 digest.`)
  }
  const byteLength = asset.byteLength
  if (
    typeof byteLength !== 'number' ||
    !Number.isSafeInteger(byteLength) ||
    byteLength < 1
  ) {
    throw new Error(`${path}.byteLength must be a positive integer.`)
  }
  return {
    byteLength,
    localPath: string(asset.localPath, `${path}.localPath`),
    officialUrl: string(asset.officialUrl, `${path}.officialUrl`),
    sha256,
  }
}

function resolveArchivePath(repoRoot: string, localPath: string) {
  if (isAbsolute(localPath)) {
    throw new Error(
      `e-Gazette manifest localPath must be repository-relative: ${localPath}.`,
    )
  }
  const root = resolve(repoRoot)
  const path = resolve(root, localPath)
  if (relative(root, path).startsWith('..')) {
    throw new Error(
      `e-Gazette manifest localPath escapes the repository: ${localPath}.`,
    )
  }
  return path
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, path: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${path} must be a non-empty string.`)
  return value.trim()
}
