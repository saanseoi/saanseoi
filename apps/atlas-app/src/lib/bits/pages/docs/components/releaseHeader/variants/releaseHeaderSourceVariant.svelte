<script lang="ts">
import { m, selectLocalisedRow, type AppLocale } from '#lib/bits/internal/i18n.js'
import * as ReleaseNotes from '#lib/bits/pages/docs/components/releaseNotes/index.js'
import { normaliseExternalUrl } from '#lib/externalUrl.js'
import { getPublisherLogo } from '#lib/registry/publisherLogo.js'
import { buildReleaseNotesPresentation } from '#lib/registry/releaseNotesPresentation.js'
import type { RegistrySource, SourceVersion } from '#lib/registry/types.js'

import * as ReleaseHeader from '../components'

type Props = {
  source: RegistrySource
  version: SourceVersion
  locale: AppLocale
}

type Detail = {
  label: string
  value: string
  href?: string
  isExternal?: boolean
  isMonospace?: boolean
  disclosureMode?: 'popover'
  alignment?: 'start' | 'end'
  noWrap?: boolean
  disclosure?: Array<{
    label: string
    value: string
    codeValues?: string[]
    isMonospace?: boolean
    href?: string
    isExternal?: boolean
  }>
}

let { source, version, locale }: Props = $props()

let dataset = $derived(selectLocalisedRow(source.datasetI18n, locale))
let name = $derived(dataset?.name ?? source.code)
let description = $derived(dataset?.description)
let descriptionPresentation = $derived(
  buildReleaseNotesPresentation(description ?? '', locale),
)
let statusClass = $derived(
  version.status === 'current'
    ? 'border-data-success/70 bg-data-success-container text-data-on-primary-container dark:border-data-success/60 dark:bg-data-success-container dark:text-data-on-primary-container'
    : version.status === 'archived'
      ? 'border-blue-600/70 bg-blue-100 text-blue-800 dark:border-blue-400/70 dark:bg-blue-950 dark:text-blue-200'
      : version.status === 'failed' || version.status === 'revoked'
        ? 'border-error/30 bg-error-container text-on-error-container'
        : 'border-outline-variant bg-surface-container-high text-primary',
)
let statusDotClass = $derived(
  version.status === 'archived'
    ? 'bg-blue-400 shadow-[0_0_0.4rem_rgb(96_165_250/0.8)]'
    : 'bg-data-success shadow-[0_0_0.4rem_rgb(75_220_172/0.8)]',
)
let statusLabel = $derived(
  version.status === 'current'
    ? m.source_current()
    : version.status === 'archived'
      ? m.source_archived()
      : version.status,
)
let releaseNotesUrl = $derived(normaliseExternalUrl(version.releaseNotesUrl))
let accessMetrics = $derived([
  {
    label: m.publishers_api_requests(),
    value: 'N/A',
  },
  {
    label: m.publishers_downloads(),
    value: 'N/A',
  },
])
let details = $derived.by((): Detail[] => {
  const codeDetails = [
    {
      label: m.source_resource_type(),
      value: source.resourceTypes.join(', ') || m.api_release_unavailable(),
      codeValues: source.resourceTypes,
    },
    ...(source.sourceCrs
      ? [
          {
            label: m.source_coordinate_reference_system(),
            value: source.sourceCrs,
            codeValues: [source.sourceCrs],
          },
        ]
      : []),
    ...(source.kind ? [{ label: m.source_kind(), value: source.kind }] : []),
  ]
  const rows: Detail[] = [
    {
      disclosureMode: 'popover',
      disclosure: codeDetails,
      isMonospace: true,
      label: m.source_code(),
      value: source.code,
    },
    {
      disclosureMode: 'popover',
      disclosure: [
        {
          label: m.source_version(),
          value: version.sourceVersion,
          isMonospace: true,
        },
        ...(version.sourceSchemaVersion
          ? [
              {
                label: m.source_schema(),
                value: version.sourceSchemaVersion,
                href: source.schemaURL ?? undefined,
                isExternal: true,
                isMonospace: true,
              },
            ]
          : []),
        {
          label: m.source_cohort(),
          value: version.cohortKey ?? m.api_release_unavailable(),
          isMonospace: true,
        },
      ],
      isMonospace: true,
      label: m.source_release(),
      value: version.code,
    },
    {
      disclosureMode: 'popover',
      alignment: 'end',
      disclosure: [
        { label: m.source_reference(), value: displayDate(version.publicationDate) },
        { label: m.source_ingested(), value: displayDate(version.ingestedAt) },
        { label: m.source_last_revised(), value: displayDate(version.updatedAt) },
      ],
      label: m.source_published(),
      value: displayDate(version.publicationDate ?? version.ingestedAt),
    },
  ]
  return rows
})
let publisherLogo = $derived(getPublisherLogo(source.publisherCode))
let publisher = $derived(selectLocalisedRow(source.publisher?.publisherI18n, locale))
let publisherName = $derived(
  publisher?.name ?? source.publisher?.code ?? source.publisherCode,
)
let publisherContactUrl = $derived(normaliseExternalUrl(source.publisher?.contactUrl))
let primaryLinks = $derived.by(() => {
  if (publisherContactUrl) {
    return [
      {
        href: publisherContactUrl,
        icon: 'ion:chatbubble-outline',
        isExternal: true,
        label: m.source_contact(),
      },
    ]
  }

  return [
    ...(source.publisher?.contactEmail
      ? [
          {
            href: `mailto:${source.publisher.contactEmail}`,
            icon: 'ion:mail-outline',
            label: source.publisher.contactEmail,
          },
        ]
      : []),
    ...(source.publisher?.contactPhone
      ? [
          {
            href: `tel:${source.publisher.contactPhone}`,
            icon: 'ion:call-outline',
            label: source.publisher.contactPhone,
          },
        ]
      : []),
  ]
})
let secondaryLinks = $derived([
  ...(releaseNotesUrl
    ? [
        {
          href: releaseNotesUrl,
          icon: 'ion:document-text-outline',
          isExternal: true,
          label: m.source_release_notes(),
        },
      ]
    : []),
])

const displayDate = (value?: string | null) =>
  value?.slice(0, 10) ?? m.source_ingestion_unavailable()
</script>

{#snippet descriptionContent()}
  {#if description}
    <div
      class="prose prose-neutral mt-3 max-w-none font-body text-body-sm leading-7 text-foreground-alt prose-p:my-0 prose-a:text-secondary prose-a:decoration-secondary/50 prose-a:underline-offset-4 dark:prose-invert dark:prose-a:text-secondary"
    >
      <ReleaseNotes.Content
        markdown={descriptionPresentation.markdown}
        labels={descriptionPresentation.labels}
        transclusions={descriptionPresentation.transclusions}
      />
    </div>
  {/if}
{/snippet}

{#snippet main()}
  <ReleaseHeader.Main
    title={name}
    {details}
    detailColumns="md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
    description={descriptionContent}
  />
{/snippet}

{#snippet card()}
  <ReleaseHeader.Card
    title={m.source_publisher()}
    name={publisherName}
    href={`/publishers/${source.publisherCode}`}
    imageSrc={publisherLogo}
    description={publisher?.description}
    {primaryLinks}
    {secondaryLinks}
  />
{/snippet}

<ReleaseHeader.Root>
  <ReleaseHeader.Header
    label={m.source_dataset()}
    metrics={accessMetrics}
    {statusLabel}
    {statusClass}
    {statusDotClass}
  />
  <ReleaseHeader.Content {main} {card} metrics={accessMetrics} />
</ReleaseHeader.Root>
