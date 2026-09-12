export type BasemapVersionEntry = {
  version: string
  size: number
  createdAt: string
}

function isBasemapVersionEntry(value: unknown): value is BasemapVersionEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.version === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.version) &&
    typeof entry.size === 'number' &&
    Number.isFinite(entry.size) &&
    typeof entry.createdAt === 'string'
  )
}

export function parseBasemapVersions(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter(isBasemapVersionEntry)
    .sort((left, right) => right.version.localeCompare(left.version))
}
