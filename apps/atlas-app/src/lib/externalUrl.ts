export function normaliseExternalUrl(value: string | null | undefined) {
  if (!value) return undefined

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}
