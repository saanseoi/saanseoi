<script lang="ts">
import Icon from '@iconify/svelte'

import { getCurrentLocale } from '$lib/bits/internal/i18n'

import { getBasemapMessage as getMessage } from './basemapMessages'

let locale = $derived(getCurrentLocale())
const t = (key: Parameters<typeof getMessage>[0]) => {
  locale
  return getMessage(key)
}

const steps = [
  {
    icon: 'proicons:user',
    number: '01',
    title: 'tiles_getting_started_step_one_title',
    body: 'tiles_getting_started_step_one_body',
  },
  {
    icon: 'proicons:key',
    number: '02',
    title: 'tiles_getting_started_step_two_title',
    body: 'tiles_getting_started_step_two_body',
  },
  {
    icon: 'proicons:map',
    number: '03',
    title: 'tiles_getting_started_step_three_title',
    body: 'tiles_getting_started_step_three_body',
  },
] as const
</script>

<section class="mt-16 border-t border-border-card pt-10 md:mt-24 md:pt-14">
  <p
    class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
  >
    {t('tiles_getting_started_before_code')}
  </p>
  <div class="mt-6 grid gap-px border border-border-card bg-border-card md:grid-cols-3">
    {#each steps as step}
      <article class="bg-background-alt p-6 md:p-8">
        <p class="font-body text-label-md font-semibold text-secondary">
          {step.number}
        </p>
        <Icon icon={step.icon} class="mt-10 size-6 text-primary" />
        <h2 class="mt-4 font-display text-headline-sm font-bold text-primary">
          {t(step.title)}
        </h2>
        <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
          {t(step.body)}
        </p>
      </article>
    {/each}
  </div>
</section>
