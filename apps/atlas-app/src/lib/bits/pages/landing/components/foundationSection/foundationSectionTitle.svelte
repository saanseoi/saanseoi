<script lang="ts">
import { getCurrentLocale, m } from '#lib/bits/internal/i18n.js'
</script>

<div
  class="absolute top-[52%] left-1/2 z-5 w-[min(70rem,calc(100%-3rem))] -translate-x-1/2 -translate-y-1/2 text-center max-[785px]:top-60 max-[785px]:w-[min(32rem,calc(100%-1rem))]"
>
  <p
    class="font-[Caveat] text-headline-lg font-black uppercase tracking-[0.14em] text-secondary"
  >
    {m.foundation_eyebrow()}
  </p>
  <h2
    class="mt-[0.85rem] mx-auto font-display text-[clamp(2rem,5.2vw,5rem)] font-black leading-[0.92] text-primary [text-shadow:0_1px_0_var(--foundation-map-background)] text-balance max-[785px]:text-[clamp(1.35rem,6.2vw,2.5rem)] dark:text-white"
  >
    {#if getCurrentLocale() === 'en'}
      <span class="block">Foundation for a Smarter,</span>
      <span class="block">Accessible City</span>
    {:else}
      {m.foundation_title()}
    {/if}
  </h2>
</div>
