<script lang="ts">
import Icon from '@iconify/svelte'

import keyVisual from '$lib/assets/kv.png'
import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'
</script>

<section
  class="mx-auto grid max-w-(--spacing-container-max) gap-12 px-(--spacing-margin-mobile) py-12 md:px-8 md:py-16 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:items-center xl:gap-14 xl:px-(--spacing-margin-desktop) xl:py-20"
>
  <div class="space-y-8">
    <div class="space-y-5">
      <span
        class="inline-flex items-center gap-2 rounded-(--radius-sm) border border-secondary/25 bg-secondary/8 px-3 py-1 font-body text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-secondary"
      >
        <Icon icon="proicons:globe" class="size-3.5" />
        {m.hero_badge()}
      </span>

      <div class="space-y-4">
        <h1
          class="max-w-[11ch] font-display text-[2.9rem] leading-[0.98] font-extrabold tracking-[-0.06em] text-primary sm:text-[3.6rem] lg:text-[4.4rem]"
        >
          {m.hero_title()}
        </h1>
        <p
          class="max-w-xl font-body text-[1.04rem] leading-[1.8] text-foreground-alt sm:text-[1.1rem]"
        >
          {m.hero_description()}
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row">
      <Button href="/datasets" variant="primary">
        {m.hero_cta_primary()}
        <Icon icon="proicons:arrow-right" class="size-4" />
      </Button>
      <Button href="/community" variant="secondary"> {m.hero_cta_secondary()} </Button>
    </div>
  </div>

  <div
    class="relative overflow-hidden border border-border-card/60 bg-background-alt p-4 sm:p-6"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,107,89,0.08),transparent_36%),linear-gradient(to_bottom,rgba(255,255,255,0.6),rgba(255,255,255,0))]"
    ></div>
    <img
      alt={m.hero_visual_alt()}
      class="relative z-10 h-full w-full object-cover"
      src={keyVisual}
    >
  </div>
</section>
