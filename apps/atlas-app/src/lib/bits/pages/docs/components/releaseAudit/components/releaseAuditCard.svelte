<script lang="ts">
import type { Snippet } from 'svelte'

type Props = { children?: Snippet }

let { children }: Props = $props()
</script>

<article
  class="overflow-hidden rounded-lg border border-data-outline-variant/60 bg-data-surface-container-low"
>
  {@render children?.()}
</article>
