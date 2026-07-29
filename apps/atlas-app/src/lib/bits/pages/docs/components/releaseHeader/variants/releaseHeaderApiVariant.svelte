<script lang="ts">
import { m, selectLocalisedRow, type AppLocale } from '$lib/bits/internal/i18n'
import { getApiFamilyTheme } from '$lib/registry/apiFamilyTheme'
import type { ApiRelease, RegistryApi } from '$lib/registry/types'

import * as ReleaseHeader from '../components'

type Props = {
  api: RegistryApi
  release: ApiRelease
  locale: AppLocale
}

let { api, release, locale }: Props = $props()

const displayDate = (value?: string | null) =>
  value?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? m.api_release_unavailable()

let displayStatus = $derived(release.displayStatus ?? release.status)
let statusClass = $derived(
  displayStatus === 'current'
    ? 'border-data-success/70 bg-data-success-container text-data-on-primary-container dark:border-data-success/60 dark:bg-data-success-container dark:text-data-on-primary-container'
    : displayStatus === 'revised'
      ? 'border-blue-600/70 bg-blue-100 text-blue-800 dark:border-blue-400/70 dark:bg-blue-950 dark:text-blue-200'
      : 'border-outline-variant bg-surface-container-high text-primary',
)
let statusDotClass = $derived(
  displayStatus === 'revised'
    ? 'bg-blue-400 shadow-[0_0_0.4rem_rgb(96_165_250/0.8)]'
    : 'bg-data-success shadow-[0_0_0.4rem_rgb(75_220_172/0.8)]',
)
let statusLabel = $derived(
  displayStatus === 'current'
    ? m.api_release_current()
    : displayStatus === 'revised'
      ? m.api_release_revised()
      : m.api_release_superseded(),
)
let theme = $derived(getApiFamilyTheme(api.familyType))
let domainLabel = $derived(release.domainCode ?? 'default')
let regionLabel = $derived(
  release.regionCode === 'hk' || !release.regionCode ? 'Hong Kong' : release.regionCode,
)
let catalogueRevision = $derived(
  api.apiCatalogRevisions?.find(revision =>
    revision.releases.some(item => item.apiReleaseSetId === release.id),
  ),
)
let effectiveDate = $derived(
  displayDate(release.cohortKey?.match(/\d{4}-\d{2}-\d{2}/)?.[0]),
)
let lastRevisedDate = $derived(
  displayDate(
    release.revision ? (release.publishedAt ?? release.updatedAt) : release.publishedAt,
  ),
)
let versionDetails = $derived([
  {
    label: m.api_release_schema(),
    value: release.schemaVersion,
    isMonospace: true,
  },
  {
    label: m.api_release_ruleset(),
    value: release.rulesetVersion,
    isMonospace: true,
  },
  ...(catalogueRevision
    ? [
        {
          label: m.api_release_catalogue_revision(),
          value: catalogueRevision.code,
          isMonospace: true,
        },
      ]
    : []),
])
let composition = $derived(
  api.apiComposition
    ?.filter(item => item.status === 'current')
    .sort((left, right) => right.version - left.version)[0],
)
let scopeDescription = $derived(
  selectLocalisedRow(composition?.i18n?.[release.domainCode ?? 'default'], locale)
    ?.description,
)
let details = $derived([
  {
    disclosure: [
      {
        label: m.api_release_ingestion_date(),
        value: displayDate(release.ingestedAt),
        isMonospace: true,
      },
      {
        label: m.api_release_effective_date(),
        value: effectiveDate,
        isMonospace: true,
      },
      {
        label: m.api_release_last_revised(),
        value: lastRevisedDate,
        isMonospace: true,
      },
    ],
    isMonospace: true,
    label: m.api_release_published_data(),
    value: displayDate(release.publishedAt),
  },
  {
    disclosure: [
      { label: m.api_release_domain(), value: domainLabel, isMonospace: true },
      {
        label: m.api_release_cohort(),
        value: release.cohortKey ?? m.api_release_unavailable(),
        isMonospace: true,
      },
      {
        label: m.api_release_revision(),
        value: String(release.revision ?? 0),
        isMonospace: true,
      },
    ],
    isMonospace: true,
    label: m.api_release_release(),
    value: release.code,
  },
  {
    disclosure: versionDetails,
    label: m.api_release_version(),
    value: api.version,
  },
])
</script>

{#snippet main()}
  <ReleaseHeader.Main
    title={api.familyType}
    region={regionLabel}
    {details}
    {description}
  />
{/snippet}

{#snippet description()}
  {#if scopeDescription}
    <p class="mt-3 max-w-2xl font-body text-body-sm leading-6 text-foreground-alt">
      {scopeDescription}
    </p>
  {/if}
{/snippet}

<ReleaseHeader.Root backgroundImage={theme?.image}>
  <ReleaseHeader.Header
    label={`${m.common_api()} · ${m.api_release_domain()} · ${domainLabel}`}
    {statusLabel}
    {statusClass}
    {statusDotClass}
    showBackground
  />
  <ReleaseHeader.Content {main} showBackground />
</ReleaseHeader.Root>
