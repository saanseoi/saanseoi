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
  class={`min-w-0 max-w-full border-l-4 border-secondary bg-surface-container-low font-body text-body-lg leading-8 text-foreground-alt ${size === 'generous' ? 'p-6' : 'p-5'} ${className}`}
>
  {@render children?.()}
</div>
