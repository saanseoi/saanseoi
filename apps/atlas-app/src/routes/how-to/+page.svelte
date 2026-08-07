<script lang="ts">
import Icon from '@iconify/svelte'

import { Main, PageDescription, PageHeader, PageTitle } from '$lib/bits'
import { m } from '$lib/bits/internal/i18n'

const guides = [
  {
    href: '/how-to/use-the-api',
    icon: 'proicons:api',
    title: () => m.how_to_use_api_title(),
    description: () => m.how_to_use_api_description(),
    useCases: () => m.how_to_use_api_use_cases(),
  },
  {
    href: '/how-to/create-a-map',
    icon: 'proicons:map',
    title: () => m.how_to_create_map_title(),
    description: () => m.how_to_create_map_description(),
    useCases: () => m.how_to_create_map_use_cases(),
  },
  {
    href: '/how-to/download-dataset',
    icon: 'proicons:download',
    title: () => m.how_to_download_dataset_title(),
    description: () => m.how_to_download_dataset_description(),
    useCases: () => m.how_to_download_dataset_use_cases(),
  },
]
</script>

<svelte:head>
  <title>{m.how_to_title()} | SaanSeoi</title>
  <meta name="description" content={m.how_to_meta_description()}>
</svelte:head>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <PageHeader class="max-w-3xl">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.how_to_eyebrow()}
    </p>
    <PageTitle class="mt-3">{m.how_to_hero()}</PageTitle>
    <PageDescription class="mt-5">{m.how_to_description()}</PageDescription>
  </PageHeader>

  <section
    class="mt-12 grid gap-px border border-border-card bg-border-card md:grid-cols-3"
  >
    {#each guides as guide}
      <a
        class="group bg-background-alt p-6 transition-colors hover:bg-secondary-container/30 md:p-8"
        href={guide.href}
      >
        <Icon class="size-6 text-secondary" icon={guide.icon} aria-hidden="true" />
        <h2 class="mt-12 font-display text-headline-sm font-bold text-primary">
          {guide.title()}
        </h2>
        <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
          {guide.description()}
        </p>
        <ul
          class="mt-6 list-disc border-t border-border-card pt-4 pl-5 font-body text-body-sm leading-6 text-foreground-alt"
        >
          <li>{guide.useCases()}</li>
        </ul>
        <span
          class="mt-6 inline-flex items-center gap-2 font-body text-label-md font-semibold text-secondary"
        >
          {m.how_to_title()}
          <Icon
            icon="proicons:arrow-right"
            class="size-4 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>
      </a>
    {/each}
  </section>
</Main>
