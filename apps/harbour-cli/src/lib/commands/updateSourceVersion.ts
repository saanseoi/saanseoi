/** Pin ingestion to an exact publisher release without hiding discovery failures. */
export function selectUpdateSourceVersion<
  T extends { version?: string; status: string },
>(updates: T[], version: string | undefined): T[] {
  if (!version) return updates
  const selected = updates.filter(update => update.version === version)
  const errors = updates.filter(update => update.status === 'error' && !update.version)
  if (!selected.length && !errors.length)
    throw new Error(`Requested source version ${version} was not discovered.`)
  return [...selected, ...errors]
}
