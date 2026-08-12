<script lang="ts">
import type { ChurnMetricPresentation } from '../releaseStats.types'
let { metric }: { metric: ChurnMetricPresentation } = $props()
const styles = {
  added: ['border-data-success', 'bg-data-success'],
  changed: ['border-data-warning', 'bg-data-warning'],
  removed: ['border-data-error', 'bg-data-error'],
  unchanged: ['border-data-neutral', 'bg-data-neutral'],
} as const
</script>
<div
  class={`border-t-8 bg-data-surface-container-low px-5 py-5 ${styles[metric.key][0]}`}
>
  <div class="flex items-center gap-2">
    <span class={`size-2 rounded-full ${styles[metric.key][1]}`}></span>
    <p class="font-body text-label-sm text-foreground-alt">{metric.label}</p>
  </div>
  <p class="mt-3 font-mono text-title-lg font-bold tabular-nums text-primary">
    {metric.formattedValue}
  </p>
</div>
