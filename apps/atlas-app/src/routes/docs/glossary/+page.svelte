<script lang="ts">
import Icon from '@iconify/svelte'

import { GlossaryEntries, GlossaryHeader, Main, Seo } from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import {
  getMarkdownGlossaryEntries,
  getMarkdownTransclusionDisplayTitle,
} from '$lib/registry/referenceDocs'

let query = $state('')
let locale = $derived(getCurrentLocale())
let entries = $derived(getMarkdownGlossaryEntries(locale))

const normaliseForSearch = (value: string) =>
  value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()

let filteredEntries = $derived.by(() => {
  const term = normaliseForSearch(query.trim())
  if (!term) return entries

  return entries.filter(entry =>
    normaliseForSearch(
      `${getMarkdownTransclusionDisplayTitle(entry, locale)} ${entry.markdown}`,
    ).includes(term),
  )
})
let resultCount = $derived(
  m.glossary_result_count().replace('{count}', String(filteredEntries.length)),
)
</script>

<Seo title={m.glossary_title()} description={m.glossary_description()} />

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <div>
    <a
      href="/docs"
      class="inline-flex items-center gap-2 font-body text-label-md font-semibold uppercase tracking-[0.12em] text-secondary hover:text-primary"
    >
      <Icon icon="proicons:arrow-left" class="size-4" aria-hidden="true" />
      {m.glossary_api_docs()}
    </a>
    <GlossaryHeader.Root>
      <GlossaryHeader.Content />
      {#snippet actions()}
        <GlossaryHeader.Filter bind:query />
      {/snippet}
      {#snippet description()}
        <GlossaryHeader.Description />
      {/snippet}
      {#snippet meta()}
        <GlossaryHeader.ResultCount {resultCount} />
      {/snippet}
    </GlossaryHeader.Root>
  </div>

  <GlossaryEntries.Root entries={filteredEntries} {locale} />
</Main>
