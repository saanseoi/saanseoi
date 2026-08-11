<script lang="ts">
import Icon from '@iconify/svelte'

import type { GuideChoice } from './guide.types'

type Props = {
  alignment?: 'left' | 'center'
  choices: GuideChoice[]
  hideLabel?: boolean
  hint?: string | string[]
  label: string
  marker?: string
  onchange?: (value: string) => void
  step?: string
  tileLayout?: 'fixed' | 'flow'
  value?: string
  variant?: 'compact' | 'illustrated' | 'tiles'
}

let {
  alignment = 'center',
  choices,
  hideLabel = false,
  hint,
  label,
  marker,
  onchange,
  step,
  tileLayout = 'fixed',
  value = $bindable(),
  variant = 'compact',
}: Props = $props()

let inspectedChoiceValue = $state<string>()
let inspectedChoice = $derived(
  choices.find(choice => choice.value === inspectedChoiceValue),
)
let hasTileDescriptions = $derived(
  variant === 'tiles' && choices.some(choice => Boolean(choice.description)),
)
let illustratedChoiceCarousel = $state<HTMLDivElement>()
let canScrollIllustratedPrevious = $state(false)
let canScrollIllustratedNext = $state(true)

const updateIllustratedScrollControls = () => {
  const carousel = illustratedChoiceCarousel
  if (!carousel) return

  const threshold = 2
  canScrollIllustratedPrevious = carousel.scrollLeft > threshold
  canScrollIllustratedNext =
    carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - threshold
}

const scrollIllustratedChoices = (direction: -1 | 1) => {
  const carousel = illustratedChoiceCarousel
  if (!carousel) return

  carousel.scrollBy({
    left: direction * carousel.clientWidth * 0.82,
    behavior: 'smooth',
  })
}
</script>

<fieldset
  class={`min-w-0 ${hideLabel && variant === 'illustrated' ? 'mt-0 mb-12' : 'my-12'} ${variant === 'illustrated' ? 'overflow-visible' : ''}`}
