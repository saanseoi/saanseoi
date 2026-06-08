<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'

const showcaseTiles = [
  {
    icon: 'proicons:shop',
    title: () => m.showcase_cultural_mapping_title(),
    description: () => m.showcase_cultural_mapping_description(),
    href: '/projects/cultural-mapping',
    tone: 'neutral',
  },
  {
    icon: 'proicons:bus',
    title: () => m.showcase_transit_flow_title(),
    description: () => m.showcase_transit_flow_description(),
    href: '/projects/transit-flow',
    tone: 'accent',
  },
] as const
</script>

<section
  class="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] py-6 md:px-8 md:py-10 xl:px-[var(--spacing-margin-desktop)]"
>
  <div class="grid gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(18rem,1fr)]">
    <article
      class="relative overflow-hidden bg-primary px-6 py-8 text-on-primary sm:px-8 sm:py-10 lg:min-h-[27rem]"
    >
      <div
        class="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:12px_12px] opacity-40"
      ></div>
      <div
        class="relative z-10 flex h-full max-w-[34rem] flex-col justify-end space-y-4"
      >
        <span
          class="font-body text-[0.82rem] font-bold uppercase tracking-[0.11em] text-[color:var(--color-on-tertiary-container)]"
        >
          {m.showcase_eyebrow()}
        </span>
        <h2
          class="font-display text-[2.4rem] font-bold leading-[1.03] tracking-[-0.05em] sm:text-[3.1rem]"
        >
          {m.showcase_title()}
        </h2>
        <p class="font-body text-[1rem] leading-[1.8] text-on-primary/70">
          {m.showcase_description()}
        </p>
        <div class="pt-2">
          <Button
            class="bg-background-alt text-foreground hover:bg-muted focus-visible:ring-offset-primary"
            href="/datasets/tong-lau-registry"
            size="compact"
            variant="primary"
          >
            {m.showcase_cta()}
          </Button>
        </div>
      </div>
    </article>

    <div class="grid gap-3">
      {#each showcaseTiles as tile}
        <a
          class={tile.tone === 'accent'
            ? 'flex min-h-[13rem] flex-col justify-between bg-secondary-fixed p-6 text-on-secondary-fixed transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            : 'flex min-h-[13rem] flex-col justify-between bg-muted p-6 text-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-background'}
          href={tile.href}
        >
          <div class="inline-flex size-9 items-center justify-center text-secondary">
            <Icon icon={tile.icon} class="size-5" />
          </div>
          <div class="space-y-2">
            <h3
              class="font-display text-[1.4rem] font-bold leading-[1.1] tracking-[-0.03em]"
            >
              {tile.title()}
            </h3>
            <p class="max-w-[18rem] font-body text-[0.96rem] leading-[1.7] opacity-75">
              {tile.description()}
            </p>
          </div>
        </a>
      {/each}
    </div>
  </div>
</section>
