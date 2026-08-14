<script lang="ts">
import GuideWorksWith from '$lib/bits/pages/guides/components/guideWorksWith.svelte'
import Icon from '@iconify/svelte'

import { Button, Main, PageDescription, PageHeader, PageTitle } from '$lib/bits'
import { m } from '$lib/bits/internal/i18n'

const guides = [
  {
    href: '/guides/create-a-map',
    id: 'build-a-map',
    jumpLabel: 'Build a Map',
    darkImage: '/guides/build-a-map-dark.webp',
    imageAlt: 'A folded city map, mapping layers and laptop',
    lightImage: '/guides/build-a-map-light.webp',
    title: () => m.guide_create_map_title(),
    description: () => m.guide_create_map_description(),
    useCases: () => m.guide_create_map_use_cases().split('|'),
    buildModes: () => [
      {
        href: '/guides/create-a-map?llm-mode=manual',
        label: m.guide_build_mode_hands_on(),
      },
      {
        href: '/guides/create-a-map?llm-mode=assisted',
        label: m.guide_build_mode_llm_assisted(),
      },
      {
        href: '/guides/create-a-map?llm-mode=handover',
        label: m.guide_build_mode_agentic_ai(),
      },
    ],
    worksWith: () => [
      {
        title: m.guide_works_with_map_libraries(),
        items: [
          { icon: 'simple-icons:maplibre', label: m.guide_renderer_maplibre() },
          { icon: 'simple-icons:mapbox', label: m.guide_renderer_mapbox() },
          { icon: 'simple-icons:leaflet', label: m.guide_renderer_leaflet() },
        ],
      },
      {
        title: m.guide_works_with_site_platforms(),
        items: [
          { icon: 'simple-icons:wordpress', label: m.guide_embed_wordpress() },
          { icon: 'simple-icons:squarespace', label: m.guide_embed_squarespace() },
          { icon: 'simple-icons:wix', label: m.guide_embed_wix() },
          { icon: 'simple-icons:webflow', label: m.guide_embed_webflow() },
        ],
      },
      {
        title: m.guide_works_with_hosting(),
        items: [
          { icon: 'simple-icons:cloudflare', label: m.guide_host_cloudflare() },
          { icon: 'simple-icons:github', label: m.guide_host_github_pages() },
          { icon: 'simple-icons:vercel', label: m.guide_host_vercel() },
          { icon: 'simple-icons:netlify', label: m.guide_host_netlify() },
        ],
      },
    ],
  },
  {
    href: '/guides/use-the-api',
    id: 'data-from-api',
    jumpLabel: 'Get data from API',
    darkImage: '/guides/data-from-api-dark.webp',
    imageAlt: 'Map data flowing from an API into a detailed city map',
    lightImage: '/guides/data-from-api-light.webp',
    title: () => m.guide_use_api_title(),
    description: () => m.guide_use_api_description(),
    useCases: () => m.guide_use_api_use_cases().split('|'),
    comingSoon: true,
    worksWith: () => [
      {
        title: m.guide_works_with_map_libraries(),
        items: [
          { icon: 'proicons:api', label: 'Fetch' },
          { icon: 'simple-icons:axios', label: 'Axios' },
          { icon: 'simple-icons:python', label: 'Requests' },
          { icon: 'simple-icons:python', label: 'HTTPX' },
        ],
      },
      {
        title: m.guide_works_with_languages(),
        items: [
          { icon: 'simple-icons:typescript', label: 'TypeScript' },
          { icon: 'simple-icons:python', label: 'Python' },
          { icon: 'simple-icons:go', label: 'Go' },
          { icon: 'simple-icons:php', label: 'PHP' },
          { icon: 'simple-icons:openjdk', label: 'Java' },
          { icon: 'simple-icons:ruby', label: 'Ruby' },
        ],
      },
      {
        title: m.guide_works_with_standards(),
        items: [
          { icon: 'simple-icons:openapiinitiative', label: 'OpenAPI' },
          { icon: 'proicons:api', label: 'JSON' },
        ],
      },
    ],
  },
  {
    href: '/guides/download-dataset',
    id: 'download-datasets',
    jumpLabel: 'Download datasets',
    darkImage: '/guides/download-data-dark.webp',
    imageAlt: 'Downloaded map data organised in an archive box',
    lightImage: '/guides/download-data-light.webp',
    title: () => m.guide_download_dataset_title(),
    description: () => m.guide_download_dataset_description(),
    useCases: () => m.guide_download_dataset_use_cases().split('|'),
    comingSoon: true,
  },
]
</script>

