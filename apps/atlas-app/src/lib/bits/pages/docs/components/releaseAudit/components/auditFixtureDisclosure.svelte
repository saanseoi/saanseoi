<script lang="ts">
import type { Snippet } from 'svelte'
import ScrollArea from './auditScrollArea.svelte'
let {
  open = $bindable(false),
  summary,
  children,
}: { open?: boolean; summary: Snippet; children: Snippet } = $props()
</script>

<details class="px-4 py-3" bind:open>
  <summary class="cursor-pointer pr-12 text-sm font-medium">
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
