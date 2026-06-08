<script lang="ts">
import { onMount } from 'svelte'
import heroBackground from '$lib/assets/bg.jpg'
import heroForeground from '$lib/assets/fg.png'
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

<div class="pointer-events-none absolute inset-0">
  <img alt="" class="dark-invert-image h-full w-full object-cover" src={heroBackground}>
  <div class="hero-image-fade-overlay absolute inset-0"></div>

  <div class="absolute inset-0">
    <div
      class="mx-auto grid h-full w-full grid-cols-1 @container [@container(min-width:860px)]:grid-cols-2"
    >
      <div aria-hidden="true" class="hidden [@container(min-width:860px)]:block"></div>
      <div
        class="mx-auto flex h-full w-full max-w-(--spacing-container-max) items-center justify-end px-(--spacing-margin-mobile) xl:px-(--spacing-margin-desktop)"
      >
        <div class="hidden mobile:block md:h-184 w-auto -mt-8 -mr-22">
          <img
            alt={m.hero_visual_alt()}
            class="hero-floating-image dark-invert-image h-full w-auto max-w-none object-contain object-right"
            src={heroForeground}
            style={floatStyle}
          >
        </div>
      </div>
    </div>
  </div>
  <div class="hero-image-tint-overlay absolute inset-0"></div>
</div>
