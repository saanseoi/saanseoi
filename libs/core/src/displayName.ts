export type DisplayNameLocales = {
  'zh-hant'?: string | null
  en?: string | null
}

/** Locale-independent label; missing translations never repeat a fallback name. */
export function buildDisplayName(names: DisplayNameLocales): string | null {
  const values = [names['zh-hant'], names.en]
    .map(name => name?.trim())
    .filter((name): name is string => Boolean(name))
  return [...new Set(values)].join(' ') || null
}
