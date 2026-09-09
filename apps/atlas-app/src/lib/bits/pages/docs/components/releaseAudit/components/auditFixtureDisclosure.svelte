<script lang="ts">
import type { Snippet } from 'svelte'
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
    <div class="mt-4 max-h-[640px] overflow-auto">{@render children()}</div>
  {/if}
</details>
