<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { Main } from '#lib/bits/primitives/main/index.js'
import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import type { RegistrySource } from '#lib/registry/types.js'

let { data } = $props()
let publisherPageData = $derived(data.publisherPageData)
let locale = $derived(getCurrentLocale())
let publisher = $derived(
  selectLocalisedRow(publisherPageData.publisher.publisherI18n, locale),
)

const sourceHref = (source: RegistrySource) => {
  const latestVersion = source.sourceVersions?.[0]
  return latestVersion
    ? `/sources/${source.code}/${latestVersion.code}`
    : `/sources/${source.code}`
}
</script>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8">
  <section
    class="rounded-xl border border-outline-variant bg-surface-container-lowest p-7 md:p-8"
  >
    <p
      class="font-body text-caption font-semibold uppercase tracking-[0.14em] text-secondary"
    >
      {m.source_publisher()}
    </p>
    <div class="mt-3 flex flex-wrap items-end justify-between gap-5">
      <div>
        <h1
          class="font-display text-headline-lg font-bold text-primary md:text-display-sm"
        >
          {publisher?.name ?? publisherPageData.publisher.code}
        </h1>
        {#if publisher?.description}
          <p
            class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
          >
            {publisher.description}
          </p>
        {/if}
      </div>
      {#if publisherPageData.publisher.url}
        <a
          class="inline-flex items-center gap-1 rounded-full border border-outline-variant px-4 py-2 font-body text-label-md font-semibold text-primary hover:border-secondary hover:text-secondary"
          href={publisherPageData.publisher.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {m.source_publisher_website()}
          <Icon icon="ion:open-outline" class="size-4" aria-hidden="true" />
        </a>
      {/if}
    </div>
  </section>

  <section class="mt-10">
    <p
      class="font-body text-caption font-semibold uppercase tracking-[0.14em] text-secondary"
    >
      {m.source_contributions()}
    </p>
    <div class="mt-4 grid gap-3 md:grid-cols-2">
      {#each publisherPageData.sources as source}
        <a
          class="rounded-lg border border-outline-variant bg-surface-container-lowest p-5 transition hover:-translate-y-0.5 hover:border-secondary"
          href={sourceHref(source)}
        >
          <p class="font-mono text-label-sm text-foreground-alt">{source.code}</p>
          <h2 class="mt-2 font-display text-xl font-bold text-primary">
            {selectLocalisedRow(source.datasetI18n, locale)?.name ?? source.code}
          </h2>
          <p class="mt-2 font-body text-label-md text-foreground-alt">
            {source.releaseFrequency}
            · {source.releaseType}
          </p>
        </a>
      {/each}
    </div>
  </section>
</Main>
