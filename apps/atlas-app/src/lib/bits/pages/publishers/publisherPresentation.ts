export const publisherAccent = (publisherCode: string) => {
  if (publisherCode === 'dpang') return '#719b62'
  if (publisherCode === 'overture') return '#6a83cd'
  if (publisherCode.startsWith('hkgov')) return '#e47561'
  return '#4f7183'
}

export const publisherIconBackdrop = (publisherCode: string) => {
  if (publisherCode === 'dpang') return '#dff0d6'
  if (publisherCode.startsWith('hkgov')) return '#fff7f4'
  return 'color-mix(in srgb, #fff 78%, var(--publisher-accent) 22%)'
}

export const displayResourceTypes = (resourceTypes: string[]) =>
  resourceTypes.map(type => type.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ')

export const displayFrequency = (frequency: string) =>
  frequency === 'census' ? '5-yearly' : frequency

export const displayRegistryValue = (value?: string | null) =>
  value?.replaceAll('-', ' ')

export const displaySourceReleaseCode = (
  sourceCode: string,
  regionCode: string,
  publisherCode: string,
  releaseCode: string,
) => {
  const sourcePrefix = `ds-${regionCode}-${publisherCode}-`
  const releasePrefix = `dr-${regionCode}-${publisherCode}-`

  return sourceCode.startsWith(sourcePrefix) && releaseCode.startsWith(releasePrefix)
    ? releaseCode.slice(releasePrefix.length)
    : releaseCode
}
