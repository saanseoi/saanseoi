/** Selected locale, English, another retained name, then the parent identity. */
export function translationParentName(context: unknown, locale: string): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  const values = context as Record<string, unknown>
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : null
  const names = Object.entries(values)
    .filter(([key]) => key.startsWith('parentName.'))
    .sort(([a], [b]) => a.localeCompare(b))
  return (
    text(
      names.find(
        ([key]) => key.toLowerCase() === `parentName.${locale}`.toLowerCase(),
      )?.[1],
    ) ??
    text(names.find(([key]) => key.toLowerCase() === 'parentname.en')?.[1]) ??
    text(values.parentName) ??
    names.map(([, value]) => text(value)).find(Boolean) ??
    text(values.parentDivisionId)
  )
}
