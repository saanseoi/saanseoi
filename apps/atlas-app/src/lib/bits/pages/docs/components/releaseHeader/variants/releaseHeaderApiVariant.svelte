<script lang="ts">
import { m, type AppLocale } from '$lib/bits/internal/i18n'
import type { ApiRelease, RegistryApi } from '$lib/registry/types'

import * as ReleaseHeader from '../components'

type Props = {
  api: RegistryApi
  release: ApiRelease
  locale: AppLocale
}

let { api, release, locale }: Props = $props()

const displayDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(value))
    : m.api_release_unavailable()

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
let details = $derived([
  { label: m.api_release_version(), value: api.version },
  { label: m.api_release_status(), value: api.status },
  { isMonospace: true, label: m.api_release_release(), value: release.code },
  { isMonospace: true, label: m.api_release_schema(), value: release.schemaVersion },
  {
    isMonospace: true,
    label: m.api_release_ingestion_date(),
    value: displayDate(release.ingestedAt),
  },
])
</script>

{#snippet main()}
  <ReleaseHeader.Main title={api.familyType} {details} />
{/snippet}

<ReleaseHeader.Root>
  <ReleaseHeader.Header
    label={m.common_api()}
    {statusLabel}
    {statusClass}
    {statusDotClass}
  />
  <ReleaseHeader.Content {main} />
</ReleaseHeader.Root>
