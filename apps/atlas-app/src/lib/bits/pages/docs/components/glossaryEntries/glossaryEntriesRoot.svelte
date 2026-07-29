<script lang="ts">
import type { AppLocale } from '$lib/bits/internal/i18n'
import { m } from '$lib/bits/internal/i18n'
import type { MarkdownGlossaryEntry } from '$lib/registry/referenceDocs'

import GlossaryEntriesEmpty from './glossaryEntriesEmpty.svelte'
import GlossaryEntriesItem from './glossaryEntriesItem.svelte'

type Props = {
  entries: MarkdownGlossaryEntry[]
  locale: AppLocale
}

let { entries, locale }: Props = $props()
</script>

<section class="mt-10 grid gap-5 lg:grid-cols-2" aria-label={m.glossary_title()}>
  {#each entries as entry (entry.id)}
    <GlossaryEntriesItem {entry} {locale} />
  {:else}
    <GlossaryEntriesEmpty />
  {/each}
</section>
