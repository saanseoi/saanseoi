<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { onMount } from 'svelte'

import CarouselRoot from '#lib/bits/components/carousel/carouselRoot.svelte'

import GuideParagraph from './guideParagraph.svelte'
import GuideProgressMarker from './guideProgressMarker.svelte'
import type { GuideChoice } from './guide.types'

type Props = {
  alignment?: 'left' | 'center'
  choices: GuideChoice[]
  hideLabel?: boolean
  hint?: string | string[]
  illustratedCardSizing?: 'fixed' | 'fluid'
  illustratedFitWhenPossible?: boolean
  illustratedFullBleed?: boolean
  illustratedLayout?: 'carousel' | 'grid'
  label: string
  marker?:
    | string
    | {
        current: number
        label: string
        total: number
      }
  onchange?: (value: string) => void
  step?: string
  tileLayout?: 'fixed' | 'flow' | 'six-across'
  value?: string
  variant?: 'compact' | 'illustrated' | 'tiles'
}

let {
  alignment = 'center',
  choices,
  hideLabel = false,
  hint,
  illustratedCardSizing = 'fluid',
  illustratedFitWhenPossible = false,
  illustratedFullBleed = false,
  illustratedLayout = 'carousel',
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
  choices.find(choice => choice.value === (value ?? inspectedChoiceValue)),
)
let hasTileDescriptions = $derived(
  variant === 'tiles' && choices.some(choice => Boolean(choice.description)),
)
let illustratedChoiceCarousel = $state<{ scrollByPage: (direction: -1 | 1) => void }>()
let illustratedCarouselNavigation = $state({
  canMoveBackward: false,
  canMoveForward: false,
})
let choiceGroupElement = $state<HTMLFieldSetElement>()
let illustratedContentInset = $state(0)
let illustratedChoicesElement = $state<HTMLElement>()
let illustratedCarouselFits = $state(false)

const illustratedImageSliceStyle = (image: string, index: number) =>
  `background-image: url("${image}"); left: ${index * 90 - 26}px; width: 116px; clip-path: polygon(0 0, 90px 0, 116px 100%, 26px 100%);`

function updateIllustratedContentInset() {
  illustratedContentInset = choiceGroupElement?.getBoundingClientRect().left ?? 0
}

function updateIllustratedCarouselFit() {
  const choicesElement = illustratedChoicesElement
  const viewport = choicesElement?.parentElement
  const cards = choicesElement ? Array.from(choicesElement.children) : []
  const firstCard = cards[0] as HTMLElement | undefined
  const lastCard = cards.at(-1) as HTMLElement | undefined

  if (!viewport || !firstCard || !lastCard) return

  const cardsWidth = lastCard.offsetLeft + lastCard.offsetWidth - firstCard.offsetLeft
  illustratedCarouselFits = cardsWidth + 500 <= viewport.clientWidth
}

onMount(() => {
  const cleanups: Array<() => void> = []

  if (illustratedFullBleed && choiceGroupElement) {
    const resizeObserver = new ResizeObserver(updateIllustratedContentInset)
    resizeObserver.observe(choiceGroupElement)
    window.addEventListener('resize', updateIllustratedContentInset)
    requestAnimationFrame(updateIllustratedContentInset)
    cleanups.push(() => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateIllustratedContentInset)
    })
  }

  if (illustratedFitWhenPossible && illustratedChoicesElement?.parentElement) {
    const resizeObserver = new ResizeObserver(updateIllustratedCarouselFit)
    resizeObserver.observe(illustratedChoicesElement)
    resizeObserver.observe(illustratedChoicesElement.parentElement)
    requestAnimationFrame(updateIllustratedCarouselFit)
    cleanups.push(() => resizeObserver.disconnect())
  }

  return () => {
    cleanups.forEach(cleanup => {
      cleanup()
    })
  }
})
</script>

