import { m } from '$lib/bits/internal/i18n'
import type { ReleaseLinksProvenancePresentation } from '$lib/bits/pages/docs/components/releaseLinks'
import type { ApiRelease } from '$lib/registry/types'
import { getPublisherLogo } from '$lib/registry/publisherLogo'

const sourceLinkId = (source: NonNullable<ApiRelease['contributingSources']>[number]) =>
  [
    source.sourceCode,
    source.sourceReleaseCode,
    source.snapshotCode,
    source.role,
    source.resourceType,
    source.variant,
  ].join(':')

const humaniseResourceType = (value: string) =>
  value
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())

const humaniseCode = (value: string) =>
  value.replaceAll(/[_-]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())

export function buildApiReleaseLinksPresentation(
  sources: ApiRelease['contributingSources'],
  familyType: string,
): ReleaseLinksProvenancePresentation {
  const entries = (items: NonNullable<ApiRelease['contributingSources']>) =>
    [...items]
      .sort(
        (left, right) =>
          right.sourceVersion.localeCompare(left.sourceVersion, undefined, {
            numeric: true,
          }) || left.sourceCode.localeCompare(right.sourceCode),
      )
      .map(source => {
        const directRequest =
          familyType === 'divisions'
            ? {
                path: '/v0.1/divisions/sources',
                query: [
                  { key: 'sourceRelease', value: source.sourceReleaseCode },
                  { key: 'include', value: 'geometry' },
                  { key: 'format', value: 'ndjson' },
                  { key: 'download', value: '1' },
                ],
              }
            : undefined

        return {
          accentColour: 'var(--data-primary)',
          description: directRequest ? m.source_direct_usage() : undefined,
          detail: source.sourceCode,
          detailLabel: m.source_dataset(),
          eyebrow: humaniseResourceType(source.resourceType),
          eyebrowColour: 'var(--data-primary)',
          expanded: source.role === 'primary',
          facts: [
            { label: m.source_dataset(), value: source.sourceCode },
            {
              label: m.source_resource_type(),
              value: humaniseResourceType(source.resourceType),
            },
            { label: m.source_released_as_snapshot(), value: source.snapshotCode },
          ],
          href: `/sources/${source.sourceCode}/${source.sourceReleaseCode}`,
          id: sourceLinkId(source),
          publisherLogoSrc: getPublisherLogo(source.publisherCode),
          publisherName: humaniseCode(source.publisherCode),
          request: directRequest,
          requestLabel: m.source_released_as_request(),
          title: [
            `v${source.sourceVersion}`,
            ...(source.subType ? [humaniseCode(source.subType)] : []),
          ].join(' · '),
          titleColour: 'var(--data-primary)',
        }
      })
  const primarySources = (sources ?? []).filter(source => source.role === 'primary')
  const sourcesByResourceType = new Map<
    string,
    NonNullable<ApiRelease['contributingSources']>
  >()

  for (const source of sources ?? []) {
    if (source.role === 'primary') continue
    const groupedSources = sourcesByResourceType.get(source.resourceType) ?? []
    groupedSources.push(source)
    sourcesByResourceType.set(source.resourceType, groupedSources)
  }

  return {
    groups: [
      {
        entries: entries(primarySources),
        id: 'source-records-primary',
        label: m.source_primary_sources(),
        title: m.source_direct_records(),
      },
      ...[...sourcesByResourceType.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([resourceType, groupedSources]) => ({
          entries: entries(groupedSources),
          id: `source-records-${resourceType}`,
          label: humaniseResourceType(resourceType),
          title: m.source_direct_records(),
        })),
    ],
  }
}
