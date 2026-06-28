<script lang="ts">
import Icon from '@iconify/svelte'
import { cubicOut } from 'svelte/easing'
import { onMount } from 'svelte'

import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'

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

// biome-ignore lint/correctness/noUnusedVariables: used by Svelte transition directives.
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
  class="relative z-10 flex h-147 items-center py-8 mobile:py-0 md:py-8 lg:h-171 lg:py-8 xl:py-20"
>
  <div
    class="mx-auto grid w-full max-w-(--spacing-container-max) gap-12 px-(--spacing-margin-mobile) md:px-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:items-center xl:gap-14 xl:px-(--spacing-margin-desktop)"
  >
    <div class="space-y-8">
      <div class="space-y-5">
        <span
          class="inline-flex items-center gap-2 rounded-(--radius-sm) border border-secondary/25 bg-secondary/8 px-3 py-1 font-body text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-secondary"
        >
          <Icon icon="proicons:globe" class="size-3.5" />
          {m.hero_badge()}
        </span>

        <div class="space-y-4">
          <h1
            class={`${heroTitleWidthClass} font-display text-[2.9rem] leading-[0.98] font-extrabold tracking-[-0.06em] text-primary sm:text-[3.6rem] lg:text-[4.4rem]`}
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
          <p
            class="relative isolate max-w-xl md:max-w-[33ch] lg:max-w-xl  font-body text-[1.04rem] leading-[1.8] text-foreground-alt before:absolute before:inset-[-0.15rem_-0.4rem] before:-z-10 before:rounded-[1.35rem] before:bg-surface/80 before:blur-xl before:backdrop-blur-md before:content-[''] sm:text-[1.1rem]"
          >
            {m.hero_description()}
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row">
        <Button href="/datasets" variant="primary">
          {m.hero_cta_primary()}
          <Icon icon="proicons:arrow-right" class="size-4" />
        </Button>
        <Button href="/community" variant="secondary">
          {m.hero_cta_secondary()}
        </Button>
      </div>
    </div>

    <div aria-hidden="true" class="hidden xl:block"></div>
  </div>
</div>
