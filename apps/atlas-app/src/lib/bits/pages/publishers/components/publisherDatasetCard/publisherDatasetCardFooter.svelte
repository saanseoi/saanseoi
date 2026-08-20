<script lang="ts">
import { scale } from 'svelte/transition'
import type { Snippet } from 'svelte'

import Icon from '#lib/bits/primitives/icon/icon.svelte'

type Props = {
  attribution?: string | null
  actions?: Snippet
}

let { attribution, actions }: Props = $props()
let isAttributionOpen = $state(false)
</script>

{#if attribution || actions}
  <footer
    class="border-t border-data-outline-variant/60 bg-white px-6 py-2.5 text-data-on-surface-variant md:px-8 dark:border-white/10 dark:bg-black dark:text-white/70"
  >
    {#if actions}
      <div class="-mx-6 mb-2.5 hidden border-b border-data-outline-variant/60 px-6 pb-2.5 max-[30rem]:block dark:border-white/10">
        {@render actions()}
      </div>
    {/if}

    {#if attribution}
      <div class="hidden max-[30rem]:block">
        {#if isAttributionOpen}
          <p
            class="mb-2 text-center font-body text-caption leading-5"
            transition:scale={{ duration: 180, start: 0.96 }}
          >
            {attribution}
          </p>
        {/if}
        <button
          class="mx-auto inline-flex min-h-8 items-center justify-center gap-2 rounded-default border border-data-outline-variant/70 px-3 font-body text-caption font-semibold transition-colors hover:bg-data-surface-container-low hover:text-data-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-data-primary"
          type="button"
          aria-expanded={isAttributionOpen}
          aria-label="Toggle copyright notice"
          onclick={() => (isAttributionOpen = !isAttributionOpen)}
        >
          <Icon icon="proicons:info" class="size-4 shrink-0" aria-hidden="true" />
          <span>Copyright</span>
          <Icon
            icon="material-symbols-light:expand-more-rounded"
            class={`size-4 shrink-0 transition-transform ${isAttributionOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
      <p class="text-center font-body text-caption leading-5 max-[30rem]:hidden">
        {attribution}
      </p>
    {/if}
  </footer>
{/if}
