<script lang="ts">
import Icon from '@iconify/svelte'

import { Button, Main } from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'

let locale = $derived(getCurrentLocale())
let steps = $derived.by(() => {
  locale
  return [
    {
      number: '01',
      icon: 'proicons:database',
      title: m.create_map_step_one_title(),
      body: m.create_map_step_one_body(),
    },
    {
      number: '02',
      icon: 'proicons:map',
      title: m.create_map_step_two_title(),
      body: m.create_map_step_two_body(),
    },
    {
      number: '03',
      icon: 'proicons:brush',
      title: m.create_map_step_three_title(),
      body: m.create_map_step_three_body(),
    },
  ]
})
</script>

<svelte:head>
  <title>{m.create_map_title()} | SaanSeoi</title>
  <meta name="description" content={m.create_map_meta_description()}>
</svelte:head>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <section class="max-w-4xl">
    <p
      class="font-body text-label-md font-semibold uppercase tracking-[0.12em] text-secondary"
    >
      {m.create_map_eyebrow()}
    </p>
    <h1
      class="mt-3 font-display text-headline-lg font-bold tracking-display-lg text-primary md:text-display-md"
    >
      {m.create_map_hero()}
    </h1>
    <p class="mt-6 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
      {m.create_map_description()}
    </p>
  </section>

  <section class="mt-14 border-t border-border-card pt-10 md:mt-20 md:pt-14">
    <div class="grid gap-px border border-border-card bg-border-card md:grid-cols-3">
      {#each steps as step}
        <article class="bg-background-alt p-6 md:p-8">
          <div class="flex items-center justify-between gap-4">
            <span class="font-body text-label-md font-semibold text-secondary">
              {step.number}
            </span>
            <Icon class="size-5 text-secondary" icon={step.icon} aria-hidden="true" />
          </div>
          <h2 class="mt-10 font-display text-headline-sm font-bold text-primary">
            {step.title}
          </h2>
          <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
            {step.body}
          </p>
        </article>
      {/each}
    </div>
  </section>

  <section
    class="mt-14 flex flex-wrap gap-3 border-t border-border-card pt-10 md:mt-18"
  >
    <Button href="/data" variant="secondary">{m.create_map_data_link()}</Button>
    <Button href="/basemaps/get-started" variant="secondary"
      >{m.create_map_basemap_link()}</Button
    >
    <Button
      href="https://maplibre.org/"
      target="_blank"
      rel="noreferrer"
      variant="primary"
      >{m.create_map_maplibre_link()}
      <Icon icon="proicons:arrow-up-right" class="size-4" /></Button
    >
  </section>
</Main>
