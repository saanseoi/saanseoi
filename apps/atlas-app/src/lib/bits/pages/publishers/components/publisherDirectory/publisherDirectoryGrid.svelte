<script lang="ts">
import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'

import * as PublisherFilter from '../publisherFilter/index.js'
import PublisherCard from './publisherDirectoryCard.svelte'
import type { PublisherDirectoryItem } from '../../types.js'

type Props = {
  publishers: PublisherDirectoryItem[]
}

let { publishers }: Props = $props()
let locale = $derived(getCurrentLocale())
let search = $state('')
let searchQuery = $derived(search.trim().toLocaleLowerCase(locale))
let filteredPublishers = $derived(
  publishers.filter(publisher => {
    if (!searchQuery) return true
    const row = selectLocalisedRow(publisher.publisherI18n, locale)
    return [publisher.code, row?.name, row?.description]
      .filter((value): value is string => Boolean(value))
      .some(value => value.toLocaleLowerCase(locale).includes(searchQuery))
  }),
)
</script>

<div class="mt-5 flex justify-start">
  <PublisherFilter.Root
    bind:value={search}
    label={m.publishers_search()}
    placeholder={m.publishers_search_placeholder()}
    clearLabel={m.publishers_clear_search()}
  />
</div>

{#if filteredPublishers.length}
  <div class="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each filteredPublishers as publisher (publisher.id)}
      <PublisherCard {publisher} />
    {/each}
  </div>
{:else}
  <p class="py-16 text-center font-body text-body-lg text-foreground-alt">
    {m.publishers_search_empty()}
  </p>
{/if}
