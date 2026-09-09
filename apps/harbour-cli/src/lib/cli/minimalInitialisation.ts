/** Shared by the Fish coordinator and native importers; inherited by children. */
export function isMinimalInitialisation() {
  return process.env.SAANSEOI_INIT_MINIMAL === '1'
}

/** Select before checking target completion, so retries retain the same sample. */
export function selectInitialisationVersions<T>(
  releases: readonly T[],
  version: (release: T) => string,
): T[] {
  if (!isMinimalInitialisation()) return [...releases]
  const versions = [...new Set(releases.map(version))]
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .slice(0, 2)
  return releases.filter(release => versions.includes(version(release)))
}
