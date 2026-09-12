<script lang="ts">
import type { Json } from '@repo/core/provenance'
import type { Polygon, MultiPolygon } from 'geojson'
import ExclusionMap from './auditExclusionMap.svelte'
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
      {#if key !== 'exclusion'}
        <dt class="mb-1 text-xs uppercase tracking-wide opacity-40">
          {label(key)}
        </dt>
      {/if}
      <dd>
        {#if key === 'exclusion' && item && typeof item === 'object' && !Array.isArray(item) && (item.type === 'Polygon' || item.type === 'MultiPolygon') && Array.isArray(item.coordinates)}
          <ExclusionMap geometry={item as unknown as Polygon | MultiPolygon} />
        {:else}
          {@render value(item)}
        {/if}
      </dd>
    </div>
  {/each}
</dl>
