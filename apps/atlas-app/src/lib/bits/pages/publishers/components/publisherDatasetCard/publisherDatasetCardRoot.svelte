<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
}

let { children }: Props = $props()
</script>

<article
  class="group overflow-hidden rounded-lg border border-data-outline-variant/70 bg-data-surface-container-low text-data-on-surface transition-colors hover:border-data-primary dark:border-data-outline-variant"
>
  {@render children?.()}
</article>
