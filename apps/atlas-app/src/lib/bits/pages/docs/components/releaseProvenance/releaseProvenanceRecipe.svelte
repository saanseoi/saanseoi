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
{#snippet expression(item: Derivation)}
  {#if item.kind === 'choice'}
    <div class="space-y-2">
      <p class="text-foreground/60 text-xs font-semibold">First applicable path</p>
      <ol class="border-primary/30 ml-2 border-l pl-3">
        {#each item.branches as branch, i}
          <li class="relative pb-3 last:pb-0">
            <span class="border-primary/30 absolute top-3 -left-3 w-2 border-t"></span>
            <div class="border-foreground/15 rounded-lg border p-3">
              <p class="text-foreground/65 mb-2 text-xs">
                {i ? 'Otherwise, if' : 'If'}
                <code class="text-primary font-semibold">{branch.when.input}</code>
                {branch.when.test === 'present' ? 'is present' : 'is not empty'}
              </p>
              {@render expression(branch.value)}
            </div>
          </li>
        {/each}
        <li class="border-foreground/15 rounded-lg border p-3">
          <p class="text-foreground/65 mb-2 text-xs">Otherwise</p>
          {@render expression(item.otherwise)}
        </li>
      </ol>
    </div>
  {:else if item.kind === 'fallback'}
    {#if item.otherwise.kind === 'literal' && item.otherwise.value === null}
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        {@render expression(item.value)}
        <span class="text-foreground/50 text-xs">· null if missing</span>
      </div>
    {:else}
      {@render expression(item.value)}
      <div class="border-primary/30 ml-2 border-l py-2 pl-3">
        <p class="text-foreground/60 mb-2 text-xs font-semibold">
          If the result is missing
        </p>
        {@render expression(item.otherwise)}
      </div>
    {/if}
  {:else if item.kind === 'operation'}
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="text-sm font-medium">{operations[item.operation]}</span>
      <span class="sr-only">from</span>
      <span aria-hidden="true" class="text-foreground/40">←</span>
      {@render expression(item.input)}
    </div>
  {:else if item.kind === 'read'}
    <code class="text-foreground/75 text-xs wrap-anywhere">{item.path}</code>
  {:else}
    <span class="text-sm"
      >{item.value === null ? 'Return null' : String(item.value)}</span
    >
  {/if}
{/snippet}
<div class="min-w-0 wrap-anywhere">{@render expression(value)}</div>
