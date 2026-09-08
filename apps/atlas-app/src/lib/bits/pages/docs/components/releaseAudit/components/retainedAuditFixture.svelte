<script lang="ts">
import type { Json } from '@repo/core/provenance'
let { value }: { value: Json } = $props()
const label = (key: string) =>
  key.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll(/[_-]/g, ' ')
</script>

{#snippet render(item: Json)}
  {#if Array.isArray(item)}
    <ul class="space-y-3">
      {#each item as entry}
        <li class="border-l border-current/15 pl-3">{@render render(entry)}</li>
      {/each}
    </ul>
  {:else if item !== null && typeof item === 'object'}
    <dl class="grid grid-cols-[minmax(7rem,1fr)_minmax(0,3fr)] gap-x-4 gap-y-2 text-sm">
      {#each Object.entries(item) as [key, child]}
        <dt class="font-medium capitalize opacity-65">{label(key)}</dt>
        <dd class="min-w-0 break-words">{@render render(child)}</dd>
      {/each}
    </dl>
  {:else}
    <span>{item === null ? '—' : String(item)}</span>
  {/if}
{/snippet}

{@render render(value)}
