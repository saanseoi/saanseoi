<script lang="ts">
import { onMount } from 'svelte'
import heroBackground from '#lib/assets/bg.jpg'
import heroForeground from '#lib/assets/fg.png'
import { m } from '#lib/bits/internal/i18n.js'

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

<svelte:head>
  <link rel="preload" as="image" href={heroBackground} fetchpriority="high">
</svelte:head>

<div class="pointer-events-none absolute inset-0">
  <img
    alt=""
    class="hero-background dark-invert-image h-full w-full object-cover opacity-0 animate-[hero-background-reveal_900ms_ease-out_80ms_forwards] motion-reduce:animate-none motion-reduce:opacity-100"
    fetchpriority="high"
    loading="eager"
    src={heroBackground}
  >
  <div class="hero-image-fade-overlay absolute inset-0"></div>

  <div class="hero-foreground-layer absolute inset-0 max-md:overflow-hidden">
    <div
      class="mx-auto grid h-full w-full grid-cols-1 @container [@container(min-width:860px)]:grid-cols-2"
    >
      <div aria-hidden="true" class="hidden [@container(min-width:860px)]:block"></div>
      <div
        class="mx-auto flex h-full w-full max-w-(--spacing-container-max) items-center justify-end px-(--spacing-margin-md) xl:px-(--spacing-margin-xl)"
      >
        <div
          class="hero-foreground-frame absolute inset-y-0 left-[40vw] my-auto h-[calc((100svh-var(--hero-header-height))*0.95)] max-h-[calc(100%-2rem)] w-max overflow-visible opacity-0 [--hero-header-height:4.5rem] animate-[hero-foreground-reveal_760ms_cubic-bezier(0.2,0.7,0.2,1)_220ms_forwards] motion-reduce:animate-none motion-reduce:opacity-100"
        >
          <img
            alt={m.hero_visual_alt()}
            class="hero-floating-image dark-invert-image h-full w-auto max-w-none origin-[100%_50%] object-contain object-left max-md:opacity-0"
            fetchpriority="high"
            loading="eager"
            src={heroForeground}
            style={floatStyle}
          >
        </div>
      </div>
    </div>
  </div>
  <div class="hero-image-tint-overlay absolute inset-0"></div>
</div>

<style>
@keyframes -global-hero-background-reveal {
  to {
    opacity: 1;
  }
}

@keyframes -global-hero-foreground-reveal {
  from {
    opacity: 0;
    transform: translateY(0.85rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
