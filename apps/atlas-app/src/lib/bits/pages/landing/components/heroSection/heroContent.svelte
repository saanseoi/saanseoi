<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { cubicOut } from 'svelte/easing'
import { onMount } from 'svelte'

import { getCurrentLocale, m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'

const heroTitleWidthClass = $derived(
  getCurrentLocale() === 'en' ? 'max-w-[11ch]' : 'max-w-[12ch]',
)

const isEnglishTitle = $derived(getCurrentLocale() === 'en')

const rotatingWordWidthClass = $derived(
  getCurrentLocale() === 'en' ? 'min-w-[14ch]' : 'min-w-[5ch]',
)

const titleSpacer = $derived(getCurrentLocale() === 'en' ? ' ' : '')

const rotatingWords = $derived.by(() => [
  m.hero_rotating_word_urbanist(),
  m.hero_rotating_word_dreamer(),
  m.hero_rotating_word_maker(),
  m.hero_rotating_word_planner(),
  m.hero_rotating_word_journalist(),
  m.hero_rotating_word_creative(),
  m.hero_rotating_word_cartographer(),
  m.hero_rotating_word_detective(),
  m.hero_rotating_word_archaeologist(),
  m.hero_rotating_word_matchmaker(),
  m.hero_rotating_word_skeptic(),
  m.hero_rotating_word_gardener(),
])

let activeWordIndex = $state(0)

const activeWord = $derived(rotatingWords[activeWordIndex] ?? rotatingWords[0] ?? '')

function wordMotion(
  _node: Element,
  { y = 24, startBlur = 8 }: { y?: number; startBlur?: number } = {},
) {
  return {
    duration: 420,
    easing: cubicOut,
    css: (t: number, u: number) =>
      `transform: translate3d(0, ${u * y}px, 0) scale(${0.96 + t * 0.04}); opacity: ${t}; filter: blur(${u * startBlur}px);`,
  }
}

onMount(() => {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

  if (mediaQuery.matches || rotatingWords.length <= 1) {
    return
  }

  const interval = window.setInterval(() => {
    activeWordIndex = (activeWordIndex + 1) % rotatingWords.length
  }, 2200)

  return () => window.clearInterval(interval)
})
</script>

<div
  class="hero-content relative z-10 flex h-full min-h-147 items-center py-8 md:py-8 lg:min-h-171 lg:py-8 xl:py-20"
>
  <div
    class="hero-content-grid mx-auto grid w-full min-w-0 max-w-(--spacing-container-max) gap-12 px-(--spacing-margin-md) md:px-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:items-center xl:gap-14 xl:px-(--spacing-margin-xl) min-[640px]:max-[767px]:justify-items-center min-[924px]:max-[1279px]:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] min-[924px]:max-[1279px]:items-center min-[924px]:max-[1279px]:gap-8"
  >
    <div
      class="hero-content-main min-w-0 min-[640px]:max-[767px]:w-[min(29rem,100%)] min-[924px]:max-[1279px]:w-[min(28rem,100%)] min-[924px]:max-[1279px]:justify-self-start min-[924px]:max-[1279px]:ms-[clamp(3rem,7vw,7rem)] min-[924px]:max-[1279px]:text-left"
    >
      <div class="space-y-5">
        <span
          class="hero-eyebrow inline-flex items-center gap-2 rounded-sm border border-secondary/25 bg-secondary/8 px-3 py-1 font-body text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-secondary max-[785px]:bg-surface"
        >
          <Icon icon="proicons:globe" class="size-3.5" />
          {m.hero_badge()}
        </span>

        <div class="space-y-4">
          <h1
            class={`hero-title ${heroTitleWidthClass} font-display text-[2.9rem] leading-[0.98] font-extrabold tracking-[-0.06em] text-primary sm:text-[3.6rem] lg:text-[4.4rem] max-[785px]:[-webkit-text-stroke:0.65px_rgb(0_0_0/0.62)] max-[785px]:[paint-order:stroke_fill] min-[924px]:max-[1279px]:text-[3.75rem]`}
          >
            {#if isEnglishTitle}
              {m.hero_title_prefix()}{titleSpacer}
              <span class="inline-flex items-baseline whitespace-nowrap">
                <span
                  class={`relative inline-grid h-[1.1em] overflow-hidden align-baseline ${rotatingWordWidthClass}`}
                >
                  {#key `${getCurrentLocale()}-${activeWord}`}
                    <span
                      class="col-start-1 row-start-1 block will-change-transform"
                      in:wordMotion={{ y: 28 }}
                      out:wordMotion={{ y: -28 }}
                    >
                      {`${activeWord} ${m.hero_title_suffix()}`}
                    </span>
                  {/key}
                </span>
              </span>
            {:else}
              <span class="block whitespace-nowrap">
                {m.hero_title_prefix()}
                <span
                  class={`relative inline-grid h-[1.1em] overflow-hidden align-baseline ${rotatingWordWidthClass}`}
                >
                  {#key `${getCurrentLocale()}-${activeWord}`}
                    <span
                      class="col-start-1 row-start-1 block will-change-transform"
                      in:wordMotion={{ y: 28 }}
                      out:wordMotion={{ y: -28 }}
                    >
                      {activeWord}
                    </span>
                  {/key}
                </span>
              </span>
              <span class="block">{m.hero_title_suffix()}</span>
            {/if}
          </h1>
        </div>
      </div>

      <div class="hero-actions mt-1">
        <p
          class="max-w-xl md:max-w-[33ch] lg:max-w-[43ch] min-[640px]:max-[767px]:max-w-none min-[924px]:max-[1279px]:mx-0"
        >
          <span
            class="box-decoration-clone bg-surface/90 px-1 py-0.5 font-body text-[1.04rem] leading-[1.8] text-foreground-alt sm:text-[1.1rem]"
          >
            {m.hero_description()}
          </span>
        </p>
        <div
          class="hero-cta-group mt-4 flex w-full max-w-xl flex-col gap-3 sm:flex-row min-[640px]:max-[767px]:w-full min-[640px]:max-[767px]:justify-center min-[924px]:max-[1279px]:justify-start"
        >
          <Button
            class="w-full sm:w-auto sm:shrink-0 min-[640px]:max-[767px]:flex-[0_0_auto] min-[640px]:max-[767px]:whitespace-nowrap"
            href="#community"
            variant="secondary"
          >
            {m.hero_cta_secondary()}
          </Button>
          <Button
            class="w-full sm:w-auto sm:shrink-0 min-[640px]:max-[767px]:flex-[0_0_auto] min-[640px]:max-[767px]:whitespace-nowrap"
            href="/data"
            variant="primary"
          >
            {m.hero_cta_primary()}
            <Icon icon="proicons:arrow-right" class="size-4" />
          </Button>
        </div>
      </div>
    </div>

    <div aria-hidden="true" class="hidden xl:block"></div>
  </div>
</div>
