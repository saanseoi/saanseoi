<script lang="ts">
import { cn } from '$lib/bits/utilities/helpers/cn'
import * as Card from '$lib/bits/components/cardDeck'
import FeatureSectionCardAnimation from './featureSectionCardAnimation.svelte'
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
  onpointerdown,
  onpointermove,
  onpointerup,
  onclick,
}: Props = $props()

const positions = [
  'min-[901px]:left-[calc(50%-29.75rem)] min-[901px]:translate-y-[.3rem] min-[901px]:rotate-[-3.5deg]',
  'min-[901px]:left-[calc(50%-15.6rem)] min-[901px]:translate-y-6 min-[901px]:rotate-[1.8deg]',
  'min-[901px]:left-[calc(50%-1.4rem)] min-[901px]:translate-y-[-.5rem] min-[901px]:rotate-[-1.4deg]',
  'min-[901px]:left-[calc(50%+12.75rem)] min-[901px]:translate-y-4 min-[901px]:rotate-[3.2deg]',
] as const

const tones = {
  paper: 'border-secondary/42 bg-[#e9f7ef] text-primary dark:bg-[#101816]',
  dark: 'bg-[#fff0e6] text-primary dark:bg-[#242321]',
} as const
</script>

<Card.Card
  as="button"
  class={cn(
    `principle-card principle-stack-position-${orderIndex} absolute top-28 z-1 flex h-88 w-[min(18rem,26vw)] cursor-grab flex-col justify-between overflow-hidden rounded-2xl border border-outline-variant/84 p-[1.35rem] text-left shadow-[0_.7rem_1.6rem_rgb(24_25_25/0.1),var(--shadow-mini)] transition-[top,left,width,transform,translate,rotate,border-color,height,opacity,box-shadow] duration-500 min-[901px]:hover:[translate:0_-0.75rem] min-[901px]:hover:rotate-0 focus-visible:outline-none active:cursor-grabbing dark:border-outline-variant/70 dark:shadow-mini`,
    positions[principleIndex],
    tones[principle.tone],
    isActive && 'principle-card-active',
    isDragCandidate && 'principle-card-dragging-candidate',
    isThrowingAway && 'principle-card-throwing-away',
  )}
  type="button"
  data-tone={principle.tone}
  style={`--swipe-x: ${swipeX}px; --swipe-y: ${swipeY}px; --swipe-rotate: ${swipeRotate}deg;`}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  {onclick}
>
  <Card.Visual>
    <FeatureSectionCardAnimation animation={principle.animation} />
  </Card.Visual>
  <Card.Body
    title={principle.title()}
    body={principle.body()}
    class="relative z-2 px-[.4rem]"
    titleClass="block pt-4 font-display text-[1.55rem] font-bold leading-[1.02]"
    bodyClass={cn(
      'principle-card-body mt-4 block max-h-0 pointer-events-none opacity-0 transition-[max-height,opacity] duration-450',
      isActive && 'max-h-none pointer-events-auto opacity-100',
      principle.tone === 'paper' ? 'text-[#444748] dark:text-foreground-alt' : 'text-foreground-alt',
    )}
  />
</Card.Card>

<style>
:global(.principle-card:hover),
:global(.principle-card:focus-visible) {
  border-color: color-mix(in srgb, var(--secondary) 45%, var(--outline-variant));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--secondary) 54%, transparent),
    var(--shadow-mini);
}

:global(.principle-card[data-tone="dark"]:hover),
:global(.principle-card[data-tone="dark"]:focus-visible) {
  border-color: color-mix(in srgb, var(--tertiary) 72%, var(--outline-variant));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tertiary) 54%, transparent),
    var(--shadow-mini);
}
</style>
