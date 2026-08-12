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
      title: m.get_started_step_one_title(),
      body: m.get_started_step_one_body(),
    },
    {
      number: '02',
      title: m.api_keys_create_button(),
      body: m.get_started_step_two_body(),
    },
    {
      number: '03',
      title: m.get_started_step_three_title(),
      body: m.get_started_step_three_body(),
    },
  ]
})
</script>

<svelte:head>
  <title>{m.guide_use_api_title()} | SaanSeoi</title>
  <meta name="description" content={m.get_started_meta_description()}>
</svelte:head>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-20"
>
  <div class="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] lg:gap-20">
    <section>
      <p
        class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
      >
        {m.get_started_api_access()}
      </p>
      <h1
        class="mt-3 max-w-4xl font-display text-headline-lg font-bold tracking-display-lg text-primary md:text-display-md"
      >
        {m.get_started_hero()}
      </h1>
      <p class="mt-6 max-w-2xl font-body text-body-lg leading-8 text-foreground-alt">
        {m.get_started_description()}
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <Button href="/docs" variant="secondary">{m.get_started_read_docs()}</Button>
        <Button href="/sign-up" variant="primary">{m.auth_create_account()}</Button>
      </div>
    </section>
    <aside
      class="border border-border-card bg-surface-container-low p-6 shadow-card md:p-8"
    >
      <div
        class="flex size-11 items-center justify-center bg-secondary-container text-secondary"
      >
        <Icon icon="proicons:key" class="size-5" />
      </div>
      <h2 class="mt-6 font-display text-headline-sm font-bold text-primary">
        {m.get_started_key_heading()}
      </h2>
      <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
        {m.get_started_key_description()}
      </p>
      <code
        class="mt-6 block overflow-x-auto border border-border-card bg-background-alt px-4 py-3 font-mono text-sm text-foreground"
        >x-api-key: SS_…</code
      >
    </aside>
  </div>

  <section class="mt-18 border-t border-border-card pt-10 md:mt-24 md:pt-14">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.get_started_how_it_works()}
    </p>
    <div
      class="mt-6 grid gap-px border border-border-card bg-border-card md:grid-cols-3"
    >
      {#each steps as step}
        <article class="bg-background-alt p-6 md:p-8">
          <p class="font-body text-label-md font-semibold text-secondary">
            {step.number}
          </p>
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
    class="mt-18 border-l-4 border-secondary bg-surface-container-low px-6 py-8 md:mt-24 md:px-10 md:py-10"
  >
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.get_started_fair_use()}
    </p>
    <h2 class="mt-3 font-display text-headline-md font-bold text-primary">
      {m.get_started_fair_use_heading()}
    </h2>
    <div
      class="mt-5 max-w-3xl space-y-4 font-body text-body-md leading-7 text-foreground-alt"
    >
      <p>{m.get_started_fair_use_body_one()}</p>
      <p>{m.get_started_fair_use_body_two()}</p>
    </div>
  </section>
</Main>
