<script lang="ts">
import { Button, Main } from '$lib/bits'
import { m } from '$lib/bits/internal/i18n'
</script>

<svelte:head>
  <title>{m.guide_download_dataset_title()} | SaanSeoi</title>
  <meta name="description" content={m.guide_download_dataset_description()}>
</svelte:head>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <section class="max-w-3xl">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_eyebrow()}
    </p>
    <h1
      class="mt-3 font-display text-headline-lg font-bold tracking-display-lg text-primary md:text-display-md"
    >
      {m.guide_download_dataset_title()}
    </h1>
    <p class="mt-6 font-body text-body-lg leading-8 text-foreground-alt">
      {m.guide_coming_soon()}
    </p>
    <Button class="mt-8" href="/data" variant="primary"
      >{m.guide_explore_data()}</Button
    >
  </section>
</Main>
