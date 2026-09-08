<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Tooltip } from 'bits-ui'

import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  filteredCount: string
  infoDescription: string
  infoLabel: string
  loading?: boolean
  totalCount: string
}

let {
  filteredCount,
  infoDescription,
  infoLabel,
  loading = false,
  totalCount,
}: Props = $props()
</script>

<div class="flex flex-wrap items-center justify-between gap-4">
  <div>
    <h2
      class="font-display text-headline-sm font-bold text-primary md:text-headline-md"
    >
      {m.source_audit_title()}
    </h2>
  </div>
  <div class="ml-auto flex items-center gap-4">
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="inline-flex size-5 items-center justify-center rounded-full text-foreground-alt transition hover:bg-data-surface-container-high hover:text-data-primary"
            type="button"
            aria-label={infoLabel}
          >
            <Icon icon="proicons:info" class="size-3.5" aria-hidden="true" />
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          class="z-70 max-w-64 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm text-foreground shadow-popover"
          side="top"
          sideOffset={8}
        >
          {infoDescription}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
    {#if loading}
      <span
        class="h-4 w-14 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
        aria-hidden="true"
      ></span>
      <span class="sr-only">{m.source_audit_loading_count()}</span>
    {:else}
      <p class="font-mono text-label-md tabular-nums text-foreground-alt">
        {filteredCount}
        / {totalCount}
      </p>
    {/if}
  </div>
</div>
