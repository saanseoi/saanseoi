<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  aside?: Snippet
  children?: Snippet
  class?: string
  primaryWidth?: 'content' | 'short' | 'shortCard'
}

const primaryWidthClasses = {
  content: 'xl:grid-cols-[minmax(0,58rem)_minmax(0,1fr)]',
  short: 'xl:grid-cols-[48rem_minmax(0,1fr)]',
  shortCard: 'xl:grid-cols-[44.5rem_minmax(0,1fr)]',
} as const

let {
  aside,
  children,
  class: className = '',
  primaryWidth = 'shortCard',
}: Props = $props()
</script>

<div
  class={`grid min-w-0 gap-6 xl:w-[calc(100%+14rem)] xl:max-w-[72rem] xl:items-start ${primaryWidthClasses[primaryWidth]} ${className}`}
>
  <div class="min-w-0">
    {@render children?.()}
  </div>
  {#if aside}
    <aside class="min-w-0 xl:pt-0.5">{@render aside()}</aside>
  {/if}
</div>
