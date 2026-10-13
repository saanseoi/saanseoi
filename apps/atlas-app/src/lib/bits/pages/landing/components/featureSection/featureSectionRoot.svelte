<script lang="ts">
import type { Snippet } from 'svelte'
import { cn } from '#lib/bits/utilities/helpers/cn.js'

type Props = { children?: Snippet; class?: string }
let { children, class: className = '' }: Props = $props()
</script>

<section
  class={cn(
    'overflow-x-clip scroll-mt-22 bg-[#fcf9f5] bg-[radial-gradient(ellipse_38rem_24rem_at_4%_84%,rgb(111_217_190/0.16),transparent_72%),radial-gradient(ellipse_34rem_22rem_at_96%_16%,rgb(255_181_149/0.14),transparent_72%)] dark:bg-[#131311] dark:bg-none',
    className,
  )}
>
  {@render children?.()}
</section>
