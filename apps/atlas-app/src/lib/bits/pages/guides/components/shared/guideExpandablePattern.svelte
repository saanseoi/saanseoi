<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { slide } from 'svelte/transition'

import type { Snippet } from 'svelte'

type Props = {
  bannerLabel: string
  bannerPrompt: string
  children?: Snippet
  contentId: string
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  title: string
}

let {
  bannerLabel,
  bannerPrompt,
  children,
  contentId,
  expanded = $bindable(true),
  onExpandedChange,
  title,
}: Props = $props()

const toggleExpanded = () => {
  expanded = !expanded
  onExpandedChange?.(expanded)
}
</script>

<section
  class="border border-[color-mix(in_srgb,var(--color-secondary)_52%,transparent)] bg-[color-mix(in_srgb,var(--color-secondary-container)_26%,transparent)]"
  transition:slide={{ duration: 220 }}
>
  <button
    class={`flex w-full cursor-pointer flex-wrap items-center gap-5 border-0 bg-transparent px-[clamp(1.5rem,4vw,3rem)] text-left hover:[&>h3]:text-secondary focus-visible:outline-2 focus-visible:outline-secondary focus-visible:outline-offset-8 ${expanded ? 'pt-[clamp(1.5rem,4vw,3rem)] pb-0' : 'py-[clamp(0.75rem,calc(4vw-0.75rem),2.25rem)]'}`}
    type="button"
    aria-controls={contentId}
    aria-expanded={expanded}
    onclick={toggleExpanded}
  >
    <div
      class="relative m-0 w-fit max-w-full rounded-[0.35rem] border-2 border-secondary px-4 py-[0.7rem] font-mono text-[clamp(0.57rem,1.4vw,0.78rem)] leading-[1.45] font-bold text-secondary"
      aria-hidden="true"
    >
      <span
        class="absolute top-[-0.62rem] left-3 bg-secondary-container px-[0.35rem] tracking-[0.08em]"
      >
        {bannerLabel}
      </span>
      <p class="m-0">{bannerPrompt}</p>
    </div>
    <h3 class="flex-1 font-display text-headline-sm font-bold text-primary">
      {@html title}
    </h3>
    <Icon
      class={`ml-auto size-6 flex-none text-secondary transition-transform duration-180 ${expanded ? 'rotate-180' : ''}`}
      icon="material-symbols-light:keyboard-arrow-down-rounded"
      aria-hidden="true"
    />
  </button>

  {#if expanded}
    <div
      id={contentId}
      class="mt-10 px-[clamp(1.5rem,4vw,3rem)] pb-[clamp(1.5rem,4vw,3rem)]"
      transition:slide={{ duration: 180 }}
    >
      {@render children?.()}
    </div>
  {/if}
</section>
