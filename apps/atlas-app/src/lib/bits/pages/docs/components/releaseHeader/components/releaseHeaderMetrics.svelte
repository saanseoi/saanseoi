<script lang="ts">
import { Tooltip } from 'bits-ui'

import type { ReleaseHeaderMetric } from './releaseHeaderMetric'

type Props = {
  metrics: ReleaseHeaderMetric[]
  class?: string
}

let { metrics, class: className = '' }: Props = $props()
</script>

<Tooltip.Provider delayDuration={200}>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <dl
          {...props}
          class={`flex flex-wrap gap-x-5 gap-y-3 ${className}`}
          title="All Time"
        >
          {#each metrics as metric}
            <div class="flex items-baseline gap-2">
              <dt
                class="font-body text-caption text-foreground-alt/70 shrink-0 font-semibold tracking-[0.12em] uppercase"
              >
                {metric.label}
              </dt>
              <dd class="text-label-sm text-primary font-mono font-semibold">
                {metric.value}
              </dd>
            </div>
          {/each}
        </dl>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content
        class="rounded-default border-border-card/60 bg-background-alt font-body text-label-sm text-foreground shadow-popover z-70 border px-3 py-2"
        side="top"
        sideOffset={8}
      >
        All Time
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
