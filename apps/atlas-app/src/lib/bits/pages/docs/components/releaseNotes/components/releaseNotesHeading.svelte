<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  depth: number
  id: string
  children?: Snippet
}

let { depth, id, children }: Props = $props()

const anchorClass =
  "source-heading-anchor group relative block text-inherit no-underline before:pointer-events-none before:absolute before:-left-3 before:top-1/2 before:-translate-y-1/2 before:font-mono before:text-sm before:text-secondary before:opacity-0 before:transition-opacity before:content-['#'] group-hover:before:opacity-100 group-focus-visible:before:opacity-100"
</script>

{#if depth === 1}
  <h1 {id} class="scroll-mt-24 lg:scroll-mt-[120px]">
    <a href={`#${id}`} class={anchorClass}>{@render children?.()}</a>
  </h1>
{:else if depth === 2}
  <h2 {id} class="scroll-mt-24 lg:scroll-mt-[120px] font-bold">
    <a href={`#${id}`} class={anchorClass}>{@render children?.()}</a>
  </h2>
{:else if depth === 3}
  <h3 {id} class="scroll-mt-24 lg:scroll-mt-[120px]">
    <a href={`#${id}`} class={anchorClass}>{@render children?.()}</a>
  </h3>
{:else if depth === 4}
  <h4 {id} class="my-3 scroll-mt-24 lg:scroll-mt-[120px] text-base leading-6">
    <a href={`#${id}`} class={anchorClass}>{@render children?.()}</a>
  </h4>
{:else if depth === 5}
  <h5 {id} class="scroll-mt-24 lg:scroll-mt-[120px]">
    <a href={`#${id}`} class={anchorClass}>{@render children?.()}</a>
  </h5>
{:else}
  <h6 {id} class="scroll-mt-24 lg:scroll-mt-[120px]">
    <a href={`#${id}`} class={anchorClass}>{@render children?.()}</a>
  </h6>
{/if}
