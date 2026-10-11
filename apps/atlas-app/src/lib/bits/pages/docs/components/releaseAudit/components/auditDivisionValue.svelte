<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { auditLabel, decodeAuditValue } from './auditDivisionPresentation'
let { value }: { value: Json } = $props()
let decoded = $derived(decodeAuditValue(value))
</script>

{#snippet render(
  item: Json,
  depth: number,
)}
  {#if item === null}
    <span class="opacity-40">—</span>
  {:else if Array.isArray(item)}
    {#if item.length === 0}
      <span class="opacity-40">None</span>
    {:else if item.every(child => child === null || typeof child !== 'object')}
      <span class="wrap-break-word">{item.join(', ')}</span>
    {:else}
      <div class="space-y-3">
        {#each item as child}
          <div class="border-l border-current/15 pl-3">
            {@render render(child, depth + 1)}
          </div>
        {/each}
      </div>
    {/if}
  {:else if typeof item === 'object' &&
    typeof item.name === 'string' &&
    ('class' in item || 'locale' in item || 'subtype' in item)}
    <div class="space-y-1">
      <p>
        <span class="mr-2 text-xs opacity-45"
          >{String(item.locale ?? item.class ?? item.subtype)}</span
        ><span class="font-medium">{item.name}</span>
      </p>
      <details>
        <summary class="cursor-pointer text-xs opacity-40">Record details</summary>
        <pre
          class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs"
        >{JSON.stringify(item, null, 2)}</pre>
      </details>
    </div>
  {:else if typeof item === 'object'}
    <div class="space-y-3">
      {#each Object.entries(item) as [key, child]}
        {#if key === 'coordinates' || depth > 3}
          <details class="min-w-0">
            <summary class="cursor-pointer text-xs capitalize opacity-60">
              {auditLabel(key)}
            </summary>
            <pre
              class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs"
            >{JSON.stringify(child, null, 2)}</pre>
          </details>
        {:else}
          <div class="min-w-0">
            <p class="mb-1 text-xs capitalize opacity-50">{auditLabel(key)}</p>
            {@render render(child, depth + 1)}
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <span class="whitespace-pre-wrap wrap-anywhere">{String(item)}</span>
  {/if}
{/snippet}
{@render render(decoded, 0)}
