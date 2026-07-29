<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<section
  class={`overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest dark:border-outline-variant ${className}`}
>
  {@render children?.()}
</section>
