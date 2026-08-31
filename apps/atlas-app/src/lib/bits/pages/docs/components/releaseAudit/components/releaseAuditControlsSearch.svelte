<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  loadError?: boolean
  onRetry?: () => void
  query?: string
}

let { loadError = false, onRetry, query = $bindable('') }: Props = $props()

function clearQuery() {
  query = ''
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !query) return
  event.preventDefault()
  clearQuery()
}
</script>

<label class="relative mt-5 block">
  <span class="sr-only">{m.source_audit_search()}</span>
  <Icon
    icon="proicons:search"
    class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-alt"
    aria-hidden="true"
  />
  <input
    bind:value={query}
    class="h-10 w-full rounded-default border border-data-outline-variant bg-data-surface-container-low py-2 pr-10 pl-9 font-body text-label-md text-primary outline-none transition placeholder:text-foreground-alt focus:border-data-primary"
    placeholder={m.source_audit_search_placeholder()}
    type="search"
    onkeydown={handleKeydown}
  >
  {#if query}
    <button
      class="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-foreground-alt transition hover:bg-data-surface-container-high hover:text-primary"
      type="button"
      aria-label={m.source_audit_clear_search()}
      onclick={clearQuery}
    >
      <Icon icon="ion:close-outline" class="size-4" aria-hidden="true" />
    </button>
  {/if}
</label>

{#if loadError}
  <div
    class="mt-3 flex flex-wrap items-center justify-between gap-3 font-body text-label-sm text-data-danger"
    role="alert"
  >
    <p>{m.source_audit_load_records_error()}</p>
    {#if onRetry}
      <button
        class="cursor-pointer font-semibold text-data-primary underline underline-offset-4"
        type="button"
        onclick={onRetry}
      >
        {m.source_retry()}
      </button>
    {/if}
  </div>
{/if}