<fieldset
  bind:this={choiceGroupElement}
  class={`min-w-0 ${hideLabel && variant === 'illustrated' ? 'mt-0 mb-0' : 'mt-12 mb-0'} ${variant === 'illustrated' ? 'overflow-visible' : ''}`}
  style={illustratedFullBleed ? `--illustrated-content-inset: ${illustratedContentInset}px` : undefined}
>
  <legend
    class={`${hideLabel ? 'sr-only' : 'w-full'} font-bold ${variant === 'illustrated' || variant === 'tiles' ? `font-display text-headline-md leading-tight text-primary ${alignment === 'left' ? 'text-left' : 'text-center'}` : 'font-display text-headline-sm text-secondary'}`}
  >
    <span class="flex items-end justify-between gap-4">
      <span>
        {#if marker}
          <span
            class="mb-1 block font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
            >{#if typeof marker === 'string'}
              {@html marker}
            {:else}
              <GuideProgressMarker {...marker} />
            {/if}</span
          >
        {/if}
        {@html label}
        {#if step}
          <span class="ml-3 font-body text-label-md font-semibold text-secondary"
            >[{step}]</span
          >
        {/if}
      </span>
      {#if !hideLabel &&
        (illustratedFullBleed || illustratedFitWhenPossible) &&
        !illustratedCarouselFits &&
        choices.length > 1 &&
        illustratedLayout === 'carousel'}
        <span class="flex shrink-0 gap-2">
          <button
            class="grid size-9 place-items-center rounded border border-outline-variant text-secondary transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:pointer-events-none disabled:opacity-40"
            type="button"
            aria-label="Show previous choice"
            disabled={!illustratedCarouselNavigation.canMoveBackward}
            onclick={() => illustratedChoiceCarousel?.scrollByPage(-1)}
          >
            <Icon icon="proicons:chevron-left" class="size-4" aria-hidden="true" />
          </button>
          <button
            class="grid size-9 place-items-center rounded border border-outline-variant text-secondary transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:pointer-events-none disabled:opacity-40"
            type="button"
            aria-label="Show next choice"
            disabled={!illustratedCarouselNavigation.canMoveForward}
            onclick={() => illustratedChoiceCarousel?.scrollByPage(1)}
          >
            <Icon icon="proicons:chevron-right" class="size-4" aria-hidden="true" />
          </button>
        </span>
      {/if}
    </span>
  </legend>
  {#if Array.isArray(hint)}
    {#each hint as paragraph, index}
      <p
        class={`${index === 0 ? 'mt-1' : 'mt-3'} max-w-3xl font-body text-body-sm leading-6 text-foreground-alt`}
      >
        {@html paragraph}
      </p>
    {/each}
  {:else if hint}
    <p class="mt-1 max-w-3xl font-body text-body-sm text-foreground-alt">
      {@html hint}
    </p>
  {/if}
  {#if hideLabel &&
    (illustratedFullBleed || illustratedFitWhenPossible) &&
    !illustratedCarouselFits &&
    choices.length > 1 &&
    illustratedLayout === 'carousel'}
    <div class="mt-4 flex justify-end gap-2">
      <button
        class="grid size-9 place-items-center rounded border border-outline-variant text-secondary transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:pointer-events-none disabled:opacity-40"
        type="button"
        aria-label="Show previous choice"
        disabled={!illustratedCarouselNavigation.canMoveBackward}
        onclick={() => illustratedChoiceCarousel?.scrollByPage(-1)}
      >
        <Icon icon="proicons:chevron-left" class="size-4" aria-hidden="true" />
      </button>
      <button
        class="grid size-9 place-items-center rounded border border-outline-variant text-secondary transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:pointer-events-none disabled:opacity-40"
        type="button"
        aria-label="Show next choice"
        disabled={!illustratedCarouselNavigation.canMoveForward}
        onclick={() => illustratedChoiceCarousel?.scrollByPage(1)}
      >
        <Icon icon="proicons:chevron-right" class="size-4" aria-hidden="true" />
      </button>
    </div>
  {/if}
  {#if variant === 'illustrated'}
    {#if illustratedLayout === 'grid'}
      <div
        class={`${hideLabel ? '' : 'mt-6 md:mt-8'} grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${hideLabel ? 'md:mt-0' : ''}`}
      >
        {#each choices as choice}
          <label
            for={`${label}-${choice.value}`}
            aria-label={choice.label}
            class={`group relative flex flex-col select-none has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-[:focus-visible]:outline-secondary ${illustratedLayout === 'grid' ? 'w-full min-w-0' : illustratedCardSizing === 'fixed' ? 'w-[min(84vw,19rem)] shrink-0 snap-start md:w-64 md:min-w-64 md:max-w-64 md:flex-none' : 'w-[min(84vw,19rem)] shrink-0 snap-start md:w-full md:min-w-0 md:max-w-64 md:flex-1'} ${choice.disabled ? 'cursor-default opacity-55' : 'cursor-pointer'}`}
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
            {#if choice.image || choice.imageSlices || choice.darkImageSlices || illustratedLayout === 'grid'}
              <span class="relative flex h-64 items-center justify-center">
                {#if choice.badge}
                  <span
                    class="absolute top-1/2 left-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 bg-background px-2 py-1 font-body text-label-sm font-semibold tracking-[0.12em] text-secondary uppercase whitespace-nowrap"
                  >
                    {@html choice.badge}
                  </span>
                {/if}
                {#if choice.darkImage}
                  <img
                    class="max-h-full max-w-full object-contain dark:hidden"
                    src={choice.image}
                    alt=""
                    draggable="false"
                  >
                  <img
                    class="hidden max-h-full max-w-full object-contain dark:block"
                    src={choice.darkImage}
                    alt=""
                    draggable="false"
                  >
                {:else if choice.image}
                  <img
                    class="max-h-full max-w-full object-contain"
                    src={choice.image}
                    alt=""
                    draggable="false"
                  >
                {:else if choice.imageSlices || choice.darkImageSlices}
                  <span
                    class={`relative block size-full overflow-hidden ${choice.darkImageSlices ? 'dark:hidden' : ''}`}
                  >
                    {#each choice.imageSlices ?? [] as image, index}
                      <span
                        class="absolute top-0 bottom-0 block bg-cover bg-center"
                        style={illustratedImageSliceStyle(image, index)}
                        aria-hidden="true"
                      ></span>
                    {/each}
                  </span>
                  {#if choice.darkImageSlices}
                    <span class="relative hidden size-full overflow-hidden dark:block">
                      {#each choice.darkImageSlices as image, index}
                        <span
                          class="absolute top-0 bottom-0 block bg-cover bg-center"
                          style={illustratedImageSliceStyle(image, index)}
                          aria-hidden="true"
                        ></span>
                      {/each}
                    </span>
                  {/if}
                {/if}
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
      <CarouselRoot
        bind:this={illustratedChoiceCarousel}
        class={`${hideLabel ? '' : 'mt-6 md:mt-8'} ${illustratedFullBleed ? 'relative -ml-(--illustrated-content-inset) w-screen' : alignment === 'center' ? 'relative left-1/2 w-screen -translate-x-1/2' : 'w-full'}`}
        onnavigationchange={navigation => (illustratedCarouselNavigation = navigation)}
      >
        <div
          bind:this={illustratedChoicesElement}
          class={illustratedCarouselFits
            ? 'flex w-full min-w-0 justify-center gap-4 px-[250px]'
            : `flex min-w-max snap-x snap-mandatory gap-4 ${illustratedFullBleed ? 'px-(--illustrated-content-inset)' : illustratedFitWhenPossible ? 'px-[250px]' : alignment === 'center' ? 'px-[max(1.5rem,calc((100vw-var(--spacing-container-max))/2+1.5rem))] md:px-[max(2rem,calc((100vw-var(--spacing-container-max))/2+2rem))]' : ''}`}
        >
          {#each choices as choice}
            <label
              for={`${label}-${choice.value}`}
              aria-label={choice.label}
              class={`group relative flex flex-col select-none has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-[:focus-visible]:outline-secondary ${illustratedCardSizing === 'fixed' ? 'w-[min(84vw,19rem)] shrink-0 snap-start md:w-64 md:min-w-64 md:max-w-64 md:flex-none' : 'w-[min(84vw,19rem)] shrink-0 snap-start md:w-full md:min-w-0 md:max-w-64 md:flex-1'} ${choice.disabled ? 'cursor-default opacity-55' : 'cursor-pointer'}`}
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
              {#if choice.image || choice.imageSlices || choice.darkImageSlices}
                <span class="relative flex h-64 items-center justify-center">
                  {#if choice.badge}
                    <span
                      class="absolute top-1/2 left-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 bg-background px-2 py-1 font-body text-label-sm font-semibold tracking-[0.12em] text-secondary uppercase whitespace-nowrap"
                    >
                      {@html choice.badge}
                    </span>
                  {/if}
                  {#if choice.darkImage}
                    <img
                      class="max-h-full max-w-full object-contain dark:hidden"
                      src={choice.image}
                      alt=""
                      draggable="false"
                    >
                    <img
                      class="hidden max-h-full max-w-full object-contain dark:block"
                      src={choice.darkImage}
                      alt=""
                      draggable="false"
                    >
                  {:else if choice.image}
                    <img
                      class="max-h-full max-w-full object-contain"
                      src={choice.image}
                      alt=""
                      draggable="false"
                    >
                  {:else if choice.imageSlices || choice.darkImageSlices}
                    <span
                      class={`relative block size-full overflow-hidden ${choice.darkImageSlices ? 'dark:hidden' : ''}`}
                    >
                      {#each choice.imageSlices ?? [] as image, index}
                        <span
                          class="absolute top-0 bottom-0 block bg-cover bg-center"
                          style={illustratedImageSliceStyle(image, index)}
                          aria-hidden="true"
                        ></span>
                      {/each}
                    </span>
                    {#if choice.darkImageSlices}
                      <span
                        class="relative hidden size-full overflow-hidden dark:block"
                      >
                        {#each choice.darkImageSlices as image, index}
                          <span
                            class="absolute top-0 bottom-0 block bg-cover bg-center"
                            style={illustratedImageSliceStyle(image, index)}
                            aria-hidden="true"
                          ></span>
                        {/each}
                      </span>
                    {/if}
                  {/if}
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
      </CarouselRoot>
    {/if}
  {:else}
    <div
      class={variant === 'tiles'
          ? `mt-4 grid gap-3 ${
              tileLayout === 'flow'
                ? 'grid-cols-[repeat(auto-fit,minmax(10rem,11rem))]'
                : tileLayout === 'six-across'
                  ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6'
                  : 'max-w-lg grid-cols-3'
            }`
          : 'mt-4 grid gap-3 sm:grid-cols-2'}
    >
      {#each choices as choice}
        <label
          for={`${label}-${choice.value}`}
          aria-label={choice.label}
          onmouseenter={() => (inspectedChoiceValue = choice.value)}
          onfocusin={() => (inspectedChoiceValue = choice.value)}
          class={`group relative flex cursor-pointer select-none border transition-colors ${variant === 'tiles' ? 'aspect-square flex-col items-center justify-center gap-2 p-3 text-center' : 'min-h-30 gap-3 p-4'} ${value === choice.value ? 'border-secondary bg-secondary-container/35' : 'border-border-card bg-background hover:border-secondary/50'} ${choice.disabled ? 'cursor-not-allowed opacity-55' : ''}`}
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
              class={`${variant === 'tiles' ? 'size-8 shrink-0 overflow-visible' : 'mt-0.5 size-5 shrink-0'} text-secondary`}
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
      <div class="mt-4 grid" aria-live="polite">
        {#each choices as choice}
          {#if choice.description}
            <GuideParagraph
              class={`col-start-1 row-start-1 ${inspectedChoice?.value === choice.value ? '' : 'invisible'}`}
              ariaHidden={inspectedChoice?.value === choice.value ? undefined : true}
            >
              {@html choice.description}
            </GuideParagraph>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
</fieldset>
