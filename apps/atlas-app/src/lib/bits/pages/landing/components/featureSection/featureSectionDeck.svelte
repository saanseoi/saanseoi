<script lang="ts">
import FeatureSectionCard from './featureSectionCard.svelte'
import type { FeatureSectionPrinciple } from './featureSectionTypes'
import { m } from '$lib/bits/internal/i18n'

type PrincipleIndex = 0 | 1 | 2 | 3
type DragMode = 'desktop' | 'mobile' | null
type Props = {
  isRevealed: boolean
  onActivePrincipleChange: (isActive: boolean) => void
}

let { isRevealed, onActivePrincipleChange }: Props = $props()

let activePrincipleIndex = $state<PrincipleIndex | null>(null)
let principleDeckOrder = $state<PrincipleIndex[]>([0, 1, 2, 3])
let isMobileStack = $state<boolean | null>(null)
let throwTimeout: number | undefined
let swipeState = $state({
  pointerId: null as number | null,
  startX: 0,
  startY: 0,
  deltaX: 0,
  deltaY: 0,
  hasMoved: false,
  isDragging: false,
  isThrowing: false,
  dragMode: null as DragMode,
  throwingPrincipleIndex: null as PrincipleIndex | null,
  draggedPrincipleIndex: null as PrincipleIndex | null,
})
let suppressPrincipleClick = false

$effect(() => {
  onActivePrincipleChange(activePrincipleIndex !== null)
})

const principles = [
  {
    title: () => m.architecture_principle_stable_identifiers_title(),
    body: () => m.architecture_principle_stable_identifiers_body(),
    tone: 'paper',
    animation: 'ticker',
  },
  {
    title: () => m.architecture_principle_early_enrichment_title(),
    body: () => m.architecture_principle_early_enrichment_body(),
    tone: 'dark',
    animation: 'growth',
  },
  {
    title: () => m.architecture_principle_full_provenance_title(),
    body: () => m.architecture_principle_full_provenance_body(),
    tone: 'paper',
    animation: 'provenance',
  },
  {
    title: () => m.architecture_principle_persistence_title(),
    body: () => m.architecture_principle_persistence_body(),
    tone: 'dark',
    animation: 'cubes',
  },
] as const satisfies readonly FeatureSectionPrinciple[]

const resetSwipeState = () => {
  swipeState = {
    pointerId: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    hasMoved: false,
    isDragging: false,
    isThrowing: false,
    dragMode: null,
    throwingPrincipleIndex: null,
    draggedPrincipleIndex: null,
  }
}
const rotatePrincipleToBack = () => {
  const front = principleDeckOrder[0]
  if (front === undefined) return
  principleDeckOrder = [...principleDeckOrder.slice(1), front]
  activePrincipleIndex = null
}

