<script lang="ts">
import type { Snippet } from 'svelte'

let { id, children }: { id: string; children?: Snippet } = $props()
</script>

<a
  href={`#${id}`}
  class="source-heading-anchor group relative block text-inherit no-underline"
>
  <span
    aria-hidden="true"
    class="pointer-events-none absolute -left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >#</span
  >
  {@render children?.()}
</a>
