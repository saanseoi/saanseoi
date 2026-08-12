<script lang="ts">
import { onMount } from 'svelte'

import { m } from '$lib/bits/internal/i18n'

type Props = { isCardActive: boolean }

let { isCardActive }: Props = $props()
let floatStyle = $state('')

onMount(() => {
  const duration = (8.5 + Math.random() * 3.5).toFixed(2)
  const delay = (-Math.random() * parseFloat(duration)).toFixed(2)
  const driftX = (Math.random() * 1.6 - 0.8).toFixed(2)
  const lift = (4 + Math.random() * 4).toFixed(2)
  const tilt = (Math.random() * 1.2 - 0.6).toFixed(2)

  floatStyle = [
    `--hero-float-duration:${duration}s`,
    `--hero-float-delay:${delay}s`,
    `--hero-float-drift-x:${driftX}px`,
    `--hero-float-lift:${lift}px`,
    `--hero-float-tilt:${tilt}deg`,
  ].join(';')
})
</script>

<div
  class="pointer-events-none absolute top-[30%] left-[calc(50%+7.5rem)] z-4 hidden text-secondary min-[901px]:block"
  aria-hidden="true"
>
  <div class="annotation-floating flex items-start gap-3" style={floatStyle}>
    <svg
      class={`block h-28 w-auto shrink-0 fill-current scale-150 pt-6 pr-4 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
        isCardActive
          ? 'translate-x-12 -translate-y-8 opacity-0 delay-0'
          : 'translate-x-0 translate-y-0 opacity-100 delay-200'
      }`}
      viewBox="0 0 100 125"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Decorative arrow</title>
      <g transform="translate(100 0) scale(-1 1)">
        <path
          d="M6.9 23.27c-1.08-.41-2.48-1.7-1.64-2.91.87-1.25 3.12-.79 4.25-.36 28.35 10.76 54.56 26.82 77.04 47.13-.39-1.87-.78-3.74-1.18-5.61-1.04-4.95-1.65-10.3-3.59-15-1.29-3.15 5.04-2.84 5.98-.56 2.2 5.36 2.99 11.28 4.18 16.92l1.88 8.94c.44 2.07 2.22 6.1.3 7.76-1.87 1.62-4.86.5-6.92-.06l-8.86-2.42-18.55-5.07c-1.1-.3-3.07-1.24-2.71-2.71.36-1.43 2.6-1.41 3.66-1.12l15.18 4.14 7.17 1.96 3.8 1.04 1.55.42c-.03-.17-.06-.35-.1-.52C65.09 52.54 37.3 34.81 6.9 23.27Z"
        />
      </g>
    </svg>
    <span
      class={`mt-2 block w-fit whitespace-nowrap font-[Caveat] text-[clamp(2rem,3.1vw,3.1rem)] font-bold leading-[0.82] tracking-[-0.055em] [text-shadow:0.07em_0.07em_0_color-mix(in_srgb,var(--secondary)_12%,transparent)] transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
        isCardActive
          ? 'translate-y-1 opacity-0 delay-200'
          : 'translate-y-0 opacity-100 delay-0'
      }`}
    >
      {m.architecture_difference_callout()}
    </span>
  </div>
</div>
