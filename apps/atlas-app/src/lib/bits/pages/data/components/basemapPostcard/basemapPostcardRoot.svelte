<script lang="ts">
import { onMount, setContext } from 'svelte'

import * as CardDeck from '$lib/bits/components/cardDeck'

import {
  basemapPostcardFocusContext,
  type BasemapPostcardFocus,
  type BasemapPostcardRootProps,
} from './basemapPostcardTypes'

let {
  accent,
  children,
  class: className = '',
  darkPattern,
  displayOrder,
  flipOrigin,
  flipTransform,
  intro,
  isDragging,
  isSelected,
  isThrowing,
  layoutClass,
  pattern,
  postcardTransform,
  throwPhase,
}: BasemapPostcardRootProps = $props()

let isIntroVisible = $state(false)
let isIntroActive = $state(true)
const focus = $state<BasemapPostcardFocus>({})

setContext(basemapPostcardFocusContext, focus)

$effect(() => {
  if (!isSelected && document.activeElement === focus.returnButton) {
    focus.frontButton?.focus()
  }
})

onMount(() => {
  const frame = window.requestAnimationFrame(() => {
    isIntroVisible = true
  })
  const timeout = window.setTimeout(
    () => {
      isIntroActive = false
    },
    (intro.delay ?? 0) + (intro.duration ?? 360),
  )

  return () => {
    window.cancelAnimationFrame(frame)
    window.clearTimeout(timeout)
  }
})
</script>

<CardDeck.Card
  as="article"
  data-basemap-postcard
  class={`group block select-none transform-(--postcard-transform) transition-[top,left,width,transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${isDragging || isThrowing || isSelected ? 'will-change-transform' : ''} ${throwPhase === 'launch' ? 'duration-520! ease-[cubic-bezier(0.18,0.72,0.32,1)]!' : throwPhase === 'flight' ? 'duration-640! ease-[cubic-bezier(0.14,0.9,0.25,1.08)]!' : throwPhase === 'settle' ? 'duration-460! ease-[cubic-bezier(0.16,1.32,0.32,1)]!' : ''} ${isSelected ? 'min-[901px]:transform-[translateX(-50%)_var(--postcard-transform)]' : ''} ${layoutClass} ${className}`}
  style={`--postcard-accent: ${accent}; --postcard-pattern: ${pattern}; --postcard-dark-pattern: ${darkPattern}; --postcard-transform: ${postcardTransform}; z-index: ${displayOrder};`}
>
  <div
    class={`relative aspect-3/2 transition-[opacity,translate] duration-360 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none ${isIntroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4.5'} ${isSelected ? 'perspective-distant max-[900px]:aspect-auto' : ''}`}
    style={isIntroActive ? `transition-delay: ${intro.delay ?? 0}ms;` : undefined}
  >
    <div
      class={`relative size-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${isSelected ? 'transform-3d max-[900px]:h-auto' : ''} ${throwPhase === 'launch' ? 'duration-520! ease-[cubic-bezier(0.18,0.72,0.32,1)]!' : throwPhase === 'flight' ? 'duration-640! ease-[cubic-bezier(0.14,0.9,0.25,1.08)]!' : throwPhase === 'settle' ? 'duration-460! ease-[cubic-bezier(0.16,1.32,0.32,1)]!' : ''}`}
      style={`transform: ${flipTransform}; transform-origin: ${flipOrigin};`}
    >
      {@render children?.()}
    </div>
  </div>
</CardDeck.Card>
