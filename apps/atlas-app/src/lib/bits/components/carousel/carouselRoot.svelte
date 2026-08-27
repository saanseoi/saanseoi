<script lang="ts">
import { onMount } from 'svelte'

import type { Snippet } from 'svelte'
import { cn } from '#lib/bits/utilities/helpers/cn.js'
type NavigationState = { canMoveBackward: boolean; canMoveForward: boolean }
type DragState = { cardId: string | null }
type Props = {
  children?: Snippet
  class?: string
  scrollable?: boolean
  onnavigationchange?: (state: NavigationState) => void
  ondragstatechange?: (state: DragState) => void
  onreachend?: () => void
}
let {
  children,
  class: className = '',
  scrollable = true,
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
let lastWheelNavigationAt = 0

const updateNavigation = () => {
  if (!viewport) return
  if (!scrollable) {
    onnavigationchange?.({ canMoveBackward: false, canMoveForward: false })
    return
  }
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
  if (!viewport || !scrollable) return
  const cardStep = 320 + 16
  const visibleCards = Math.max(1, Math.floor(viewport.clientWidth / cardStep))
  viewport.scrollBy({ left: direction * visibleCards * cardStep, behavior: 'smooth' })
  window.requestAnimationFrame(updateNavigation)
}

const handlePointerDown = (event: PointerEvent) => {
  if (!scrollable) return
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
  if (!scrollable) return
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
  if (!scrollable) return
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

const handleWheel = (event: WheelEvent) => {
  if (!viewport || !scrollable || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
    return
  const maximumScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
  if (
    (event.deltaY > 0 && viewport.scrollLeft >= maximumScrollLeft - 1) ||
    (event.deltaY < 0 && viewport.scrollLeft <= 1)
  )
    return
  event.preventDefault()
  const now = performance.now()
  if (now - lastWheelNavigationAt < 360) return
  lastWheelNavigationAt = now
  scrollByPage(event.deltaY > 0 ? 1 : -1)
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
  const mutationObserver = new MutationObserver(updateNavigation)
  resizeObserver.observe(viewport)
  mutationObserver.observe(viewport, { childList: true, subtree: true })
  viewport.addEventListener('scroll', updateNavigation, { passive: true })
  updateNavigation()
  return () => {
    resizeObserver.disconnect()
    mutationObserver.disconnect()
    viewport?.removeEventListener('scroll', updateNavigation)
  }
})

$effect(() => {
  scrollable
  updateNavigation()
})
</script>
<section
  bind:this={viewport}
  use:suppressDraggedClick
  class={cn(
    scrollable
      ? 'cursor-grab overflow-x-auto pb-4 select-none [scrollbar-color:transparent_transparent] scrollbar-thin [touch-action:pan-y] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--secondary)_55%,transparent)] [&::-webkit-scrollbar-thumb]:opacity-0 [&::-webkit-scrollbar-thumb]:transition-opacity [&::-webkit-scrollbar-thumb]:duration-220 hover:[scrollbar-color:color-mix(in_srgb,var(--secondary)_55%,transparent)_transparent] hover:[&::-webkit-scrollbar-thumb]:opacity-100 active:cursor-grabbing'
      : 'cursor-default overflow-x-hidden select-none',
    className,
  )}
  aria-label="Carousel"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={endPointerInteraction}
  onpointercancel={endPointerInteraction}
  onwheel={handleWheel}
  ondragstart={event => event.preventDefault()}
>
  {@render children?.()}
</section>
