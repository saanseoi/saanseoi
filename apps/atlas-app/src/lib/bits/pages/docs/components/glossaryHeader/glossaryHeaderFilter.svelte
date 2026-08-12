<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '$lib/bits/internal/i18n'

type Props = {
  query?: string
}

let { query = $bindable('') }: Props = $props()
</script>

<div>
  <label for="glossary-filter" class="sr-only">
    {m.glossary_filter_label()}
  </label>
  <div class="relative">
    <Icon
      icon="proicons:search"
      class="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-secondary"
      aria-hidden="true"
    />
    <input
      id="glossary-filter"
      bind:value={query}
      type="search"
      placeholder={m.glossary_filter_placeholder()}
      class="w-full border border-border-card bg-background px-11 py-3 font-body text-body-md text-foreground outline-none transition placeholder:text-foreground-alt focus:border-secondary focus:ring-2 focus:ring-secondary/30"
    >
  </div>
</div>
