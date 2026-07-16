<script lang="ts">
import { cn } from '$lib/bits/utilities/helpers/cn'
import FeatureSectionCardAnimation from './featureSectionCardAnimation.svelte'
import FeatureSectionCardBody from './featureSectionCardBody.svelte'
import type { FeatureSectionPrinciple } from './featureSectionTypes'

type Props = {
  principle: FeatureSectionPrinciple
  principleIndex: number
  orderIndex: number
  isActive: boolean
  isDragCandidate: boolean
  isThrowingAway: boolean
  swipeX: number
  swipeY: number
  swipeRotate: number
  throwDirection: number
  onpointerdown: (event: PointerEvent) => void
  onpointermove: (event: PointerEvent) => void
  onpointerup: (event: PointerEvent) => void
  onclick: () => void
}

let {
  principle,
  principleIndex,
  orderIndex,
  isActive,
  isDragCandidate,
  isThrowingAway,
  swipeX,
  swipeY,
  swipeRotate,
  throwDirection,
  onpointerdown,
  onpointermove,
  onpointerup,
  onclick,
}: Props = $props()

const positions = [
  'left-[calc(50%-29.75rem)] translate-y-[.3rem] rotate-[-3.5deg] hover:translate-y-0 hover:-rotate-1',
  'left-[calc(50%-15.6rem)] translate-y-[1.5rem] rotate-[1.8deg] hover:translate-y-[1.2rem] hover:rotate-[.8deg]',
  'left-[calc(50%-1.4rem)] translate-y-[-.5rem] rotate-[-1.4deg] hover:translate-y-[-.8rem] hover:rotate-[-.5deg]',
  'left-[calc(50%+12.75rem)] translate-y-4 rotate-[3.2deg] hover:translate-y-[.7rem] hover:rotate-[1.1deg]',
] as const

const tones = {
  paper: 'bg-[#e9f7ef] border-secondary/42 text-primary dark:bg-[#101816]',
  dark: 'bg-[#fff0e6] text-primary dark:bg-[#242321] dark:hover:border-tertiary dark:hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--tertiary)_54%,transparent),var(--shadow-mini)]',
} as const
</script>

<button
  class={cn(
    `principle-card principle-stack-position-${orderIndex} absolute top-28 z-1 flex h-88 w-[min(18rem,26vw)] cursor-grab flex-col justify-between overflow-hidden rounded-2xl border border-outline-variant/84 p-[1.35rem] text-left shadow-[0_.7rem_1.6rem_rgb(24_25_25/0.1),var(--shadow-mini)] transition-[top,left,width,transform,border-color,height,opacity,box-shadow] duration-500 hover:border-secondary/45 focus-visible:border-secondary/45 focus-visible:outline-none active:cursor-grabbing dark:border-outline-variant/70 dark:shadow-mini`,
    positions[principleIndex],
    tones[principle.tone],
    isActive && 'principle-card-active',
    isDragCandidate && 'principle-card-dragging-candidate',
    isThrowingAway && 'principle-card-throwing-away',
  )}
  type="button"
  aria-pressed={isActive}
  style={`--swipe-x: ${swipeX}px; --swipe-y: ${swipeY}px; --swipe-rotate: ${swipeRotate}deg; --throw-direction: ${throwDirection};`}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  {onclick}
>
  {#if principleIndex !== 2}
    <span
      class={cn(
        'absolute size-[1.1rem] border-secondary opacity-55',
        principleIndex === 0
          ? 'left-[-0.45rem] top-[-0.45rem] border-l border-t'
          : 'bottom-[-0.45rem] right-[-0.45rem] border-b border-r',
      )}
      aria-hidden="true"
    ></span>
  {/if}
  <FeatureSectionCardAnimation animation={principle.animation} />
  <span class="relative z-2 px-[.4rem]">
    <span class="block pt-4 font-display text-[1.55rem] font-bold leading-[1.02]">
      {principle.title()}
    </span>
    <FeatureSectionCardBody body={principle.body()} tone={principle.tone} {isActive} />
  </span>
</button>
