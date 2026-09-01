<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import type { Snippet } from 'svelte'
import { slide } from 'svelte/transition'

type Props = {
  children?: Snippet
  class?: string
  expanded?: boolean
  id: string
  title: string
}

let {
  children,
  class: className = '',
  expanded = $bindable(false),
  id,
  title,
}: Props = $props()
</script>

<aside
  class={`border-l-4 border-[#f2c26d] bg-[#f2c26d]/12 px-4 py-3 ${className}`}
  aria-labelledby={`${id}-title`}
>
  <button
    class="flex w-full cursor-pointer items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f2c26d]"
    type="button"
    aria-controls={`${id}-details`}
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <Icon
      icon="material-symbols-light:warning-rounded"
      class="mt-0.5 size-4 shrink-0 text-[#d19637]"
      aria-hidden="true"
    />
    <span
      id={`${id}-title`}
      class="min-w-0 flex-1 font-body text-label-xs font-semibold tracking-[0.12em] text-[#8b5b11] uppercase"
    >
      {@html title}
    </span>
    <Icon
      class={`size-5 shrink-0 text-[#d19637] transition-transform duration-180 ${expanded ? 'rotate-180' : ''}`}
      icon="material-symbols-light:keyboard-arrow-down-rounded"
      aria-hidden="true"
    />
  </button>

  {#if expanded}
    <div
      id={`${id}-details`}
      class="ml-8 mt-5 space-y-5 border-t border-[#d19637]/35 pt-5"
      transition:slide={{ duration: 180 }}
    >
      {@render children?.()}
    </div>
  {/if}
</aside>
