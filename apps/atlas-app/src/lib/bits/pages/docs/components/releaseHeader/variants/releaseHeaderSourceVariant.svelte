<script lang="ts">
import dianapangLogo from '$lib/assets/sourcePublishers/dpang.png'
import hkgovLogo from '$lib/assets/sourcePublishers/hkgov.webp'
import overtureLogo from '$lib/assets/sourcePublishers/overture.png'
import { m, selectLocalisedRow, type AppLocale } from '$lib/bits/internal/i18n'
import * as ReleaseNotes from '$lib/bits/pages/docs/components/releaseNotes'
import { buildReleaseNotesPresentation } from '$lib/registry/releaseNotesPresentation'
import type { RegistrySource, SourceVersion } from '$lib/registry/types'

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
  disclosure?: Array<{
    label: string
    value: string
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
let isLatest = $derived(source.sourceVersions?.[0]?.code === version.code)
let statusClass = $derived(
  version.status === 'published' && isLatest
    ? 'border-data-success/70 bg-data-success-container text-data-on-primary-container dark:border-data-success/60 dark:bg-data-success-container dark:text-data-on-primary-container'
    : version.status === 'superseded'
      ? 'border-blue-600/70 bg-blue-100 text-blue-800 dark:border-blue-400/70 dark:bg-blue-950 dark:text-blue-200'
      : version.status === 'failed' || version.status === 'revoked'
        ? 'border-error/30 bg-error-container text-on-error-container'
        : 'border-outline-variant bg-surface-container-high text-primary',
)
let statusDotClass = $derived(
  version.status === 'superseded'
    ? 'bg-blue-400 shadow-[0_0_0.4rem_rgb(96_165_250/0.8)]'
    : 'bg-data-success shadow-[0_0_0.4rem_rgb(75_220_172/0.8)]',
)
let statusLabel = $derived(
  version.status === 'published' && isLatest
    ? m.source_latest()
    : version.status === 'published'
      ? m.source_published()
      : version.status === 'superseded'
        ? m.source_superseded()
        : version.status,
)
let primaryRelease = $derived(
  version.releaseAs?.find(release => release.role === 'primary') ??
    version.releaseAs?.[0],
)
let details = $derived.by((): Detail[] => {
  const codeDetails = [
    { isMonospace: true, label: m.source_version(), value: version.sourceVersion },
    ...(version.sourceSchemaVersion
      ? [
          {
            isMonospace: true,
            label: m.source_schema(),
            value: version.sourceSchemaVersion,
          },
        ]
      : []),
    {
      label: m.source_resource_type(),
      value: source.resourceTypes.join(', ') || m.api_release_unavailable(),
    },
    ...(source.subType ? [{ label: m.source_subtype(), value: source.subType }] : []),
    ...(version.releaseNotesUrl
      ? [
          {
            href: version.releaseNotesUrl,
            isExternal: true,
            label: m.source_upstream(),
            value: m.source_release_notes(),
          },
        ]
      : []),
  ]
  const rows: Detail[] = [
    {
      disclosure: codeDetails,
      isMonospace: true,
      label: m.source_code(),
      value: source.code,
    },
    {
      disclosure: [
        {
          label: m.api_release_domain(),
          value: primaryRelease?.domainCode ?? m.api_release_unavailable(),
          isMonospace: true,
        },
        {
          label: m.api_release_cohort(),
          value: primaryRelease?.cohortKey ?? m.api_release_unavailable(),
          isMonospace: true,
        },
        {
          label: m.api_release_revision(),
          value: String(primaryRelease?.revision ?? 0),
          isMonospace: true,
        },
        {
          label: m.api_release_version(),
          value: primaryRelease?.apiVersion ?? m.api_release_unavailable(),
          isMonospace: true,
        },
      ],
      isMonospace: true,
      label: m.source_release(),
      value: primaryRelease?.code ?? m.api_release_unavailable(),
    },
    {
      disclosure: [
        { label: m.source_ingested(), value: displayDate(version.ingestedAt) },
        { label: m.source_reference(), value: displayDate(version.publicationDate) },
        { label: m.source_last_revised(), value: displayDate(version.updatedAt) },
      ],
      label: m.source_published(),
      value: displayDate(version.publicationDate ?? version.ingestedAt),
    },
  ]
  return rows
})
let publisherLogo = $derived(
  source.publisherCode === 'overture'
    ? overtureLogo
    : source.publisherCode.startsWith('hkgov')
      ? hkgovLogo
      : source.publisherCode === 'dpang'
        ? dianapangLogo
        : overtureLogo,
)
let publisher = $derived(selectLocalisedRow(source.publisher?.publisherI18n, locale))
let publisherName = $derived(
  publisher?.name ?? source.publisher?.code ?? source.publisherCode,
)
let primaryLinks = $derived.by(() => {
  if (source.publisher?.contactUrl) {
    return [
      {
        href: source.publisher.contactUrl,
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
let secondaryLinks = $derived(
  source.sourceUrl
    ? [
        {
          href: source.sourceUrl,
          icon: 'ion:open-outline',
          isExternal: true,
          label: m.source_official_site(),
        },
      ]
    : [],
)

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
  <ReleaseHeader.Main title={name} {details} description={descriptionContent} />
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
    {statusLabel}
    {statusClass}
    {statusDotClass}
  />
  <ReleaseHeader.Content {main} {card} />
</ReleaseHeader.Root>
