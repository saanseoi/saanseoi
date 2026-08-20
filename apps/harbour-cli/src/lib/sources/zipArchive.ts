import { unzipSync, type Unzipped } from 'fflate'

const DEFAULT_MAX_ENTRIES = 50_000
const DEFAULT_MAX_ENTRY_BYTES = 1024 * 1024 * 1024
const DEFAULT_MAX_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024
const DEFAULT_MAX_COMPRESSION_RATIO = 1_000
const UNSAFE_ARCHIVE_SEGMENTS = new Set(['..', '__proto__', 'constructor', 'prototype'])

type ZipArchiveLimits = {
  maxCompressionRatio?: number
  maxEntries?: number
  maxEntryBytes?: number
  maxExpandedBytes?: number
}

type ReadSafeZipArchiveOptions = ZipArchiveLimits & {
  select?: (name: string) => boolean
}

/**
 * Validate central-directory metadata before expanding publisher-controlled ZIPs.
 * The optional selector avoids materialising members that a caller only needs to list.
 */
export function readSafeZipArchive(
  archiveBytes: Uint8Array,
  options: ReadSafeZipArchiveOptions = {},
) {
  const files: string[] = []
  let expandedBytes = 0
  const limits = {
    maxCompressionRatio: options.maxCompressionRatio ?? DEFAULT_MAX_COMPRESSION_RATIO,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxEntryBytes: options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES,
    maxExpandedBytes: options.maxExpandedBytes ?? DEFAULT_MAX_EXPANDED_BYTES,
  }

  const entries = unzipSync(archiveBytes, {
    filter(entry) {
      files.push(entry.name)
      if (files.length > limits.maxEntries) {
        throw new Error(
          `ZIP archive contains more than ${limits.maxEntries.toLocaleString('en-US')} entries.`,
        )
      }

      assertSafeMemberName(entry.name)
      const expectedOutputBytes =
        entry.compression === 0 ? entry.size : entry.originalSize
      if (expectedOutputBytes > limits.maxEntryBytes) {
        throw new Error(
          `ZIP archive member ${entry.name} expands beyond the ${formatBytes(limits.maxEntryBytes)} per-entry limit.`,
        )
      }

      expandedBytes += expectedOutputBytes
      if (expandedBytes > limits.maxExpandedBytes) {
        throw new Error(
          `ZIP archive expands beyond the ${formatBytes(limits.maxExpandedBytes)} safety limit.`,
        )
      }

      const compressionRatio = entry.originalSize / Math.max(1, entry.size)
      if (compressionRatio > limits.maxCompressionRatio) {
        throw new Error(
          `ZIP archive member ${entry.name} exceeds the ${limits.maxCompressionRatio.toLocaleString('en-US')}:1 compression-ratio limit.`,
        )
      }

      return options.select?.(entry.name) ?? true
    },
  })

  let actualExpandedBytes = 0
  for (const name of Object.keys(entries)) {
    const output = entries[name]
    if (!output) continue
    if (output.byteLength > limits.maxEntryBytes) {
      throw new Error(
        `ZIP archive member ${name} expands beyond the ${formatBytes(limits.maxEntryBytes)} per-entry limit.`,
      )
    }
    actualExpandedBytes += output.byteLength
    if (actualExpandedBytes > limits.maxExpandedBytes) {
      throw new Error(
        `ZIP archive expands beyond the ${formatBytes(limits.maxExpandedBytes)} safety limit.`,
      )
    }
  }

  if (files.length === 0) throw new Error('ZIP archive is empty.')
  return { entries, files: files.sort() }
}

export function assertSafeZipArchive(
  archiveBytes: Uint8Array,
  limits: ZipArchiveLimits = {},
) {
  readSafeZipArchive(archiveBytes, { ...limits, select: () => false })
}

export function unzipSafeArchive(
  archiveBytes: Uint8Array,
  limits: ZipArchiveLimits = {},
): Unzipped {
  return readSafeZipArchive(archiveBytes, limits).entries
}

function assertSafeMemberName(name: string) {
  const normalised = name.replaceAll('\\', '/')
  const segments = normalised.split('/')
  if (
    name.includes('\0') ||
    normalised.startsWith('/') ||
    /^[a-z]:\//i.test(normalised) ||
    segments.some(segment => UNSAFE_ARCHIVE_SEGMENTS.has(segment.toLowerCase()))
  ) {
    throw new Error(`Unsafe ZIP archive entry: ${name}`)
  }
}

function formatBytes(bytes: number) {
  if (bytes % (1024 * 1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024 * 1024)} GiB`
  }
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MiB`
  return `${bytes.toLocaleString('en-US')} bytes`
}
