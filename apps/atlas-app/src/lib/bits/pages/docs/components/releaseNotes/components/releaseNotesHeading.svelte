<script lang="ts">
import type { Snippet } from 'svelte'
import Anchor from './releaseNotesHeadingAnchor.svelte'

type Props = {
  depth: number
  id: string
  tableLabel?: boolean
  children?: Snippet
}

let { depth, id, tableLabel = false, children }: Props = $props()
</script>

{#if depth === 1}
  <h1 {id} class="scroll-mt-32 lg:scroll-mt-[144px]">
    <Anchor {id} {children} />
  </h1>
{:else if depth === 2}
  <h2 {id} class="scroll-mt-32 lg:scroll-mt-[144px] font-bold">
    <Anchor {id} {children} />
  </h2>
{:else if depth === 3}
  <h3
    {id}
    class={`${tableLabel ? 'mt-8 mb-3 rounded-md border border-outline-variant/60 bg-surface-container-high px-4 py-2.5 text-center font-mono text-sm font-medium tracking-[0.04em] text-primary uppercase dark:border-outline-variant dark:text-[#edf2ee]!' : ''} scroll-mt-32 lg:scroll-mt-[144px]`}
  >
    <Anchor {id} {children} />
  </h3>
{:else if depth === 4}
  <h4 {id} class="my-3 scroll-mt-32 lg:scroll-mt-[144px] text-base leading-6">
    <Anchor {id} {children} />
  </h4>
{:else if depth === 5}
  <h5 {id} class="scroll-mt-32 lg:scroll-mt-[144px]">
    <Anchor {id} {children} />
  </h5>
{:else}
  <h6 {id} class="scroll-mt-32 lg:scroll-mt-[144px]">
    <Anchor {id} {children} />
  </h6>
{/if}
