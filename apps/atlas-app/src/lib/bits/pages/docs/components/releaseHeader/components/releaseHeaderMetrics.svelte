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
                class="shrink-0 font-body text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt/70"
              >
                {metric.label}
              </dt>
              <dd class="font-mono text-label-sm font-semibold text-primary">
                {metric.value}
              </dd>
            </div>
          {/each}
        </dl>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content
        class="z-70 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm text-foreground shadow-popover"
        side="top"
        sideOffset={8}
      >
        All Time
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
