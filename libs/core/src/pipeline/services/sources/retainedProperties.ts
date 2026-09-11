/** Locale-bearing labels use suffixes; language measures and dictionary keys are not labels. */
export function retainedLocalePropertyName(name: string): string {
  const prefix = /^(en|zhHant|zhHans)(?=[A-Z0-9])(.+)$/.exec(name)
  if (prefix) {
    const locale = prefix[1]!
    const field = prefix[2]!
    const base =
      field === '3dAddress' ? 'address3d' : field[0]!.toLowerCase() + field.slice(1)
    return base + locale[0]!.toUpperCase() + locale.slice(1)
  }
  const publisherPrefix = /^(en|tc|sc)(?=[A-Z0-9])(.+)$/.exec(name)
  if (publisherPrefix) {
    const locale = { en: 'En', tc: 'ZhHant', sc: 'ZhHans' }[publisherPrefix[1]!]!
    const field = publisherPrefix[2]!
    return field[0]!.toLowerCase() + field.slice(1) + locale
  }
  const label =
    /^(.*(?:Name|name)|dc|bg|hma|estate|newtown|newTown|area|district|region|village|street|town)(Eng|Chi|Tc|Sc)$/.exec(
      name,
    )
  if (label)
    return (
      label[1]! +
      ({ Eng: 'En', Chi: 'ZhHant', Tc: 'ZhHant', Sc: 'ZhHans' }[label[2]!] ?? '')
    )
  return name
}

/** Publisher field spelling is retained in provenance; stored attribute names use camelCase. */
export function retainedPropertyName(name: string): string {
  if (name === 'OBJECTID') return 'objectId'
  const words = name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
  return retainedLocalePropertyName(
    words
      .map((word, index) => {
        const lower = word.toLowerCase()
        return index ? lower[0]!.toUpperCase() + lower.slice(1) : lower
      })
      .join(''),
  )
}

// These objects are publisher dictionaries: their keys identify languages, not fields.
const dictionaries = new Set(['common', 'variant', 'perspectives'])
const localeKey = /^[a-z]{2,3}-(?:[A-Za-z]{2,8})(?:-[A-Za-z\d]{2,8})*$/

export function retainSourceProperties(value: unknown, dictionary = false): unknown {
  if (Array.isArray(value)) return value.map(item => retainSourceProperties(item))
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [original, child] of Object.entries(value)) {
    const key =
      dictionary || localeKey.test(original) ? original : retainedPropertyName(original)
    if (Object.hasOwn(result, key))
      throw new Error(`Retained source property collision: ${original} -> ${key}`)
    Object.defineProperty(result, key, {
      enumerable: true,
      configurable: true,
      writable: true,
      value: retainSourceProperties(child, dictionaries.has(original)),
    })
  }
  return result
}
