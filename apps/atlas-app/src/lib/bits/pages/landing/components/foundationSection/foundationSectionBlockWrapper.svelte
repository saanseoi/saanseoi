<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '#lib/bits/utilities/helpers/cn.js'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<div
  class={cn(
    'absolute inset-0 z-4 max-[785px]:relative max-[785px]:inset-auto max-[785px]:grid max-[785px]:w-[min(30rem,calc(100%-2.5rem))] max-[785px]:justify-items-center max-[785px]:gap-5 max-[785px]:mx-auto max-[785px]:p-[0.5rem_1.25rem_2.75rem]',
    className,
  )}
>
  {@render children?.()}
</div>
