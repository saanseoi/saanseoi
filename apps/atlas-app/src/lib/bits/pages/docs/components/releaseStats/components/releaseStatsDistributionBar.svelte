<script lang="ts">
let {
  row,
  maxVolume,
  ariaLabel,
}: {
  row: { added: number; changed: number; removed: number; unchanged: number }
  maxVolume: number
  ariaLabel: string
} = $props()
const segments = $derived([
  { tone: 'bg-data-success', value: row.added },
  { tone: 'bg-data-warning', value: row.changed },
  { tone: 'bg-data-error', value: row.removed },
  { tone: 'bg-data-neutral', value: row.unchanged },
])
</script>
<div class="flex h-5 overflow-hidden bg-data-track" role="img" aria-label={ariaLabel}>
  {#each segments as segment}
    {#if segment.value}
      <span
        class={segment.tone}
        style={`width: ${(segment.value / maxVolume) * 100}%`}
      ></span>
    {/if}
  {/each}
</div>
