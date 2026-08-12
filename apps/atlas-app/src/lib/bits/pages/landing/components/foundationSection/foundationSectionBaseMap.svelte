<script lang="ts">
import type { Snippet } from 'svelte'

import { m } from '$lib/bits/internal/i18n'
import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  children?: Snippet
  map?: Snippet
  class?: string
}

let { children, map, class: className = '' }: Props = $props()
</script>

<div
  class={cn(
    'relative h-[max(clamp(38rem,56vw,47rem),calc(100svh-var(--landing-header-height,4.5rem)))] min-h-[clamp(38rem,56vw,47rem)] overflow-hidden bg-[#feffeb] [--foundation-map-background:#feffeb] [--foundation-map-land:#feffeb] dark:bg-surface dark:[--foundation-map-background:var(--surface)] dark:[--foundation-map-land:color-mix(in_srgb,var(--surface)_97%,white)] max-[785px]:h-auto max-[785px]:min-h-0',
    className,
  )}
>
  <svg
    class="absolute -inset-0.5 h-[calc(100%+4px)] w-[calc(100%+4px)] max-[785px]:relative max-[785px]:inset-auto max-[785px]:h-120 max-[785px]:w-full"
    viewBox="281 50 630 399"
    preserveAspectRatio="xMidYMid slice"
    role="img"
    aria-labelledby="foundation-map-title"
  >
    <title id="foundation-map-title">{m.foundation_title()}</title>
    <defs>
      <filter id="harbour-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.1" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <clipPath id="foundation-map-clip">
        <rect width="1200" height="760" />
      </clipPath>
    </defs>

    <rect class="fill-(--foundation-map-background)" width="1200" height="760" />
    {@render map?.()}
  </svg>
  {@render children?.()}
</div>
