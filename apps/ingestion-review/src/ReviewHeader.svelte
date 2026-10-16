<script lang="ts">
import type { Snippet } from 'svelte'
let { children }: { children: Snippet } = $props()
</script>

<header
  class="sticky top-0 z-30 space-y-4 border-b border-outline-variant bg-surface/95 pt-5 pb-4 backdrop-blur-md"
>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <a
      href="/"
      class="text-sm font-semibold tracking-tight text-foreground-alt hover:text-foreground"
      >SaanSeoi</a
    >
    <span class="h-4 w-px bg-outline-variant" aria-hidden="true"></span>
    <h1 class="text-xl font-semibold tracking-tight">Data ingestion review</h1>
    <span
      class="rounded-full border border-outline-variant px-2 py-0.5 text-xs text-foreground-alt"
      >Local database</span
    >
  </div>
  {@render children()}
</header>
