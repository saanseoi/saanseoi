<script lang="ts">
import { onMount } from 'svelte'

import type { Snippet } from 'svelte'
import { cn } from '$lib/bits/utilities/helpers/cn'
type NavigationState = { canMoveBackward: boolean; canMoveForward: boolean }
type DragState = { cardId: string | null }
type Props = {
  children?: Snippet
  class?: string
  onnavigationchange?: (state: NavigationState) => void
  ondragstatechange?: (state: DragState) => void
  onreachend?: () => void
}
let {
  children,
  class: className = '',
  onnavigationchange,
  ondragstatechange,
  onreachend,
}: Props = $props()
let viewport = $state<HTMLElement>()
let pointerId = $state<number | null>(null)
let startX = $state(0)
let startScrollLeft = $state(0)
let hasDragged = $state(false)
let shouldSuppressClick = $state(false)
let pendingCardId = $state<string | null>(null)

const updateNavigation = () => {
  if (!viewport) return
  const maximumScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
  onnavigationchange?.({
    canMoveBackward: viewport.scrollLeft > 1,
    canMoveForward: viewport.scrollLeft < maximumScrollLeft - 1,
  })
  if (maximumScrollLeft > 0 && viewport.scrollLeft >= maximumScrollLeft - 160) {
    onreachend?.()
  }
}

export function scrollByPage(direction: -1 | 1) {
  if (!viewport) return
  const cardStep = 320 + 16
  const visibleCards = Math.max(1, Math.floor(viewport.clientWidth / cardStep))
  viewport.scrollBy({ left: direction * visibleCards * cardStep, behavior: 'smooth' })
  window.requestAnimationFrame(updateNavigation)
}

const handlePointerDown = (event: PointerEvent) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  pointerId = event.pointerId
  startX = event.clientX
  startScrollLeft = viewport?.scrollLeft ?? 0
  hasDragged = false
  const card =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-carousel-card]')
      : null
  pendingCardId = card?.dataset.carouselCard ?? null
}
const handlePointerMove = (event: PointerEvent) => {
  if (event.pointerId !== pointerId || !viewport) return
  const offset = event.clientX - startX
  if (Math.abs(offset) > 6 && !hasDragged) {
    hasDragged = true
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    ondragstatechange?.({ cardId: pendingCardId })
  }
  if (!hasDragged) return
  event.preventDefault()
  viewport.scrollLeft = startScrollLeft - offset
  updateNavigation()
}
const endPointerInteraction = (event: PointerEvent) => {
  if (event.pointerId !== pointerId) return
  if (hasDragged) {
    event.preventDefault()
    shouldSuppressClick = true
  }
  hasDragged = false
  pointerId = null
  pendingCardId = null
  ondragstatechange?.({ cardId: null })
}

const suppressDraggedClick = (node: HTMLElement) => {
  const handleClick = (event: MouseEvent) => {
    if (!shouldSuppressClick) return
    event.preventDefault()
    event.stopPropagation()
    shouldSuppressClick = false
  }

  node.addEventListener('click', handleClick)
  return { destroy: () => node.removeEventListener('click', handleClick) }
}

onMount(() => {
  if (!viewport) return
  const resizeObserver = new ResizeObserver(updateNavigation)
  resizeObserver.observe(viewport)
  viewport.addEventListener('scroll', updateNavigation, { passive: true })
  updateNavigation()
  return () => {
    resizeObserver.disconnect()
    viewport?.removeEventListener('scroll', updateNavigation)
  }
})
</script>
<section
  bind:this={viewport}
  use:suppressDraggedClick
  class={cn('cursor-grab overflow-x-auto pb-4 select-none [scrollbar-color:color-mix(in_srgb,var(--secondary)_55%,transparent)_transparent] [touch-action:pan-y] active:cursor-grabbing', className)}
  aria-label="Carousel"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={endPointerInteraction}
  onpointercancel={endPointerInteraction}
  ondragstart={event => event.preventDefault()}
>
  {@render children?.()}
</section>
