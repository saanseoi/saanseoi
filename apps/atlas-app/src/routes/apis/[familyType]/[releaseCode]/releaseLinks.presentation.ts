import { m } from '$lib/bits/internal/i18n'
import type { ReleaseLinksProvenancePresentation } from '$lib/bits/pages/docs/components/releaseLinks'
import type { ApiRelease } from '$lib/registry/types'

const sourceLinkId = (source: NonNullable<ApiRelease['contributingSources']>[number]) =>
  [
    source.sourceCode,
    source.sourceReleaseCode,
    source.snapshotCode,
    source.role,
    source.resourceType,
    source.variant,
  ].join(':')

export function buildApiReleaseLinksPresentation(
  sources: ApiRelease['contributingSources'],
): ReleaseLinksProvenancePresentation {
  return {
    groups: [
      {
        entries: (sources ?? []).map(source => ({
          description: `${source.role} · ${source.resourceType} · ${source.variant}`,
          detail: source.sourceCode,
          eyebrow: source.role,
          facts: [
            { label: m.source_dataset(), value: source.sourceCode },
            { label: m.source_version(), value: source.sourceReleaseCode },
            { label: m.source_released_as_snapshot(), value: source.snapshotCode },
          ],
          href: `/sources/${source.sourceCode}/${source.sourceReleaseCode}`,
          id: sourceLinkId(source),
          title: source.sourceReleaseCode,
        })),
        label: m.pipeline_sources_eyebrow(),
        title: m.pipeline_sources_title(),
      },
    ],
  }
}
