<script lang="ts">
import type { Snippet } from 'svelte'

type GuideWidth = 'content' | 'full' | 'main' | 'short' | 'shortCard'

type Props = {
  children?: Snippet
  class?: string
  id?: string
  width?: GuideWidth
}

const widthClasses: Record<GuideWidth, string> = {
  full: 'relative left-1/2 w-screen -translate-x-1/2',
  main: 'w-full max-w-[80rem]',
  content: 'w-full max-w-[58rem]',
  short: 'w-full max-w-[48rem]',
  shortCard: 'w-full max-w-[44.5rem]',
}

let { children, class: className = '', id, width = 'content' }: Props = $props()
</script>

<div {id} class={`${widthClasses[width]} ${className}`}>
  {@render children?.()}
</div>
