<script lang="ts">
import { Button, Main } from '$lib/bits'
import topo from '$lib/assets/topo.jpg'

import MarkerOrbit from './components/marker-orbit.svelte'
import PrincipleCard from './components/principle-card.svelte'

type ManifestoPrinciple = {
  number: string
  section: string
  lead: string
  body: string
}

type Props = {
  principles: ManifestoPrinciple[]
  subtitle: string
  badge: string
  ctaPrimary: string
  ctaSecondary: string
}

let { principles, subtitle, badge, ctaPrimary, ctaSecondary }: Props = $props()
const featuredPrinciple = $derived(principles[0])
const missionPrinciple = $derived(principles[3])
const closingPrinciple = $derived(principles[12])
</script>

<Main class="manifesto-shell">
  <section class="relative manifesto-header">
    <div
      class="mx-auto max-w-(--spacing-container-max) px-(--spacing-margin-mobile) pt-18 md:px-8 md:py-14 xl:px-(--spacing-margin-desktop)"
    >
      <div class="max-w-5xl">
        <div
          class="manifesto-header-badge mb-7 flex items-center gap-3 text-[0.72rem] font-semibold uppercase tracking-[0.16em]"
        >
          <span class="h-px w-12 bg-secondary"></span>
          {badge}
        </div>

        <h1
          class="max-w-[16ch] font-display text-[2.85rem] leading-[0.93] font-bold tracking-[-0.06em] text-primary sm:text-[4.25rem] lg:text-[5.3rem]"
        >
          A Manifesto for the
          <span
            class="manifesto-header-highlight mt-2 inline-block w-fit px-6 py-1 text-[2.8rem] leading-[0.95] italic sm:px-4 sm:pr-8 sm:text-display-md lg:text-[4.85rem]"
          >
            Digital Commons
          </span>
        </h1>

        <p
          class="mt-7 max-w-4xl font-body text-[1.08rem] leading-[1.75] text-foreground-alt sm:text-[1.32rem]"
        >
          {subtitle}
        </p>
      </div>
    </div>
  </section>

  <section class="relative overflow-hidden">
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 overflow-hidden"
    >
      <img
        alt=""
        class="dark-invert-image h-full w-full object-cover object-center opacity-22"
        src={topo}
      >
      <div class="manifesto-topo-overlay absolute inset-0"></div>
    </div>

    <div
      class="relative mx-auto max-w-(--spacing-container-max) space-y-16 px-(--spacing-margin-mobile) py-16 md:px-8 md:space-y-20 md:py-24 xl:px-(--spacing-margin-desktop)"
    >
      <div class="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-8">
        <div class="md:col-span-8">
          {#if featuredPrinciple}
            <PrincipleCard
              featured
              number={featuredPrinciple.number}
              section={featuredPrinciple.section}
              lead={featuredPrinciple.lead}
              body={featuredPrinciple.body}
              tone="accent"
            />
          {/if}
        </div>

        <MarkerOrbit />
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        {#each principles.slice(1, 3) as principle, index}
          <PrincipleCard
            number={principle.number}
            section={principle.section}
            lead={principle.lead}
            body={principle.body}
            tone={index === 1 ? 'accent' : 'default'}
          />
        {/each}
      </div>

      {#if missionPrinciple}
        <PrincipleCard
          align="center"
          number={missionPrinciple.number}
          section={missionPrinciple.section}
          lead={missionPrinciple.lead}
          body={missionPrinciple.body}
          tone="plain"
        />
      {/if}

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {#each principles.slice(4, 7) as principle, index}
          <PrincipleCard
            number={principle.number}
            section={principle.section}
            lead={principle.lead}
            body={principle.body}
            tone={index === 1 ? 'accent' : 'default'}
          />
        {/each}
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        {#each principles.slice(7, 9) as principle, index}
          <PrincipleCard
            number={principle.number}
            section={principle.section}
            lead={principle.lead}
            body={principle.body}
            tone={index === 0 ? 'accent' : 'default'}
          />
        {/each}
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {#each principles.slice(9, 12) as principle, index}
          <PrincipleCard
            number={principle.number}
            section={principle.section}
            lead={principle.lead}
            body={principle.body}
            tone={index === 1 ? 'accent' : 'default'}
          />
        {/each}
      </div>

      {#if closingPrinciple}
        <PrincipleCard
          number={closingPrinciple.number}
          section={closingPrinciple.section}
          lead={closingPrinciple.lead}
          body={closingPrinciple.body}
          tone="highlight"
        >
          <div class="mt-10 flex flex-col justify-center gap-16 sm:flex-row">
            <Button class="justify-center scale-120" href="/community"
              >{ctaSecondary}</Button
            >
            <Button
              class="justify-center scale-120"
              href="/datasets"
              variant="secondary"
            >
              {ctaPrimary}
            </Button>
          </div>
        </PrincipleCard>
      {/if}
    </div>
  </section>
</Main>

<style>
:global(.manifesto-shell) {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--background) 92%, transparent),
    color-mix(in srgb, var(--background) 84%, transparent)
  );
}

.manifesto-header {
  background: var(--background);
}

.manifesto-header-badge {
  color: var(--secondary);
}

.manifesto-header-highlight {
  background: var(--secondary-container);
  color: var(--on-secondary-container);
}

:global(.dark .manifesto-shell) {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--background) 96%, transparent),
    color-mix(in srgb, var(--surface-container-low) 88%, var(--background))
  );
}

:global(.dark) .manifesto-header {
  background: color-mix(in srgb, var(--background) 94%, var(--surface-container-low));
}

:global(.dark) .manifesto-header-highlight {
  background: color-mix(
    in srgb,
    var(--secondary-container) 84%,
    var(--surface-container-low)
  );
  color: var(--secondary-fixed);
}

.manifesto-topo-overlay {
  background: linear-gradient(
    180deg,
    rgb(from var(--background) r g b / 0.88),
    rgb(from var(--background) r g b / 0.76)
  );
}

:global(.dark) .manifesto-topo-overlay {
  background:
    linear-gradient(
      180deg,
      rgb(from var(--background) r g b / 0.72),
      rgb(from var(--background) r g b / 0.56)
    ),
    linear-gradient(
      180deg,
      rgb(from var(--surface-container-low) r g b / 0.24),
      rgb(from var(--background) r g b / 0.16)
    );
}
</style>
