<script lang="ts">
import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import { apiFamilyThemes } from '#lib/registry/apiFamilyTheme.js'

import GuideUseTheApiDomainCard from './guideUseTheApiDomainCard.svelte'
import GuideUseTheApiFamilyLink from './guideUseTheApiFamilyLink.svelte'
import type { UseTheApiGuideFamily } from './useTheApiGuide'

type Props = {
  apiFamilies: UseTheApiGuideFamily[]
}

let { apiFamilies }: Props = $props()
let locale = $derived(getCurrentLocale())

const familyOrder = ['divisions', 'stats', 'places', 'addresses', 'streets'] as const
const comingSoonFamilies = new Set(['places', 'streets'])
let orderedApiFamilies = $derived(
  [
    ...apiFamilies.filter(family =>
      familyOrder.includes(family.familyType as (typeof familyOrder)[number]),
    ),
    ...apiFamilies.filter(
      family =>
        !familyOrder.includes(family.familyType as (typeof familyOrder)[number]),
    ),
  ].sort((left, right) => {
    const leftIndex = familyOrder.indexOf(
      left.familyType as (typeof familyOrder)[number],
    )
    const rightIndex = familyOrder.indexOf(
      right.familyType as (typeof familyOrder)[number],
    )
    return (
      (leftIndex === -1 ? familyOrder.length : leftIndex) -
      (rightIndex === -1 ? familyOrder.length : rightIndex)
    )
  }),
)

const familyName = (familyType: string) =>
  ({
    addresses: 'Addresses',
    divisions: 'Divisions',
    places: 'Places',
    stats: 'Statistics',
    streets: 'Streets',
  })[familyType] ?? familyType

const domainName = (domain: UseTheApiGuideFamily['domains'][number]) =>
  selectLocalisedRow(domain.i18n, locale)?.name ?? domain.code

const domainDescription = (domain: UseTheApiGuideFamily['domains'][number]) =>
  selectLocalisedRow(domain.i18n, locale)?.description

const familyTheme = (familyType: string) =>
  apiFamilyThemes[familyType as keyof typeof apiFamilyThemes]
</script>

<section class="mt-18 border-t border-border-card pt-10 md:mt-24 md:pt-14">
  <div class="max-w-3xl">
    <h2 class="font-display text-headline-md font-bold text-primary">
      {m.guide_use_api_latest_notes_heading()}
    </h2>
    <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
      {m.guide_use_api_latest_notes_description()}
    </p>
  </div>

  <nav
    class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    aria-label="API family sections"
  >
    {#each orderedApiFamilies as apiFamily (apiFamily.familyType)}
      {@const theme = familyTheme(apiFamily.familyType)}
      {#if theme}
        <GuideUseTheApiFamilyLink
          familyType={apiFamily.familyType as keyof typeof apiFamilyThemes}
          href={`#api-family-${apiFamily.familyType}`}
          isComingSoon={comingSoonFamilies.has(apiFamily.familyType)}
        />
      {/if}
    {/each}
  </nav>

  <div class="mt-14 space-y-12 md:mt-18 md:space-y-16">
    {#each orderedApiFamilies as apiFamily (apiFamily.familyType)}
      {@const theme = familyTheme(apiFamily.familyType)}
      {#if theme}
        <section
          id={`api-family-${apiFamily.familyType}`}
          class="scroll-mt-28 border-t border-border-card pt-8 md:pt-10"
          aria-labelledby={`api-family-${apiFamily.familyType}-heading`}
        >
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p
                class="font-mono text-[0.72rem] font-bold tracking-[0.14em] text-secondary uppercase"
              >
                API FAMILY
              </p>
              <h3
                id={`api-family-${apiFamily.familyType}-heading`}
                class="mt-1 font-display text-headline-md font-bold text-primary"
              >
                {familyName(apiFamily.familyType)}
              </h3>
            </div>
            {#if comingSoonFamilies.has(apiFamily.familyType)}
              <span
                class="rounded-full border border-border-card px-2.5 py-1 font-body text-[0.7rem] font-semibold text-secondary"
                >Coming soon</span
              >
            {/if}
          </div>

          <div class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {#each apiFamily.domains as domain (domain.code)}
              <GuideUseTheApiDomainCard
                code={domain.code}
                description={domainDescription(domain)}
                familyType={apiFamily.familyType as keyof typeof apiFamilyThemes}
                href={domain.latestReleaseHref}
                isComingSoon={comingSoonFamilies.has(apiFamily.familyType)}
                latestReleaseCode={domain.latestReleaseCode}
                name={domainName(domain)}
              />
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </div>
</section>
