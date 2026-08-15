<script lang="ts">
import Icon from '@iconify/svelte'
import { m } from '#lib/bits/internal/i18n.js'
import type { ReleaseNavOutlineItem } from '../releaseNav.types'
import ReleaseNavOutline from './releaseNavOutline.svelte'
import ReleaseNavInlineLabel from './releaseNavInlineLabel.svelte'

type Props = {
  activeOutlineId: string | null
  items: ReleaseNavOutlineItem[]
  panel?: HTMLElement
}
let { activeOutlineId, items, panel }: Props = $props()
let open = $state(false)
let activeItem = $derived(items.find(item => item.id === activeOutlineId) ?? items[0])

function close() {
  open = false
  const content =
    panel?.querySelector<HTMLElement>('[data-release-nav-content-body]') ?? panel
  window.dispatchEvent(new Event('app-header:preserve-visibility'))
  content?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function toggle() {
  open = !open
}

function dismiss() {
  open = false
}
</script>

<div class="relative">
  <div
    data-release-nav-mobile-toc-trigger
    class="relative z-30 flex h-12 items-center gap-2 border-b border-outline-variant/60 bg-surface-container-low px-4 py-3 dark:border-outline-variant"
  >
    <button
      class="flex h-12 min-w-0 flex-1 items-center justify-between gap-4 py-3 text-left font-body text-label-md font-semibold text-primary"
      type="button"
      aria-controls="source-release-mobile-toc"
      aria-expanded={open}
      onclick={toggle}
    >
      <span class="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
        >{#if activeItem}
          <ReleaseNavInlineLabel label={activeItem.label} />
        {:else}
          {m.source_release_sections()}
        {/if}</span
      >
      <Icon
        icon="ion:chevron-down-outline"
        class={`size-4 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
    <button
      class="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-foreground-alt transition hover:bg-surface-container-high hover:text-primary"
      type="button"
      aria-label="Close section navigation"
      onclick={close}
    >
      <Icon icon="ion:close-outline" class="size-4" aria-hidden="true" />
    </button>
  </div>
  {#if open}
    <button
      class="fixed inset-0 z-20 bg-black/40"
      type="button"
      aria-label="Close section navigation"
      onclick={dismiss}
    ></button>
    <div
      id="source-release-mobile-toc"
      class="relative z-30 border-b border-outline-variant/60 bg-surface-container-lowest dark:border-outline-variant"
    >
      <ReleaseNavOutline
        activeId={activeOutlineId}
        ariaLabel={m.source_release_sections()}
        {items}
        mobile
        onSelect={dismiss}
        {panel}
      />
    </div>
  {/if}
</div>