<svelte:head>
  <title>{m.guide_title()} | SaanSeoi</title>
  <meta name="description" content={m.guide_meta_description()}>
</svelte:head>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <PageHeader class="max-w-3xl">
    <PageTitle>{m.guide_hero()}</PageTitle>
    <PageDescription class="mt-5">{m.guide_description()}</PageDescription>
    <nav class="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Jump to a guide">
      {#each guides as guide}
        <a
          class="guide-jump-link group flex min-h-14 items-center justify-between gap-4 px-6 py-3 font-body text-body-md font-semibold tracking-[0.01em] uppercase focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
          href={`#${guide.id}`}
        >
          {guide.jumpLabel}
          <Icon
            class="guide-jump-link__arrow size-6 shrink-0"
            icon="proicons:arrow-down"
            aria-hidden="true"
          />
        </a>
      {/each}
    </nav>
  </PageHeader>

  <section class="mt-10 border-t border-border-card lg:mt-24">
    {#each guides as guide, index}
      <article
        id={guide.id}
        class={`grid scroll-mt-24 items-center gap-8 py-10 md:py-14 lg:scroll-mt-32 lg:grid-cols-2 lg:gap-x-12 lg:py-18 ${index !== 0 ? 'border-t border-border-card' : ''} ${index === guides.length - 1 ? 'pb-0 md:pb-0 lg:pb-0' : ''}`}
      >
        <div class={`contents lg:block ${index % 2 === 1 ? 'lg:order-2' : ''}`}>
          <a
            class="group relative order-2 block aspect-square focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary lg:aspect-5/4"
            href={guide.href}
            aria-label={guide.title()}
          >
            <img
              class="guide-artwork size-full object-contain transition-transform duration-700 ease-out group-hover:scale-[1.025] dark:hidden"
              src={guide.lightImage}
              alt={guide.imageAlt}
              loading="lazy"
              decoding="async"
            >
            <img
              class="guide-artwork hidden size-full object-contain transition-transform duration-700 ease-out group-hover:scale-[1.025] dark:block"
              src={guide.darkImage}
              alt={guide.imageAlt}
              loading="lazy"
              decoding="async"
            >
          </a>
          <aside class="guide-best-for order-4 w-full lg:mt-7">
            <p
              class="font-body text-label-sm font-semibold tracking-[0.16em] text-secondary uppercase"
            >
              {m.guide_best_for()}
            </p>
            <ul class="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-2.5">
              {#each guide.useCases() as useCase, useCaseIndex}
                <li
                  class={`flex items-start gap-2 font-body text-body-sm leading-5 text-foreground-alt ${guide.useCases().length % 2 === 1 && useCaseIndex === guide.useCases().length - 1 ? 'col-span-2 justify-self-center' : ''}`}
                >
                  <span
                    class="mt-1.5 size-1.5 shrink-0 rounded-full bg-secondary"
                    aria-hidden="true"
                  ></span>
                  <span>{useCase}</span>
                </li>
              {/each}
            </ul>
          </aside>
        </div>

        <div
          class={`contents lg:relative lg:block lg:translate-y-8 ${index % 2 === 1 ? 'lg:order-1' : ''}`}
        >
          <div class="order-1">
            {#if guide.buildModes}
              <aside
                class="guide-build-modes mb-3 max-w-md"
                aria-label={m.guide_build_modes()}
              >
                <ul class="guide-build-modes__list">
                  {#each guide.buildModes() as mode, modeIndex}
                    <li>
                      <a
                        class="transition-colors hover:text-secondary focus-visible:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                        href={mode.href}
                      >
                        {mode.label}
                      </a>
                    </li>
                    {#if modeIndex < guide.buildModes().length - 1}
                      <li class="guide-build-modes__separator" aria-hidden="true">/</li>
                    {/if}
                  {/each}
                </ul>
              </aside>
            {:else if guide.comingSoon}
              <aside
                class="guide-build-modes guide-build-modes--coming-soon mb-8 max-w-md"
                aria-label={m.guide_coming_soon()}
              >
                <p class="guide-build-modes__prompt">{m.guide_coming_soon()}</p>
              </aside>
            {/if}
            <h2
              class="max-w-md font-display text-[clamp(2.8rem,5.2vw,5.1rem)] leading-[0.88] font-bold tracking-[-0.055em] text-primary"
            >
              <a
                class="transition-colors duration-300 hover:text-secondary focus-visible:text-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
                href={guide.href}
              >
                {guide.title()}
              </a>
            </h2>
          </div>
          <div class="order-3 max-w-md lg:mt-7">
            <p class="font-body text-body-lg leading-8 text-foreground-alt">
              {guide.description()}
            </p>
          </div>
          {#if guide.worksWith}
            <div class="order-5">
              <GuideWorksWith
                class="max-w-md lg:mt-10"
                title={m.guide_works_with()}
                groups={guide.worksWith()}
              />
            </div>
          {/if}
          {#if !guide.comingSoon}
            <div class="order-6 flex justify-center lg:mt-10 lg:justify-start">
              <Button
                class="guide-card-cta group min-w-52 justify-between rounded-none px-5"
                size="default"
                variant="text"
                href={guide.href}
              >
                Start Building
                <Icon
                  class="guide-card-cta__arrow size-5"
                  icon="proicons:arrow-right"
                  aria-hidden="true"
                />
              </Button>
            </div>
          {/if}
        </div>
      </article>
    {/each}
  </section>
</Main>

<style>
:global(html) {
  scroll-behavior: smooth;
}

.guide-best-for {
  width: 100%;
}

:global(.guide-card-cta),
.guide-jump-link {
  background: var(--color-secondary-container);
  color: white;
  transition:
    background-color 0.2s,
    color 0.2s,
    transform 0.2s;
}

:global(.guide-card-cta:not(:disabled):hover),
.guide-jump-link:hover {
  background: color-mix(in srgb, var(--color-secondary-container) 78%, black);
  color: white;
}

:global(.guide-card-cta__arrow),
:global(.guide-jump-link__arrow) {
  will-change: transform;
}

:global(.guide-card-cta:hover .guide-card-cta__arrow) {
  animation: guide-card-cta-arrow 0.42s ease-out;
}

:global(.guide-jump-link:hover .guide-jump-link__arrow) {
  animation: guide-jump-link-arrow 0.42s ease-out;
}

@keyframes guide-card-cta-arrow {
  0%,
  100% {
    transform: translateX(0);
  }

  45% {
    transform: translateX(0.4rem);
  }

  70% {
    transform: translateX(0.2rem);
  }
}

@keyframes guide-jump-link-arrow {
  0%,
  100% {
    transform: translateY(0);
  }

  45% {
    transform: translateY(0.4rem);
  }

  70% {
    transform: translateY(0.2rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  :global(html) {
    scroll-behavior: auto;
  }

  :global(.guide-card-cta__arrow),
  :global(.guide-jump-link__arrow) {
    animation: none !important;
  }
}

@media (min-width: 64rem) {
  .guide-best-for {
    margin-inline: auto;
    width: 80%;
  }
}

.guide-artwork {
  clip-path: polygon(
    0 0,
    16.667% 4%,
    33.333% 0,
    50% 4%,
    66.667% 0,
    83.333% 4%,
    100% 0,
    100% 100%,
    83.333% 96%,
    66.667% 100%,
    50% 96%,
    33.333% 100%,
    16.667% 96%,
    0 100%
  );
}

.guide-build-modes__prompt {
  color: var(--color-secondary);
  flex: none;
  font-family: Caveat, cursive;
  font-size: clamp(1.6rem, 2.7vw, 2.15rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 0.82;
  margin: 0;
  max-width: 3.8rem;
  transform: rotate(-3deg);
}

.guide-build-modes--coming-soon {
  align-items: center;
}

.guide-build-modes--coming-soon .guide-build-modes__prompt {
  max-width: none;
  transform: rotate(-2deg);
}

.guide-build-modes__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem 0.6rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.guide-build-modes__list li {
  color: var(--color-foreground-alt);
  font-family: Caveat, cursive;
  font-size: clamp(1.3rem, 2vw, 1.65rem);
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1;
  white-space: nowrap;
}

.guide-build-modes__separator {
  color: var(--color-secondary);
  font-family: var(--font-body);
  font-size: 0.78em;
  font-style: italic;
  font-weight: 600;
}

@media (max-width: 30rem) {
  .guide-build-modes {
    align-items: flex-start;
  }

  .guide-build-modes__list {
    gap: 0.4rem;
  }
}
</style>
