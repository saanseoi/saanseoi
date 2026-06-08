<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<div class={`min-h-screen bg-background text-foreground ${className}`}>
  {@render children?.()}
</div>
