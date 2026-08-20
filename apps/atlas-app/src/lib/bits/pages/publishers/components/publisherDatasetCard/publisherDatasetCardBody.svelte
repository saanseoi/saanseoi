<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  description: string
  children?: Snippet
}

let { description, children }: Props = $props()
</script>

<div class="bg-data-surface-container-low px-6 py-5 text-data-on-surface md:px-8">
  <p class="line-clamp-3 font-body text-body-md leading-7 text-data-on-surface-variant">
    {description}
  </p>

  {@render children?.()}
</div>
