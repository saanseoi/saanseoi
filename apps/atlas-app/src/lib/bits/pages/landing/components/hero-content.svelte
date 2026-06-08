<script lang="ts">
import Icon from '@iconify/svelte'

import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'

const heroTitleWidthClass = $derived(
  getCurrentLocale() === 'en' ? 'max-w-[11ch]' : 'max-w-[12ch]',
)
</script>

<div class="relative z-10 py-8 mobile:py-0 md:py-8 lg:py-8 xl:py-20">
  <div
    class="mx-auto grid max-w-(--spacing-container-max) gap-12 px-(--spacing-margin-mobile) md:px-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:items-center xl:gap-14 xl:px-(--spacing-margin-desktop)"
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
            class={`${heroTitleWidthClass} font-display text-[2.9rem] leading-[0.98] font-extrabold tracking-[-0.06em] text-primary sm:text-[3.6rem] lg:text-[4.4rem]`}
          >
            {m.hero_title()}
          </h1>
          <p
            class="relative isolate max-w-xl md:max-w-[32ch] lg:max-w-xl  font-body text-[1.04rem] leading-[1.8] text-foreground-alt before:absolute before:inset-[-0.15rem_-0.4rem] before:-z-10 before:rounded-[1.35rem] before:bg-surface/80 before:blur-xl before:backdrop-blur-md before:content-[''] sm:text-[1.1rem]"
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
        <Button href="/community" variant="secondary">
          {m.hero_cta_secondary()}
        </Button>
      </div>
    </div>

    <div aria-hidden="true" class="hidden xl:block"></div>
  </div>
</div>
