<script lang="ts">
import InfoTooltip from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsInfoTooltip.svelte'
import { Tooltip } from 'bits-ui'

import type { PublisherDatasetFact } from '../../types.js'

type Props = {
  facts: PublisherDatasetFact[]
}

let { facts }: Props = $props()
</script>

<Tooltip.Provider delayDuration={200}>
  <dl
    class="mt-5 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] items-start gap-x-5 gap-y-5 border-t border-data-outline-variant/60 pt-4 font-body text-label-sm dark:border-data-outline-variant min-[60rem]:grid-cols-[repeat(5,minmax(max-content,1fr))] min-[70rem]:grid-cols-[repeat(6,minmax(max-content,1fr))]"
  >
    {#each facts as fact}
      <div class="min-w-0 max-w-full">
        <dt
          class="flex items-center gap-1.5 text-caption font-semibold tracking-[0.12em] uppercase text-data-on-surface-variant"
        >
          {fact.label}
          {#if fact.description}
            <InfoTooltip label={`About ${fact.label}`} description={fact.description} />
          {/if}
        </dt>
        <dd
          class="mt-2 whitespace-normal wrap-break-word font-mono text-sm font-semibold text-data-on-surface"
          title={fact.title}
        >
          {#if fact.href}
            <a
              class="text-data-primary underline decoration-data-primary/40 underline-offset-4 hover:text-data-on-primary-container"
              href={fact.href}
              target="_blank"
              rel="noopener noreferrer"
              >{fact.value}</a
            >
          {:else}
            {fact.value}
          {/if}
        </dd>
      </div>
    {/each}
  </dl>
</Tooltip.Provider>