const handlePointerDown = (
  event: PointerEvent,
  principleIndex: PrincipleIndex,
  orderIndex: number,
) => {
  const isDesktop = window.innerWidth > 900
  const isIncomingMobileCard = !isDesktop && swipeState.isThrowing && orderIndex === 1
  if (!isDesktop && orderIndex !== 0 && !isIncomingMobileCard) return

  if (isIncomingMobileCard) {
    if (throwTimeout !== undefined) window.clearTimeout(throwTimeout)
    throwTimeout = undefined
    rotatePrincipleToBack()
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  swipeState = {
    ...swipeState,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    deltaX: 0,
    deltaY: 0,
    hasMoved: false,
    isDragging: true,
    isThrowing: false,
    dragMode: isDesktop ? 'desktop' : 'mobile',
    throwingPrincipleIndex: null,
    draggedPrincipleIndex: principleIndex,
  }
}

const handlePointerMove = (event: PointerEvent) => {
  if (swipeState.pointerId !== event.pointerId) return
  const deltaX = event.clientX - swipeState.startX
  const deltaY = event.clientY - swipeState.startY
  const hasMoved = Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8
  if (hasMoved && event.cancelable) event.preventDefault()
  swipeState = {
    ...swipeState,
    deltaX,
    deltaY: deltaY * (swipeState.dragMode === 'desktop' ? 1 : 0.35),
    hasMoved,
  }
}

const handlePointerEnd = (event: PointerEvent) => {
  if (swipeState.pointerId !== event.pointerId) return
  if (
    swipeState.dragMode === 'desktop' &&
    swipeState.hasMoved &&
    swipeState.draggedPrincipleIndex !== null
  ) {
    suppressPrincipleClick = true
    activePrincipleIndex = swipeState.draggedPrincipleIndex
    resetSwipeState()
    return
  }
  if (swipeState.dragMode === 'mobile' && Math.abs(swipeState.deltaX) > 76) {
    suppressPrincipleClick = true
    swipeState = {
      ...swipeState,
      pointerId: null,
      isDragging: false,
      isThrowing: true,
      throwingPrincipleIndex: principleDeckOrder[0] ?? null,
    }
    throwTimeout = window.setTimeout(() => {
      rotatePrincipleToBack()
      resetSwipeState()
      throwTimeout = undefined
    }, 420)
    return
  }
  if (swipeState.hasMoved) suppressPrincipleClick = true
  resetSwipeState()
}

const handleClick = (index: PrincipleIndex) => {
  if (suppressPrincipleClick) {
    suppressPrincipleClick = false
    return
  }
  if (window.innerWidth <= 900) {
    activePrincipleIndex = null
    return
  }
  activePrincipleIndex = activePrincipleIndex === index ? null : index
}

const handleViewportResize = () => {
  const nextIsMobileStack = window.innerWidth <= 900

  if (isMobileStack !== null && isMobileStack !== nextIsMobileStack) {
    principleDeckOrder = [0, 1, 2, 3]
    activePrincipleIndex = null
  }

  isMobileStack = nextIsMobileStack
  resetSwipeState()
  if (nextIsMobileStack) activePrincipleIndex = null
}
</script>

<svelte:window onresize={handleViewportResize} />

<div
  class:principles-deck-expanded={activePrincipleIndex !== null}
  class:principles-deck-desktop-dragging={swipeState.isDragging && swipeState.dragMode === 'desktop'}
  class:principles-deck-dragging={swipeState.isDragging && swipeState.dragMode === 'mobile'}
  class:principles-deck-dragging-active={swipeState.isDragging &&
    swipeState.dragMode === 'desktop' &&
    swipeState.draggedPrincipleIndex === activePrincipleIndex}
  class:principles-deck-throwing={swipeState.isThrowing}
  class={`principles-deck relative isolate my-auto h-126 w-screen overflow-visible py-3 transition-[height,opacity,translate] duration-500 ease-out ${
    isRevealed
      ? 'translate-y-0 opacity-100 delay-100'
      : 'translate-y-4 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none'
  }`}
>
  {#each principleDeckOrder as principleIndex, orderIndex (principleIndex)}
    {@const principle = principles[principleIndex] ?? principles[0]}
    <FeatureSectionCard
      {principle}
      {principleIndex}
      {orderIndex}
      isActive={activePrincipleIndex === principleIndex}
      isDragCandidate={swipeState.dragMode === 'desktop' &&
        swipeState.hasMoved &&
        swipeState.draggedPrincipleIndex === principleIndex &&
        activePrincipleIndex !== principleIndex}
      isThrowingAway={swipeState.throwingPrincipleIndex === principleIndex}
      swipeX={swipeState.draggedPrincipleIndex === principleIndex ? swipeState.deltaX : 0}
      swipeY={swipeState.draggedPrincipleIndex === principleIndex ? swipeState.deltaY : 0}
      swipeRotate={swipeState.draggedPrincipleIndex === principleIndex ? swipeState.deltaX * .035 : 0}
      onpointerdown={event => handlePointerDown(event, principleIndex, orderIndex)}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerEnd}
      onclick={() => handleClick(principleIndex)}
    />
  {/each}
</div>

<style>
.principles-deck {
  margin-left: calc(50% - 50vw);
}
.principles-deck::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  content: "";
  opacity: 0.04;
  background-image: radial-gradient(var(--secondary) 1px, transparent 1px);
  background-size: 1.2rem 1.2rem;
}
.principles-deck-expanded {
  height: 44.25rem;
}
.principles-deck-expanded :global(.principle-card) {
  top: 29.1rem;
  width: min(16.25rem, 23vw);
  height: 13.25rem;
  justify-content: flex-start;
  padding: 1rem;
  opacity: 0.72;
}
.principles-deck-expanded :global(.principle-card-active) {
  top: 1rem;
  left: 50%;
  z-index: 5;
  width: min(26rem, 100%);
  height: 27rem;
  justify-content: flex-start;
  opacity: 1;
  transform: translateX(-50%) rotate(0);
}
.principles-deck-expanded :global(.principle-card-1:not(.principle-card-active)) {
  left: calc(50% - 28.8rem);
}
.principles-deck-expanded :global(.principle-card-2:not(.principle-card-active)) {
  left: calc(50% - 15.6rem);
}
.principles-deck-expanded :global(.principle-card-3:not(.principle-card-active)) {
  left: calc(50% - 2.4rem);
}
.principles-deck-expanded :global(.principle-card-4:not(.principle-card-active)) {
  left: calc(50% + 10.8rem);
}
.principles-deck-expanded :global(.principle-card-active .principle-animation) {
  height: 16rem;
  margin-bottom: 0.25rem;
}
.principles-deck-expanded :global(.principle-card-active .principle-card-body) {
  max-height: none;
  margin-top: 0.75rem;
  opacity: 1;
  pointer-events: auto;
  line-height: 1.45;
  transition-delay: 0ms, 450ms;
}
.principles-deck-expanded
  :global(.principle-card:not(.principle-card-active) .principle-animation) {
  height: 6.6rem;
  margin-bottom: 0.8rem;
}
.principles-deck-dragging-active :global(.principle-card-active) {
  cursor: grabbing;
  transition:
    border-color 200ms ease,
    box-shadow 300ms ease;
  transform: translateX(calc(-50% + var(--swipe-x))) translateY(var(--swipe-y))
    rotate(var(--swipe-rotate));
}
.principles-deck-expanded :global(.principle-card-active:hover),
.principles-deck-expanded :global(.principle-card-active:focus-visible) {
  transform: translateX(-50%) rotate(0);
}
.principles-deck-dragging-active :global(.principle-card-active:hover),
.principles-deck-dragging-active :global(.principle-card-active:focus-visible) {
  transform: translateX(calc(-50% + var(--swipe-x))) translateY(var(--swipe-y))
    rotate(var(--swipe-rotate));
}
.principles-deck-desktop-dragging :global(.principle-card-dragging-candidate) {
  top: 1rem;
  left: 50%;
  z-index: 6;
  width: min(26rem, 100%);
  height: 27rem;
  justify-content: flex-start;
  cursor: grabbing;
  opacity: 1;
  transition:
    top 500ms ease,
    left 500ms ease,
    width 500ms ease,
    height 500ms ease,
    border-color 200ms ease,
    opacity 300ms ease,
    box-shadow 300ms ease;
  transform: translateX(calc(-50% + var(--swipe-x))) translateY(var(--swipe-y))
    rotate(var(--swipe-rotate));
}
.principles-deck-desktop-dragging
  :global(.principle-card-dragging-candidate .principle-animation) {
  height: 16rem;
  margin-bottom: 0.25rem;
  transition:
    height 500ms ease,
    margin 500ms ease;
}
.principles-deck-expanded.principles-deck-desktop-dragging
  :global(.principle-card-dragging-candidate .principle-animation) {
  height: 16rem;
  margin-bottom: 0.25rem;
}
.principles-deck-desktop-dragging
  :global(.principle-card-dragging-candidate .principle-card-body) {
  max-height: none;
  margin-top: 0.75rem;
  opacity: 1;
  pointer-events: auto;
  line-height: 1.45;
}
@media (max-width: 900px) {
  .principles-deck {
    height: 35rem;
    display: block;
    overflow: visible;
    margin-top: auto;
    margin-bottom: auto;
    padding-top: 3.25rem;
    padding-bottom: 2rem;
  }
  .principles-deck :global(.principle-card),
  .principles-deck-expanded :global(.principle-card),
  .principles-deck-expanded :global(.principle-card-active) {
    position: absolute;
    top: 3.25rem;
    left: 50%;
    width: min(20rem, calc(100vw - 4rem));
    margin-left: 0;
    height: 26rem;
    padding: 1.35rem;
    justify-content: flex-start;
    box-shadow: var(--shadow-mini);
    touch-action: none;
    transform-origin: center;
  }
  .principles-deck-dragging :global(.principle-stack-position-0) {
    transition:
      border-color 200ms ease,
      box-shadow 300ms ease;
  }
  .principles-deck :global(.principle-stack-position-0),
  .principles-deck :global(.principle-stack-position-0:hover),
  .principles-deck :global(.principle-stack-position-0:focus-visible),
  .principles-deck-expanded :global(.principle-stack-position-0),
  .principles-deck-expanded :global(.principle-stack-position-0:hover),
  .principles-deck-expanded :global(.principle-stack-position-0:focus-visible),
  .principles-deck-expanded :global(.principle-stack-position-0.principle-card-active) {
    z-index: 20;
    opacity: 1;
    transform: translateX(-50%) translate(var(--swipe-x), var(--swipe-y))
      rotate(var(--swipe-rotate));
  }
  .principles-deck :global(.principle-stack-position-1),
  .principles-deck :global(.principle-stack-position-1:hover),
  .principles-deck :global(.principle-stack-position-1:focus-visible),
  .principles-deck-expanded :global(.principle-stack-position-1),
  .principles-deck-expanded :global(.principle-stack-position-1:hover),
  .principles-deck-expanded :global(.principle-stack-position-1:focus-visible),
  .principles-deck-expanded :global(.principle-stack-position-1.principle-card-active) {
    z-index: 19;
    opacity: 1;
    transform: translateX(-50%) translate(0.65rem, 0.55rem) rotate(2.4deg);
  }
  .principles-deck :global(.principle-stack-position-2),
  .principles-deck :global(.principle-stack-position-2:hover),
  .principles-deck :global(.principle-stack-position-2:focus-visible),
  .principles-deck-expanded :global(.principle-stack-position-2),
  .principles-deck-expanded :global(.principle-stack-position-2:hover),
  .principles-deck-expanded :global(.principle-stack-position-2:focus-visible),
  .principles-deck-expanded :global(.principle-stack-position-2.principle-card-active) {
    z-index: 18;
    opacity: 1;
    transform: translateX(-50%) translate(1.25rem, 1.1rem) rotate(4.2deg);
  }
  .principles-deck :global(.principle-stack-position-3),
  .principles-deck :global(.principle-stack-position-3:hover),
  .principles-deck :global(.principle-stack-position-3:focus-visible),
  .principles-deck-expanded :global(.principle-stack-position-3),
  .principles-deck-expanded :global(.principle-stack-position-3:hover),
  .principles-deck-expanded :global(.principle-stack-position-3:focus-visible),
  .principles-deck-expanded :global(.principle-stack-position-3.principle-card-active) {
    z-index: 17;
    opacity: 1;
    transform: translateX(-50%) translate(1.8rem, 1.65rem) rotate(6deg);
  }
  .principles-deck-throwing :global(.principle-stack-position-1),
  .principles-deck-throwing :global(.principle-stack-position-1:hover),
  .principles-deck-throwing :global(.principle-stack-position-1:focus-visible) {
    z-index: 20;
    transform: translateX(-50%) translate(0, 0) rotate(0deg);
  }
  .principles-deck-throwing :global(.principle-stack-position-2),
  .principles-deck-throwing :global(.principle-stack-position-2:hover),
  .principles-deck-throwing :global(.principle-stack-position-2:focus-visible) {
    z-index: 19;
    transform: translateX(-50%) translate(0.65rem, 0.55rem) rotate(2.4deg);
  }
  .principles-deck-throwing :global(.principle-stack-position-3),
  .principles-deck-throwing :global(.principle-stack-position-3:hover),
  .principles-deck-throwing :global(.principle-stack-position-3:focus-visible) {
    z-index: 18;
    transform: translateX(-50%) translate(1.25rem, 1.1rem) rotate(4.2deg);
  }
  .principles-deck-throwing :global(.principle-card-throwing-away),
  .principles-deck-throwing :global(.principle-card-throwing-away:hover),
  .principles-deck-throwing :global(.principle-card-throwing-away:focus-visible),
  .principles-deck-expanded.principles-deck-throwing
    :global(.principle-card-throwing-away) {
    z-index: 17;
    opacity: 1;
    transform: translateX(-50%) translate(1.8rem, 1.65rem) rotate(6deg);
  }
  .principles-deck :global(.principle-card-body) {
    max-height: none;
    margin-top: 0.75rem;
    opacity: 1;
    pointer-events: auto;
    line-height: 1.45;
  }
  .principles-deck :global(.principle-animation),
  .principles-deck-expanded
    :global(.principle-card:not(.principle-card-active) .principle-animation) {
    height: 10.5rem;
    margin-bottom: 0.25rem;
  }
}
</style>
