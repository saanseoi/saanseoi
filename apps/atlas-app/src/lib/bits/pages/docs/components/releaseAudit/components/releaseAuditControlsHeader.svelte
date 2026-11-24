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
let resolved = $state(false)
$effect(() => {
  if (!loading) resolved = true
})
</script>

<div class="flex flex-wrap items-center justify-between gap-4">
  <div>
    <h2
      class="font-display text-headline-sm text-primary md:text-headline-md font-bold"
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
            class="text-foreground-alt hover:bg-data-surface-container-high hover:text-data-primary inline-flex size-5 items-center justify-center rounded-full transition"
            type="button"
            aria-label={infoLabel}
          >
            <Icon icon="proicons:info" class="size-3.5" aria-hidden="true" />
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          class="rounded-default border-border-card/60 bg-background-alt font-body text-label-sm text-foreground shadow-popover z-70 max-w-64 border px-3 py-2"
          side="top"
          sideOffset={8}
        >
          {infoDescription}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
    {#if loading && !resolved}
      <span
        class="bg-data-surface-container-high h-4 w-14 rounded-full motion-safe:animate-pulse"
        aria-hidden="true"
      ></span>
      <span class="sr-only">{m.source_audit_loading_count()}</span>
    {:else}
      <p
        class="text-label-md text-foreground-alt font-mono tabular-nums"
        aria-busy={loading}
      >
        {filteredCount}
        / {totalCount}
      </p>
    {/if}
  </div>
</div>
