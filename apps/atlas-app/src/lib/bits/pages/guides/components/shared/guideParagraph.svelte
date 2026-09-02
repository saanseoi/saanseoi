<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  ariaHidden?: boolean
  children: Snippet
  class?: string
}

let { ariaHidden, children, class: className = '' }: Props = $props()
</script>

<p
  aria-hidden={ariaHidden}
  class={`max-w-232 font-body text-body-lg leading-8 text-foreground-alt ${className}`}
>
  {@render children()}
</p>
