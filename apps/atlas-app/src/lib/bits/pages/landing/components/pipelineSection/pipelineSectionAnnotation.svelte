<script lang="ts">
import { onMount } from 'svelte'

import { m } from '$lib/bits/internal/i18n'

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
  class="pointer-events-none absolute top-[34%] left-1/2 z-4 hidden -translate-x-1/2 text-secondary min-[901px]:block"
  aria-hidden="true"
>
  <span
    class="annotation-floating block whitespace-nowrap font-[Caveat] text-[clamp(2rem,3.1vw,3.1rem)] font-bold leading-[0.82] tracking-[-0.055em] [text-shadow:0.07em_0.07em_0_color-mix(in_srgb,var(--secondary)_12%,transparent)]"
    style={floatStyle}
  >
    {m.pipeline_process_callout()}
  </span>
</div>
