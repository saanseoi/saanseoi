<script lang="ts">
import type { Json } from '@repo/core/provenance'
let { parameters }: { parameters: Record<string, Json> } = $props()
const label = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
</script>
{#snippet value(item: Json)}
  {#if Array.isArray(item)}
    <div class="space-y-1">
      {#each item as entry}
        <div>{@render value(entry)}</div>
      {/each}
    </div>
  {:else if item !== null && typeof item === 'object'}
    <dl class="space-y-2">
      {#each Object.entries(item) as [key, child]}
        <div>
          <dt class="text-xs opacity-45">{label(key)}</dt>
          <dd>{@render value(child)}</dd>
        </div>
      {/each}
    </dl>
  {:else}
    <code class="break-all text-xs text-emerald-500"
      >{item === null ? '—' : String(item)}</code
    >
  {/if}
{/snippet}
<dl class="space-y-4">
  {#each Object.entries(parameters) as [key, item]}
    <div>
      <dt class="mb-1 text-xs uppercase tracking-wide opacity-40">{label(key)}</dt>
      <dd>{@render value(item)}</dd>
    </div>
  {/each}
</dl>
