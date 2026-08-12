<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
  id?: string
  size?: 'default' | 'generous'
}

let { children, class: className = '', id, size = 'default' }: Props = $props()
</script>

<div
  {id}
  class={`border-l-4 border-secondary bg-surface-container-low font-body text-body-md leading-7 text-foreground-alt ${size === 'generous' ? 'p-6' : 'p-5'} ${className}`}
>
  {@render children?.()}
</div>
