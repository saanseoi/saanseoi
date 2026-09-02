<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<p class={`font-body text-body-sm leading-6 text-foreground-alt ${className}`}>
  {@render children()}
</p>
