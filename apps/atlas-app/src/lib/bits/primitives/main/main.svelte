<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
  style?: string
}

let { children, class: className = '', style = '' }: Props = $props()
</script>

<main class={className} {style}>{@render children?.()}</main>
