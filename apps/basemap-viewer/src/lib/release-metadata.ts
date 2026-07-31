export type ReleaseMetadata = {
  version: string
  sha256: string | null
  size: number | null
  createdAt: string | null
}

export function parseReleaseMetadata(value: unknown): ReleaseMetadata[] {
  if (typeof value !== 'object' || value === null) return []
  const versions = (value as Record<string, unknown>).versions
  if (!Array.isArray(versions)) return []
  return versions.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    const version = record.version
    if (typeof version !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(version)) return []
    return [
      {
        version,
        sha256: typeof record.sha256 === 'string' ? record.sha256 : null,
        size:
          typeof record.size === 'number' && Number.isFinite(record.size)
            ? record.size
            : null,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
      },
    ]
  })
}
