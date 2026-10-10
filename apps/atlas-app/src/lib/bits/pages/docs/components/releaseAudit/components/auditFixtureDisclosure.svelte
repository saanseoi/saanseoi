<script lang="ts">
import type { Snippet } from 'svelte'
import ScrollArea from './auditScrollArea.svelte'
let {
  open = $bindable(false),
  summary,
  children,
  prominent = false,
}: {
  open?: boolean
  summary: Snippet
  children: Snippet
  prominent?: boolean
} = $props()
</script>

<details class={prominent ? 'px-4 py-5' : 'px-4 py-3'} bind:open>
  <summary
    class={`cursor-pointer pr-12 font-medium ${prominent ? 'text-base' : 'text-sm'}`}
  >
    {@render summary()}
  </summary>
  {#if open}
    <ScrollArea containerClass="mt-4" viewportClass="max-h-[640px] overflow-auto">
      {#snippet children()}
        {@render children()}
      {/snippet}
    </ScrollArea>
  {/if}
</details>
