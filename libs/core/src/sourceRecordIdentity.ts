/** Source IDs are opaque and unique within a dataset release, never globally. */
export type SourceRecordIdentity = {
  scope: 'dataset-release'
  /** Release-local identities must not be used to infer continuity across releases. */
  stability: 'publisher' | 'release'
  components: Array<
    | {
        paths: string[]
        fallback?: 'row-ordinal'
        normalisation?: 'name-slug'
        ordinal?: never
      }
    | { ordinal: true; paths?: never; fallback?: never; normalisation?: never }
  >
  duplicates: 'reject' | 'append-row-ordinal'
}

export function assertSourceRecordIdentity(
  value: unknown,
): asserts value is SourceRecordIdentity {
  if (!value || typeof value !== 'object')
    throw new Error('Missing source-record identity.')
  const policy = value as SourceRecordIdentity
  if (
    policy.scope !== 'dataset-release' ||
    !['publisher', 'release'].includes(policy.stability) ||
    !['reject', 'append-row-ordinal'].includes(policy.duplicates) ||
    !Array.isArray(policy.components) ||
    !policy.components.length ||
    policy.components.some(
      component =>
        !component ||
        typeof component !== 'object' ||
        (component.ordinal === true
          ? component.paths !== undefined ||
            component.fallback !== undefined ||
            component.normalisation !== undefined
          : !Array.isArray(component.paths) ||
            !component.paths.length ||
            component.paths.some(path => typeof path !== 'string' || !path.trim()) ||
            (component.fallback !== undefined &&
              component.fallback !== 'row-ordinal') ||
            (component.normalisation !== undefined &&
              component.normalisation !== 'name-slug') ||
            component.ordinal !== undefined),
    ) ||
    (policy.stability === 'publisher' &&
      (policy.duplicates !== 'reject' ||
        policy.components.some(component => component.ordinal || component.fallback)))
  )
    throw new Error('Invalid source-record identity contract.')
}

/** Ordered publisher fields are alternatives; zeroes and leading zeroes are preserved. */
export function composeSourceRecordId(
  policy: SourceRecordIdentity,
  record: Record<string, unknown>,
  rowOrdinal?: number,
): string {
  assertSourceRecordIdentity(policy)
  const ordinal = () => {
    if (!Number.isSafeInteger(rowOrdinal) || (rowOrdinal ?? 0) < 1)
      throw new Error(
        'Source-record identity requires a positive delivery row ordinal.',
      )
    return String(rowOrdinal)
  }
  const components = policy.components.map(component => {
    if (component.ordinal) return ordinal()
    for (const path of component.paths) {
      const value = record[path]
      if (typeof value === 'string' && value.trim()) {
        if (!component.normalisation) return value.trim()
        const slug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        if (!slug)
          throw new Error(`Source-record name cannot form an identity: ${path}.`)
        return slug
      }
      if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
    }
    if (component.fallback) return ordinal()
    throw new Error(`Source-record identity requires ${component.paths.join(' or ')}.`)
  })
  // Single publisher keys remain literal. Composite keys escape separators and
  // percent signs so a publisher value cannot impersonate another component.
  return components.length === 1
    ? components[0]!
    : components.map(encodeURIComponent).join(':')
}

/** Collision qualifiers refer to the one-based ordinal in the original delivery. */
export function composeSourceRecordIds(
  policy: SourceRecordIdentity,
  records: readonly Record<string, unknown>[],
): string[] {
  const ids = records.map((record, index) =>
    composeSourceRecordId(policy, record, index + 1),
  )
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  const result = ids.map((id, index) => {
    if (counts.get(id) === 1) return id
    if (policy.duplicates === 'reject')
      throw new Error(`Duplicate source-record identity: ${id}.`)
    return `${id}:${index + 1}`
  })
  if (new Set(result).size !== result.length)
    throw new Error(
      'Source-record collision qualifier conflicts with a publisher identity.',
    )
  return result
}
