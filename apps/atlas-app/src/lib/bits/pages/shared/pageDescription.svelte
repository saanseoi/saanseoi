<script lang="ts">
import type { Snippet } from 'svelte'
import { cn } from '#lib/bits/utilities/helpers/cn.js'
type Props = { children?: Snippet; class?: string }
let { children, class: className = '' }: Props = $props()
</script>
<p
  class={cn('max-w-6xl font-body text-body-lg leading-8 text-foreground-alt', className)}
>
  {@render children?.()}
</p>
