<script lang="ts">
import mapFoundationData from '#lib/assets/guides/map-foundation-data.png'
import mapFoundationRender from '#lib/assets/guides/map-foundation-render.png'
import { m } from '#lib/bits/internal/i18n.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

const nextSteps = [
  {
    href: '/guides/create-a-map',
    image: mapFoundationRender,
    title: m.guide_api_keys_next_steps_map_title,
    body: m.guide_api_keys_next_steps_map_body,
  },
  {
    href: '/guides/use-the-api',
    image: mapFoundationData,
    title: m.guide_api_keys_next_steps_api_title,
    body: m.guide_api_keys_next_steps_api_body,
  },
]
</script>

<section
  aria-labelledby="guide-api-keys-next-steps"
  id="api-key-next-steps"
  class="mt-14 border-t border-border-card pt-8 md:mt-18 md:pt-10"
>
  <div class="max-w-3xl">
    <h2
      id="guide-api-keys-next-steps"
      class="font-display text-headline-md font-bold text-primary"
    >
      {m.guide_api_keys_next_steps_heading()}
    </h2>
    <p class="mt-3 font-body text-body-md leading-7 text-foreground-alt">
      {m.guide_api_keys_next_steps_body()}
    </p>
  </div>

  <div class="mt-6 grid gap-5 md:grid-cols-2">
    {#each nextSteps as step}
      <a
        class="group relative grid min-h-48 overflow-hidden border border-border-card bg-surface-container-low transition-[border-color,box-shadow] duration-200 hover:border-secondary hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary sm:grid-cols-[13rem_minmax(0,1fr)]"
        href={step.href}
      >
        <span
          aria-hidden="true"
          class="absolute bottom-0 left-0 h-1 w-0 bg-secondary transition-[width] duration-300 group-hover:w-full"
        ></span>
        <div
          class="relative flex min-h-44 items-center justify-center overflow-hidden bg-secondary-container/25 p-2"
        >
          <span
            aria-hidden="true"
            class="absolute size-40 rotate-12 bg-secondary/15 transition-transform duration-300 group-hover:rotate-24 group-hover:scale-125"
          ></span>
          <img
            alt=""
            class="relative h-full max-h-36 w-full object-contain transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-2"
            src={step.image}
          >
        </div>
        <div class="relative flex min-w-0 flex-col px-5 pt-6 pb-4 sm:pl-6">
          <h3
            class="font-[Caveat] text-[clamp(1.75rem,2.6vw,2.25rem)] font-bold leading-[0.78] tracking-[-0.04em] text-primary"
          >
            {step.title()}
          </h3>
          <p class="mt-3 font-body text-body-sm leading-6 text-foreground-alt">
            {step.body()}
          </p>
          <span
            class="mt-auto inline-flex items-center gap-2 pt-4 font-body text-label-md font-semibold text-secondary"
          >
            {m.guide_api_keys_next_steps_link()}
            <Icon
              aria-hidden="true"
              class="size-4 transition-transform group-hover:translate-x-1"
              icon="proicons:arrow-right"
            />
          </span>
        </div>
      </a>
    {/each}
  </div>
</section>
