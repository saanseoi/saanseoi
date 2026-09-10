<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

let {
  counts,
  label,
}: {
  counts: Record<string, number>
  label: (value: string) => string
} = $props()
</script>

{#if Object.keys(counts).length}
  <div class="space-y-2 border-t border-current/10 px-4 py-3">
    <p class="text-xs uppercase opacity-45">{m.source_audit_decisions()}</p>
    {#each Object.entries(counts) as [name, count]}
      <div class="flex flex-wrap justify-between gap-2">
        <span class="capitalize opacity-65">{label(name)}</span>
        <code class="rounded bg-emerald-500/10 px-1.5 text-emerald-500"
          >{count.toLocaleString()}</code
        >
      </div>
    {/each}
  </div>
{/if}
