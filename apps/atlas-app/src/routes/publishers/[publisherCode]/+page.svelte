<script lang="ts">
import * as ReleaseHeader from '#lib/bits/pages/docs/components/releaseHeader/index.js'
import * as PublishersPage from '#lib/bits/pages/publishers/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import type {
  PublisherSort,
  PublisherSortDirection,
} from '#lib/bits/pages/publishers/components/publisherFilter/publisherFilterSort.js'
import { displaySourceReleaseCode } from '#lib/bits/pages/publishers/publisherPresentation.js'
import type { RegistrySource } from '#lib/registry/types.js'

let { data } = $props()
let publisherPageData = $derived(data.publisherPageData)
let locale = $derived(getCurrentLocale())
let publisher = $derived(
  selectLocalisedRow(publisherPageData.publisher.publisherI18n, locale),
)
let seoTitle = $derived(publisher?.name ?? publisherPageData.publisher.code)
let seoDescription = $derived(
  publisher?.description ?? `${m.source_publisher()}: ${seoTitle}.`,
)
let sourceSearch = $state('')
let sourceSort = $state<PublisherSort>('name')
let sourceSortDirection = $state<PublisherSortDirection>('ascending')
let sourceSearchQuery = $derived(sourceSearch.trim().toLocaleLowerCase(locale))
let filteredSources = $derived.by(() => {
  const sources = publisherPageData.sources.filter(source => {
    if (!sourceSearchQuery) return true
    const dataset = selectLocalisedRow(source.datasetI18n, locale)
    const sourcePublisher = selectLocalisedRow(source.publisher?.publisherI18n, locale)
    return [
      source.code,
      source.publisherCode,
      sourcePublisher?.name,
      dataset?.name,
      dataset?.description,
      source.releaseFrequency,
      source.regionCode,
      source.theme,
      source.category,
      source.license?.code,
      ...source.resourceTypes,
    ]
      .filter((value): value is string => Boolean(value))
      .some(value => value.toLocaleLowerCase(locale).includes(sourceSearchQuery))
  })

  const sourceName = (source: RegistrySource) =>
    selectLocalisedRow(source.datasetI18n, locale)?.name ?? source.code
  const latestReleaseDate = (source: RegistrySource) => {
    return Math.max(
      ...(source.sourceVersions ?? []).map(release =>
        new Date(
          release.publicationDate ?? release.ingestedAt ?? release.createdAt,
        ).getTime(),
      ),
      0,
    )
  }

  return [...sources].sort((left, right) => {
    if (sourceSort === 'latestRelease') {
      const difference = latestReleaseDate(left) - latestReleaseDate(right)
      return sourceSortDirection === 'ascending' ? difference : -difference
    }

    if (sourceSort === 'name') {
      const difference = sourceName(left).localeCompare(sourceName(right), locale)
      return sourceSortDirection === 'ascending' ? difference : -difference
    }

    // API request and download counts are currently N/A, so retain registry order.
    return 0
  })
})

let releases = $derived.by(() =>
  publisherPageData.sources
    .flatMap(source => source.sourceVersions ?? [])
    .sort(
      (left, right) =>
        new Date(
          right.publicationDate ?? right.ingestedAt ?? right.createdAt,
        ).getTime() -
        new Date(left.publicationDate ?? left.ingestedAt ?? left.createdAt).getTime(),
    ),
)
const unavailable = 'N/A'
let latestRelease = $derived(releases[0])
let lastPublishedRelease = $derived(
  releases.find(release => release.status === 'published'),
)
let latestReleaseSource = $derived(
  publisherPageData.sources.find(source =>
    source.sourceVersions?.some(release => release.code === latestRelease?.code),
  ),
)
let latestReleaseDisplayCode = $derived(
  latestRelease?.code && latestReleaseSource
    ? displaySourceReleaseCode(
        latestReleaseSource.code,
        latestReleaseSource.regionCode,
        latestReleaseSource.publisherCode,
        latestRelease.code,
      )
    : unavailable,
)

const displayDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(value))
    : unavailable

const sourceCountLabel = (count: number) =>
  (count === 1 ? m.publishers_dataset_count() : m.publishers_datasets_count()).replace(
    '{count}',
    String(count),
  )
</script>

<Seo title={seoTitle} description={seoDescription} />

