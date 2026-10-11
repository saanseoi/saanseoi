/** Internal provenance belongs to a dataset; exact input versions belong to its release. */
export type InternalSourcePin = {
  datasetCode: string
  sourceVersion: string
  resourceType: string
}

export function assertInternalSourcePins(pins: InternalSourcePin[]) {
  const versions = new Map<string, string>()
  const resources = new Set<string>()
  for (const pin of pins) {
    const key = `${pin.datasetCode}:${pin.resourceType}`
    if (resources.has(key)) throw Error(`Duplicate source input: ${key}`)
    resources.add(key)
    const version = versions.get(pin.datasetCode)
    if (version && version !== pin.sourceVersion)
      throw Error(`Mixed source versions for ${pin.datasetCode}`)
    versions.set(pin.datasetCode, pin.sourceVersion)
  }
}

/** Only call for SaanSeoi-authored payloads, never original publisher attribution. */
export function assertInternalSourceReferences(
  value: unknown,
  context?: { datasetCode: string; sourceReleases: InternalSourcePin[] },
): void {
  if (Array.isArray(value)) {
    for (const child of value) assertInternalSourceReferences(child, context)
    return
  }
  if (!value || typeof value !== 'object') return
  const row = value as Record<string, unknown>
  if (typeof row.dataset === 'string' && row.dataset.startsWith('ds-')) {
    for (const key of [
      'release',
      'releaseCode',
      'sourceRelease',
      'sourceReleaseId',
      'sourceVersion',
    ])
      if (Object.hasOwn(row, key))
        throw Error(`Internal source reference ${row.dataset} must not contain ${key}`)
    if (
      context &&
      row.dataset !== context.datasetCode &&
      !context.sourceReleases.some(pin => pin.datasetCode === row.dataset)
    )
      throw Error(`Unpinned internal source dataset: ${row.dataset}`)
  }
  for (const [field, child] of Object.entries(row))
    assertInternalSourceReferences(
      ['sources', 'memberships'].includes(field) && typeof child === 'string'
        ? JSON.parse(child)
        : child,
      context,
    )
}
