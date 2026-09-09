<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { m } from '#lib/bits/internal/i18n.js'
import type { Snippet } from 'svelte'

import { auditScrollHasMore, nextAuditScrollPage } from '../auditScroll'

type Props = {
  ariaBusy?: boolean
  ariaLabel?: string
  children: Snippet
  containerClass?: string
  dataAuditVirtualList?: boolean
  element?: HTMLElement
  onscroll?: (event: Event & { currentTarget: HTMLElement }) => void
  viewportClass?: string
}

let {
  ariaBusy,
  ariaLabel,
  children,
  containerClass = '',
  dataAuditVirtualList = false,
  element = $bindable<HTMLElement>(),
  onscroll,
  viewportClass = '',
}: Props = $props()

let hasMore = $state(false)

function updateOverflow() {
  hasMore = element ? auditScrollHasMore(element) : false
}

function pageForward() {
  if (!element) return
  element.scrollTo({
    behavior: 'smooth',
    top: nextAuditScrollPage(element),
  })
}

function handleScroll(event: Event & { currentTarget: HTMLElement }) {
  updateOverflow()
  onscroll?.(event)
}

$effect(() => {
  const viewport = element
  if (!viewport) return

  let frame = requestAnimationFrame(updateOverflow)
  const scheduleUpdate = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(updateOverflow)
  }
  const resize = new ResizeObserver(scheduleUpdate)
  const observed = new Set<Element>()
  const observeChildren = () => {
    for (const child of observed) {
      if (child.parentElement === viewport) continue
      resize.unobserve(child)
      observed.delete(child)
    }
    for (const child of viewport.children) {
      if (observed.has(child)) continue
      resize.observe(child)
      observed.add(child)
    }
  }
  const mutation = new MutationObserver(() => {
    observeChildren()
    scheduleUpdate()
  })

  resize.observe(viewport)
  observeChildren()
  mutation.observe(viewport, {
    childList: true,
  })

  return () => {
    cancelAnimationFrame(frame)
    mutation.disconnect()
    resize.disconnect()
  }
})
</script>

<div class={`relative min-h-0 ${containerClass}`}>
  <section
    bind:this={element}
    class={viewportClass}
    aria-busy={ariaBusy}
    aria-label={ariaLabel}
    data-audit-virtual-list={dataAuditVirtualList ? '' : undefined}
    onscroll={handleScroll}
  >
    {@render children()}
  </section>
  {#if hasMore}
    <button
      type="button"
      class="absolute inset-x-0 -bottom-px z-20 flex h-11 w-full cursor-pointer items-end justify-center rounded-b-xl bg-linear-to-b from-transparent via-surface/85 to-surface pb-1 text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-secondary"
      aria-label={m.source_show_more()}
      onclick={pageForward}
    >
      <Icon icon="ion:chevron-down-outline" class="size-3.5" aria-hidden="true" />
    </button>
  {/if}
</div>
