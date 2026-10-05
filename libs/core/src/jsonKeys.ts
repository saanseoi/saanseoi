/** These objects are dictionaries: their keys are identifiers, not field names. */
const dictionaries = new Set([
  'identifiers',
  'i18n',
  'names',
  'common',
  'localType',
  'sources',
  'sourceSpecifications',
  'fieldSources',
  'fieldDefinitionHashes',
  'values',
  'comparability',
  'dimensions',
])

export function camelCaseFieldName(key: string) {
  // Namespaced identifiers and locale tags are data, not snake_case fields.
  if (!/^[a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+$/.test(key)) return key
  return key.replace(/_([a-zA-Z0-9])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * Project inherited JSON into SaanSeoi field naming without mutating its source.
 * Dictionary keys and string values (IDs, enum values, URLs, source paths) are
 * preserved. Their object values still receive structural field projection.
 * Collisions are errors, including equal values: never silently discard a key.
 */
export function camelCaseJson(value: Record<string, unknown>): Record<string, unknown>
export function camelCaseJson(
  value: Record<string, unknown> | null,
): Record<string, unknown> | null
export function camelCaseJson(value: unknown[]): unknown[]
export function camelCaseJson(value: unknown): unknown
export function camelCaseJson(value: unknown): unknown {
  function visit(input: unknown, dictionary = false, path = '$'): unknown {
    if (Array.isArray(input))
      return input.map((item, i) => visit(item, false, `${path}[${i}]`))
    if (input === null || typeof input !== 'object') return input
    const entries: Array<[string, unknown]> = []
    const seen = new Set<string>()
    for (const [key, child] of Object.entries(input)) {
      const projected = dictionary ? key : camelCaseFieldName(key)
      if (seen.has(projected))
        throw new Error(`JSON field collision at ${path}.${projected}`)
      seen.add(projected)
      entries.push([
        projected,
        visit(
          child,
          !dictionary && dictionaries.has(projected),
          `${path}.${projected}`,
        ),
      ])
    }
    return Object.fromEntries(entries)
  }
  return visit(value)
}
