<script lang="ts">
import type { Derivation } from '@repo/db/fieldLineageExplanation'
let { value }: { value: Derivation } = $props()
const operations = {
  'decode-json': 'Decode stored value',
  'encode-json': 'Encode for import',
  bounds: 'Calculate bounding box',
  'geometry-collection': 'Combine geometries',
}
</script>
{#snippet expression(
  item: Derivation,
)}
  {#if item.kind === 'choice'}
    <div class="space-y-2">
      <p class="text-xs font-semibold text-foreground/60">First applicable path</p>
      <ol class="ml-2 border-l border-primary/30 pl-3">
        {#each item.branches as branch, i}
          <li class="relative pb-3 last:pb-0">
            <span class="absolute -left-3 top-3 w-2 border-t border-primary/30"></span>
            <div class="rounded-lg border border-foreground/15 p-3">
              <p class="mb-2 text-xs text-foreground/65">
                {i ? 'Otherwise, if' : 'If'}
                <code class="font-semibold text-primary">{branch.when.input}</code>
                {branch.when.test === 'present' ? 'is present' : 'is not empty'}
              </p>
              {@render expression(branch.value)}
            </div>
          </li>
        {/each}
        <li class="rounded-lg border border-foreground/15 p-3">
          <p class="mb-2 text-xs text-foreground/65">Otherwise</p>
          {@render expression(item.otherwise)}
        </li>
      </ol>
    </div>
  {:else if item.kind === 'fallback'}
    {#if item.otherwise.kind === 'literal' && item.otherwise.value === null}
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        {@render expression(item.value)}
        <span class="text-xs text-foreground/50">· null if missing</span>
      </div>
    {:else}
      {@render expression(item.value)}
      <div class="ml-2 border-l border-primary/30 py-2 pl-3">
        <p class="mb-2 text-xs font-semibold text-foreground/60">
          If the result is missing
        </p>
        {@render expression(item.otherwise)}
      </div>
    {/if}
  {:else if item.kind === 'operation'}
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="text-sm font-medium">{operations[item.operation]}</span>
      <span aria-label="from" class="text-foreground/40">←</span>
      {@render expression(item.input)}
    </div>
  {:else if item.kind === 'read'}
    <code class="text-xs text-foreground/75 [overflow-wrap:anywhere]">{item.path}</code>
  {:else}
    <span class="text-sm"
      >{item.value === null ? 'Return null' : String(item.value)}</span
    >
  {/if}
{/snippet}
<div class="min-w-0 [overflow-wrap:anywhere]">{@render expression(value)}</div>
