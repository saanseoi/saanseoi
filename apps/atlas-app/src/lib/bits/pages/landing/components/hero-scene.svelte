<script lang="ts">
import heroBackground from '$lib/assets/bg.jpg'
import heroForeground from '$lib/assets/fg.png'
import { m } from '$lib/bits/internal/i18n'
</script>

<div class="pointer-events-none absolute inset-0">
  <img alt="" class="dark-invert-image h-full w-full object-cover" src={heroBackground}>
  <div class="hero-image-fade-overlay absolute inset-0"></div>
  <div class="absolute inset-0 py-4">
    <div
      class="mx-auto grid h-full max-w-(--spacing-container-max) px-(--spacing-margin-mobile) md:px-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:gap-14 xl:px-(--spacing-margin-desktop)"
    >
      <div aria-hidden="true" class="hidden md:block"></div>
      <div class="flex h-full items-center justify-end">
        <img
          alt={m.hero_visual_alt()}
          class="hidden sm:block dark-invert-image h-full w-[60%] scale-135 object-contain md:object-right mask-[linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.75)_45%,#000_50%,#000_100%)] xl:w-full xl:mask-none"
          src={heroForeground}
        >
      </div>
    </div>
  </div>
  <div class="hero-image-tint-overlay absolute inset-0"></div>
</div>
