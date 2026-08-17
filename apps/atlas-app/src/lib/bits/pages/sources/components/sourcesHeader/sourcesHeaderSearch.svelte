<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { m } from '#lib/bits/internal/i18n.js'

type Props = { query?: string }

let { query = $bindable('') }: Props = $props()

const clearQuery = () => {
  query = ''
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !query) return
  event.preventDefault()
  clearQuery()
}
</script>

<label class="relative block w-full min-w-60 sm:w-80">
  <span class="sr-only">{m.sources_search()}</span>
  <Icon
    icon="proicons:search"
    class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-alt"
    aria-hidden="true"
  />
  <input
    bind:value={query}
    class="h-10 w-full rounded-default border border-outline-variant bg-background-alt py-2 pr-10 pl-9 font-body text-label-md text-primary outline-none transition placeholder:text-foreground-alt focus:border-secondary"
    placeholder={m.sources_search_placeholder()}
    type="search"
    onkeydown={handleKeydown}
  >
  {#if query}
    <button
      class="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-foreground-alt transition hover:bg-surface-container-high hover:text-primary"
      type="button"
      aria-label={m.sources_clear_search()}
      onclick={clearQuery}
    >
      <Icon icon="ion:close-outline" class="size-4" aria-hidden="true" />
    </button>
  {/if}
</label>