<Main variant="page" class="py-8 md:py-10">
  <section
    class="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest dark:border-outline-variant"
  >
    <div
      class="border-b border-outline-variant/60 bg-surface-container-low px-6 py-3 dark:border-outline-variant md:px-8"
    >
      <p
        class="font-body text-caption font-semibold uppercase tracking-[0.14em] text-secondary"
      >
        {m.source_publisher()}
      </p>
    </div>

    <div
      class="grid gap-8 px-6 py-7 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10"
    >
      <div class="min-w-0">
        <h1
          class="font-display text-headline-lg font-bold text-primary md:text-display-sm"
        >
          {publisher?.name ?? publisherPageData.publisher.code}
        </h1>
        <PublishersPage.Detail.Traits sources={publisherPageData.sources} />
      </div>

      <ReleaseHeader.PublisherCardVariant
        publisher={publisherPageData.publisher}
        {locale}
        showTitle={false}
      />
    </div>

    <dl
      class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] items-start gap-x-8 gap-y-5 border-t border-outline-variant/60 px-6 py-6 font-body text-label-md dark:border-outline-variant md:px-8 min-[60rem]:grid-cols-[max-content_minmax(12rem,2fr)_repeat(3,max-content)] min-[70rem]:grid-cols-[repeat(6,minmax(max-content,1fr))] min-[70rem]:gap-x-10"
    >
      <div class="min-w-0 max-w-full">
        <dt
          class="text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt/70"
        >
          {m.source_code()}
        </dt>
        <dd class="mt-2 wrap-break-word font-mono text-sm font-semibold text-primary">
          {publisherPageData.publisher.code}
        </dd>
      </div>
      <div class="min-w-0 max-w-full">
        <dt
          class="text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt/70"
        >
          {m.data_latest_release()}
        </dt>
        <dd
          class="mt-2 break-words font-mono text-sm font-semibold text-primary"
          title={latestRelease?.code ?? unavailable}
        >
          {latestReleaseDisplayCode}
        </dd>
      </div>
      <div class="min-w-0 max-w-full">
        <dt
          class="text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt/70"
        >
          {m.publishers_last_published()}
        </dt>
        <dd class="mt-2 font-mono text-sm font-semibold text-primary">
          {displayDate(
            lastPublishedRelease?.publicationDate ??
              lastPublishedRelease?.ingestedAt ??
              lastPublishedRelease?.createdAt,
          )}
        </dd>
      </div>
      <div class="min-w-0 max-w-full">
        <dt
          class="text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt/70"
        >
          {m.source_contributions()}
        </dt>
        <dd class="mt-2 font-mono text-sm font-semibold text-primary">
          {publisherPageData.sources.length}
        </dd>
      </div>
      <div class="min-w-0 max-w-full">
        <dt
          class="text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt/70"
        >
          {m.publishers_api_requests()}
        </dt>
        <dd class="mt-2 font-mono text-sm font-semibold text-primary">
          N/A
        </dd>
      </div>
      <div class="min-w-0 max-w-full">
        <dt
          class="text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt/70"
        >
          {m.publishers_downloads()}
        </dt>
        <dd class="mt-2 font-mono text-sm font-semibold text-primary">
          N/A
        </dd>
      </div>
    </dl>
  </section>

  <section class="mt-10">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p
          class="font-body text-caption font-semibold uppercase tracking-[0.14em] text-secondary"
        >
          {m.source_contributions()}
        </p>
        <h2 class="mt-2 font-display text-headline-md font-bold text-primary">
          {m.sources_title()}
        </h2>
      </div>
      <div
        class="flex w-full flex-col items-end gap-3 sm:w-auto sm:flex-row sm:items-center"
      >
        <span class="font-mono text-label-sm whitespace-nowrap text-foreground-alt">
          {sourceCountLabel(filteredSources.length)}
        </span>
        <PublishersPage.Filter.Sort
          bind:direction={sourceSortDirection}
          bind:value={sourceSort}
        />
        <PublishersPage.Filter.Root
          bind:value={sourceSearch}
          label={m.sources_search()}
          placeholder={m.sources_search_placeholder()}
          clearLabel={m.sources_clear_search()}
          class="sm:w-72"
        />
      </div>
    </div>

    {#if filteredSources.length}
      <div class="mt-5 grid gap-5">
        {#each filteredSources as source (source.id)}
          <PublishersPage.DatasetCard href={`/sources/${source.code}`} {source} />
        {/each}
      </div>
    {:else}
      <p class="py-16 text-center font-body text-body-lg text-foreground-alt">
        {m.sources_search_empty()}
      </p>
    {/if}
  </section>
</Main>
