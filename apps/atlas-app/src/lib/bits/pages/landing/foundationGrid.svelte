<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'

const foundationPillars = [
  {
    icon: 'gravity-ui:abbr-api',
    title: () => m.foundation_public_data_title(),
    description: () => m.foundation_public_data_description(),
    href: '/datasets',
    cta: () => m.foundation_public_data_cta(),
  },
  {
    icon: 'proicons:treasure-chest',
    title: () => m.foundation_community_apps_title(),
    description: () => m.foundation_community_apps_description(),
    href: '/projects',
    cta: () => m.foundation_community_apps_cta(),
  },
  {
    icon: 'proicons:megaphone',
    title: () => m.foundation_humane_tech_title(),
    description: () => m.foundation_humane_tech_description(),
    href: '/manifesto',
    cta: () => m.foundation_humane_tech_cta(),
  },
] as const
</script>

<section
  class="mx-auto max-w-(--spacing-container-max) px-(--spacing-margin-mobile) py-14 md:px-8 md:py-20 xl:px-(--spacing-margin-desktop)"
>
  <div class="max-w-2xl space-y-4">
    <h2
      class="font-display text-headline-lg font-bold leading-[1.05] tracking-headline-lg text-primary sm:text-[2.6rem]"
    >
      {m.foundation_title()}
    </h2>
    <p class="font-body text-body-md leading-[1.8] text-foreground-alt">
      {@html m.foundation_description()}
    </p>
  </div>

  <div class="mt-10 grid gap-5 lg:grid-cols-3">
    {#each foundationPillars as pillar}
      <article
        class="relative flex h-full flex-col overflow-hidden border border-border-card/55 bg-background-alt p-6"
      >
        <div
          class="pointer-events-none absolute right-4 top-4 text-foreground/5 -rotate-15"
          aria-hidden="true"
        >
          <Icon icon={pillar.icon} class="h-45 w-45" />
        </div>

        <div class="relative mt-6 space-y-4">
          <h3
            class="font-display text-[1.55rem] font-bold leading-[1.1] tracking-display-md text-primary"
          >
            {pillar.title()}
          </h3>
          <p class="font-body text-[0.98rem] leading-[1.8] text-foreground-alt">
            {@html pillar.description()}
          </p>
        </div>
        <Button
          class="mt-auto justify-end px-0 pt-8 text-[0.84rem] font-semibold uppercase tracking-[0.07em] text-secondary focus-visible:ring-offset-background-alt"
          href={pillar.href}
          size="compact"
          variant="text"
        >
          {pillar.cta()}
          ↗
        </Button>
      </article>
    {/each}
  </div>
</section>
