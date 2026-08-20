<script lang="ts">
import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import { normaliseExternalUrl } from '#lib/externalUrl.js'
import { getPublisherLogo } from '#lib/registry/publisherLogo.js'
import type { RegistrySource } from '#lib/registry/types.js'

import * as DatasetCard from './components/publisherDatasetCard/index.js'
import {
  displayFrequency,
  displayRegistryValue,
  displayResourceTypes,
  displaySourceReleaseCode,
} from './publisherPresentation.js'
import type { PublisherDatasetFact } from './types.js'

type Props = {
  source: RegistrySource
  href: string
}

let { source, href }: Props = $props()
let locale = $derived(getCurrentLocale())
let dataset = $derived(selectLocalisedRow(source.datasetI18n, locale))
let sourceUrl = $derived(normaliseExternalUrl(source.sourceUrl))
let schemaUrl = $derived(normaliseExternalUrl(source.schemaURL))
let unavailable = 'N/A'
let latestRelease = $derived(source.sourceVersions?.[0])
let latestReleaseYear = $derived.by(() => {
  const latestReleaseDate =
    latestRelease?.publicationDate ??
    latestRelease?.ingestedAt ??
    latestRelease?.createdAt
  if (!latestReleaseDate) return null

  const year = new Date(latestReleaseDate).getFullYear()
  return Number.isNaN(year) ? null : String(year)
})
let latestReleaseCode = $derived(latestRelease?.code ?? unavailable)
let latestReleaseDisplayCode = $derived(
  latestRelease
    ? displaySourceReleaseCode(
        source.code,
        source.regionCode,
        source.publisherCode,
        latestRelease.code,
      )
    : unavailable,
)
let attribution = $derived(
  source.attribution && latestReleaseYear
    ? `${source.attribution} · ${latestReleaseYear}`
    : source.attribution,
)
let facts = $derived.by(() => {
  const rows: PublisherDatasetFact[] = [
    {
      label: 'LICENCE',
      value: source.license?.code ?? unavailable,
      href: source.license?.url ?? undefined,
      title: source.license?.name ?? source.license?.code ?? undefined,
    },
    {
      label: m.publishers_frequency(),
      value: displayFrequency(source.releaseFrequency),
    },
    {
      label: m.data_latest_release(),
      value: latestReleaseDisplayCode,
      title: latestReleaseCode,
    },
    {
      label: m.publishers_api_requests(),
      value: unavailable,
    },
    {
      label: m.publishers_downloads(),
      value: unavailable,
    },
  ]

  if (source.sourceVariant !== 'default') {
    rows.push({
      label: 'VARIANT',
      value: source.sourceVariant ?? unavailable,
      description: 'The provider or processing assertion represented by this dataset.',
      title: source.sourceVariant,
    })
  }

  if (source.subType) {
    rows.push({
      label: m.source_subtype(),
      value: displayRegistryValue(source.subType) ?? unavailable,
    })
  }

  if (source.category) {
    rows.push({
      label: 'CATEGORY',
      value: displayRegistryValue(source.category) ?? unavailable,
      description: 'A broad catalogue grouping for this dataset.',
      title: source.category,
    })
  }

  return rows
})
</script>

<DatasetCard.Root>
  <DatasetCard.Header
    {href}
    resourceType={displayResourceTypes(source.resourceTypes) || unavailable}
    region={displayRegistryValue(source.regionCode) ?? unavailable}
    title={dataset?.name ?? source.code}
    publisherLogo={getPublisherLogo(source.publisherCode)}
    releasesHref={href}
    releasesLabel={m.data_releases()}
    catalogueHref={sourceUrl}
    catalogueLabel={m.publishers_catalogue()}
    schemaHref={schemaUrl}
    schemaLabel={m.publishers_data_specification()}
  />
  <DatasetCard.Body description={dataset?.description ?? unavailable}>
    <DatasetCard.Facts {facts} />
  </DatasetCard.Body>
  <DatasetCard.Footer {attribution}>
    {#snippet actions()}
      <DatasetCard.Actions
        releasesHref={href}
        releasesLabel={m.data_releases()}
        catalogueHref={sourceUrl}
        catalogueLabel={m.publishers_catalogue()}
        schemaHref={schemaUrl}
        schemaLabel={m.publishers_data_specification()}
      />
    {/snippet}
  </DatasetCard.Footer>
</DatasetCard.Root>
