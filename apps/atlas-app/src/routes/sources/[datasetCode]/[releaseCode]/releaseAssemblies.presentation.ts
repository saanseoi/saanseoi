import type { ReleaseLinksProvenancePresentation } from '#lib/bits/pages/docs/components/releaseLinks/index.js'

export type SourceReleaseAssembly = {
  datasetCode: string
  href: string
  label: string
  publisherName?: string
  role: string
  sourceVersion: string
}

type SourceReleaseAssemblyGroup = [SourceReleaseAssembly, ...SourceReleaseAssembly[]]

const assemblyEntryId = (source: SourceReleaseAssembly) =>
  `assembled-with-${`${source.datasetCode}-${source.sourceVersion}`.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`

export function buildSourceReleaseAssembliesPresentation(
  sources: SourceReleaseAssembly[],
): ReleaseLinksProvenancePresentation {
  const byDataset = new Map<string, SourceReleaseAssembly[]>()
  for (const source of sources) {
    const items = byDataset.get(source.datasetCode)
    if (items) items.push(source)
    else byDataset.set(source.datasetCode, [source])
  }

  return {
    groups: [...byDataset.values()]
      .filter((sources): sources is SourceReleaseAssemblyGroup => sources.length > 0)
      .sort((left, right) => left[0].label.localeCompare(right[0].label))
      .map(sources => ({
        entries: sources
          .slice()
          .sort((left, right) =>
            right.sourceVersion.localeCompare(left.sourceVersion, undefined, {
              numeric: true,
            }),
          )
          .map(source => ({
            accentColour: 'var(--secondary)',
            detail: 'Release',
            eyebrow: 'Source release',
            eyebrowColour: 'var(--secondary)',
            href: `${source.href}?tab=assembly`,
            id: assemblyEntryId(source),
            title: source.sourceVersion,
            titleColour: 'var(--secondary)',
          })),
        label: sources[0].publisherName ?? 'Source dataset',
        title: sources[0].label,
      })),
  }
}
