<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Tooltip } from 'bits-ui'

import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  filteredCount: string
  infoDescription: string
  infoLabel: string
  totalCount: string
}

let { filteredCount, infoDescription, infoLabel, totalCount }: Props = $props()
</script>

<div class="flex flex-wrap items-start justify-between gap-4">
  <div>
    <p
      class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
    >
      {m.source_processing_actions()}
    </p>
    <h2 class="mt-1 font-display text-title-lg font-bold text-primary">
      {m.source_release_decisions()}
    </h2>
  </div>
  <div class="ml-auto flex items-center gap-4">
    <Tooltip.Root>
      <Tooltip.Trigger>
        <button
          class="inline-flex size-5 items-center justify-center rounded-full text-foreground-alt transition hover:bg-data-surface-container-high hover:text-data-primary"
          type="button"
          aria-label={infoLabel}
        >
          <Icon icon="proicons:info" class="size-3.5" aria-hidden="true" />
        </button>
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
    <p class="font-mono text-label-md font-bold tabular-nums text-primary">
      {filteredCount}
      / {totalCount}
    </p>
  </div>
</div>