>
  <legend
    class={`${hideLabel ? 'sr-only' : 'w-full'} font-bold ${variant === 'illustrated' || variant === 'tiles' ? `font-display text-headline-md leading-tight text-primary ${alignment === 'left' ? 'text-left' : 'text-center'}` : 'font-display text-headline-sm text-secondary'}`}
  >
    {#if marker}
      <span
        class="mb-1 block font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
        >{@html marker}</span
      >
    {/if}
    {@html label}
    {#if step}
      <span class="ml-3 font-body text-label-md font-semibold text-secondary"
        >[{step}]</span
      >
    {/if}
  </legend>
  {#if Array.isArray(hint)}
    {#each hint as paragraph, index}
      <p
        class={`${index === 0 ? 'mt-1' : 'mt-3'} font-body text-body-sm leading-6 text-foreground-alt`}
      >
        {@html paragraph}
      </p>
    {/each}
  {:else if hint}
    <p class="mt-1 font-body text-body-sm text-foreground-alt">{@html hint}</p>
  {/if}
  {#if variant === 'illustrated'}
    {#if choices.length > 1}
      <fieldset
        class="illustrated-choice-mobile-controls"
        aria-label="Choice carousel controls"
      >
        <button
          aria-label="Show previous choice"
          disabled={!canScrollIllustratedPrevious}
          onclick={() => scrollIllustratedChoices(-1)}
          type="button"
        >
          <Icon
            icon="material-symbols-light:arrow-back-ios-new-rounded"
            aria-hidden="true"
          />
        </button>
        <button
          aria-label="Show next choice"
          disabled={!canScrollIllustratedNext}
          onclick={() => scrollIllustratedChoices(1)}
          type="button"
        >
          <Icon
            icon="material-symbols-light:arrow-forward-ios-rounded"
            aria-hidden="true"
          />
        </button>
      </fieldset>
    {/if}
    <div
      bind:this={illustratedChoiceCarousel}
      onscroll={updateIllustratedScrollControls}
      class={`illustrated-choice-grid ${alignment === 'left' ? 'illustrated-choice-grid-left md:justify-start' : 'md:justify-center'} ${hideLabel ? '' : 'mt-6'} flex w-full snap-x snap-mandatory gap-4 overflow-x-auto pr-6 pb-2 touch-pan-x md:mt-8 md:flex-nowrap md:gap-x-[clamp(0px,2vw,2rem)] md:gap-y-0 md:overflow-visible md:pr-0 md:pb-0`}
    >
      {#each choices as choice}
        <label
          for={`${label}-${choice.value}`}
          aria-label={choice.label}
          class={`group relative flex w-[min(84vw,19rem)] shrink-0 snap-start flex-col has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-[:focus-visible]:outline-secondary md:w-full md:min-w-0 md:max-w-64 md:flex-1 ${choice.disabled ? 'cursor-default opacity-55' : 'cursor-pointer'}`}
        >
          <input
            id={`${label}-${choice.value}`}
            class="sr-only"
            type="radio"
            name={label}
            value={choice.value}
            bind:group={value}
            onchange={() => onchange?.(choice.value)}
            disabled={choice.disabled}
          >
          {#if choice.image}
            <span class="relative flex h-64 items-center justify-center">
              {#if choice.badge}
                <span
                  class="absolute top-1/2 left-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 bg-background px-2 py-1 font-body text-label-sm font-semibold tracking-[0.12em] text-secondary uppercase whitespace-nowrap"
                >
                  {@html choice.badge}
                </span>
              {/if}
              <img
                class="max-h-full max-w-full object-contain"
                src={choice.image}
                alt=""
              >
            </span>
          {/if}
          <span
            class={`block border-t-2 pt-4 transition-colors ${value === choice.value ? 'border-secondary' : choice.disabled ? 'border-border-card' : 'border-border-card group-hover:border-secondary/60'}`}
          >
            <span class="flex items-start justify-between gap-3">
              <span
                class={`block font-body text-body-md font-semibold ${value === choice.value ? 'text-secondary' : 'text-primary'}`}
                >{@html choice.label}</span
              >
              <span
                class={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors ${value === choice.value ? 'border-secondary' : choice.disabled ? 'border-foreground-alt/55' : 'border-foreground-alt/55 group-hover:border-secondary/70'}`}
                aria-hidden="true"
              >
                <span
                  class={`size-1.5 rounded-full bg-secondary transition-opacity ${value === choice.value ? 'opacity-100' : 'opacity-0'}`}
                ></span>
              </span>
            </span>
            <span
              class="mt-1 block font-body text-body-sm leading-6 text-foreground-alt"
            >
              {@html choice.description}
            </span>
          </span>
        </label>
      {/each}
    </div>
  {:else}
    <div
      class={variant === 'tiles'
          ? `mt-4 grid gap-3 ${tileLayout === 'flow' ? 'grid-cols-[repeat(auto-fit,minmax(10rem,11rem))]' : 'max-w-lg grid-cols-3'}`
          : 'mt-4 grid gap-3 sm:grid-cols-2'}
    >
      {#each choices as choice}
        <label
          for={`${label}-${choice.value}`}
          aria-label={choice.label}
          onmouseenter={() => (inspectedChoiceValue = choice.value)}
          onfocusin={() => (inspectedChoiceValue = choice.value)}
          class={`group relative flex cursor-pointer border transition-colors ${variant === 'tiles' ? 'aspect-square flex-col items-center justify-center gap-2 p-3 text-center' : 'min-h-30 gap-3 p-4'} ${value === choice.value ? 'border-secondary bg-secondary-container/35' : 'border-border-card bg-background hover:border-secondary/50'} ${choice.disabled ? 'cursor-not-allowed opacity-55' : ''}`}
        >
          <input
            id={`${label}-${choice.value}`}
            class="sr-only"
            type="radio"
            name={label}
            value={choice.value}
            bind:group={value}
            onchange={() => {
              inspectedChoiceValue = choice.value
              onchange?.(choice.value)
            }}
            disabled={choice.disabled}
          >
          {#if choice.badge}
            <span
              class="absolute top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 px-1 py-0.5 font-body text-label-sm font-medium tracking-wide text-secondary"
            >
              {#if choice.badgeIcon}
                <Icon class="size-3.5" icon={choice.badgeIcon} aria-hidden="true" />
              {/if}
              {choice.badge}
            </span>
          {/if}
          {#if choice.icon}
            <Icon
              class={`${variant === 'tiles' ? 'size-8' : 'mt-0.5 size-5 shrink-0'} text-secondary`}
              icon={choice.icon}
              aria-hidden="true"
            />
          {/if}
          <span class={variant === 'tiles' ? '' : 'min-w-0'}>
            <span class="block font-body text-body-md font-semibold text-primary">
              {@html choice.label}
            </span>
            {#if choice.description && variant !== 'tiles'}
              <span
                class="mt-1 block font-body text-body-sm leading-6 text-foreground-alt"
              >
                {@html choice.description}
              </span>
            {/if}
          </span>
          {#if variant === 'tiles' && choice.note}
            <span
              class="absolute right-3 bottom-4 left-3 font-body text-label-sm text-secondary"
            >
              {@html choice.note}
            </span>
          {/if}
        </label>
      {/each}
    </div>
    {#if hasTileDescriptions}
      <div
        class="mt-4 grid max-w-3xl font-body text-body-md leading-7 text-foreground-alt"
        aria-live="polite"
      >
        {#each choices as choice}
          {#if choice.description}
            <p
              class={`col-start-1 row-start-1 ${inspectedChoice?.value === choice.value ? '' : 'invisible'}`}
              aria-hidden={inspectedChoice?.value === choice.value ? undefined : true}
            >
              {@html choice.description}
            </p>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
</fieldset>

<style>
.illustrated-choice-mobile-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  margin-top: 1.25rem;
  color: var(--color-foreground-alt);
  font-family: var(--font-body);
  font-size: 0.75rem;
}

.illustrated-choice-mobile-controls button {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border: 1px solid var(--color-border-card);
  color: var(--color-secondary);
  transition:
    border-color 150ms,
    color 150ms;
}

.illustrated-choice-mobile-controls button:hover:not(:disabled) {
  border-color: var(--color-secondary);
}

.illustrated-choice-mobile-controls button:disabled {
  cursor: not-allowed;
  color: color-mix(in srgb, var(--color-foreground-alt) 45%, transparent);
}

.illustrated-choice-mobile-controls :global(svg) {
  width: 0.9rem;
  height: 0.9rem;
}

.illustrated-choice-grid {
  scrollbar-width: none;
}

.illustrated-choice-grid::-webkit-scrollbar {
  display: none;
}

@media (min-width: 768px) {
  .illustrated-choice-mobile-controls {
    display: none;
  }

  .illustrated-choice-grid {
    width: calc(100vw - 8rem);
    margin-left: calc(50% - 50vw + 4rem);
  }

  .illustrated-choice-grid-left {
    width: 100%;
    margin-left: 0;
  }
}
</style>
