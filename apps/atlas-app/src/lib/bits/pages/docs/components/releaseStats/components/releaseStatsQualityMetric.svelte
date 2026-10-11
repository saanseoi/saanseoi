<script lang="ts">
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
let { measure }: { measure: { label: string; description: string; value: string } } =
  $props()
</script>
<div
  class="min-w-0 border-l-4 border-data-alert/70 bg-data-surface-container-lowest px-4 py-3"
>
  <div class="flex items-start justify-between gap-2">
    <p
      class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-alert"
    >
      {measure.label}
    </p>
    <InfoTooltip label={measure.label} description={measure.description} />
  </div>
  <p class="mt-3 font-mono text-title-lg font-bold tabular-nums text-data-alert">
    {measure.value}
  </p>
</div>
