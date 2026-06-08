<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<main class={className}>
  {@render children?.()}
</main>
