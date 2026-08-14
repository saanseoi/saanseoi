<script lang="ts">
import Icon from '@iconify/svelte'
import { onMount, type Snippet } from 'svelte'

import {
  observeReleaseNavOutline,
  scrollToReleaseNavAnchor,
} from '$lib/bits/pages/docs/components/releaseNav/releaseNavScroll'

import type { GuideDecision, GuideOutlineItem } from './guide.types'

type Props = {
  activeOutlineId?: string | null
  children?: Snippet
  decisions?: GuideDecision[]
  decisionsLabel?: string
  locked?: boolean
  outline: GuideOutlineItem[]
  reminderId?: string
  tocLabel: string
}

let {
  activeOutlineId = $bindable(null),
  children,
  decisions = [],
  decisionsLabel,
  locked = false,
  outline,
  reminderId,
  tocLabel,
}: Props = $props()
let observedOutlineId = $state<string | null>(null)
let guideOpen = $state(true)
let projectChoicesOpen = $state(true)
let navigationElement = $state<HTMLElement>()
let navigationContentsElement = $state<HTMLElement>()
let compactNavigation = $state(false)
let currentOutlineId = $derived(activeOutlineId ?? observedOutlineId)

const fixedNavigationBreakpoint = '(min-width: 1024px)'
const compactNavigationBreakpoint = '(max-width: 1279px)'
const defaultHeaderHeight = 72

$effect(() => {
  const outlineKey = outline.map(item => `${item.id}:${item.hidden}`).join('|')
  void outlineKey
  observedOutlineId = null
  return observeReleaseNavOutline(outline, id => (observedOutlineId = id))
})

function navigate(event: MouseEvent, id: string) {
  scrollToReleaseNavAnchor({
    event,
    id,
    items: outline,
  })
}

function updateNavigationPresentation() {
  if (!window.matchMedia(fixedNavigationBreakpoint).matches) {
    compactNavigation = false
    return
  }

  const headerHeight =
    document.querySelector('header')?.getBoundingClientRect().height ??
    defaultHeaderHeight
  const navigationHeight = compactNavigation
    ? (navigationContentsElement?.scrollHeight ?? 0)
    : (navigationElement?.scrollHeight ?? 0)
  compactNavigation =
    window.matchMedia(compactNavigationBreakpoint).matches ||
    navigationHeight > window.innerHeight - headerHeight
}

function toggleGuide() {
  guideOpen = !guideOpen
  requestAnimationFrame(updateNavigationPresentation)
}

function toggleProjectChoices() {
  projectChoicesOpen = !projectChoicesOpen
  requestAnimationFrame(updateNavigationPresentation)
}

onMount(() => {
  const handleViewportResize = () => updateNavigationPresentation()

  requestAnimationFrame(handleViewportResize)
  window.addEventListener('resize', handleViewportResize)

  return () => window.removeEventListener('resize', handleViewportResize)
})
</script>

<div class="flex flex-col">
  <div class="min-w-0 lg:pr-56">{@render children?.()}</div>
  <aside class="order-first lg:order-0" aria-label={tocLabel}>
    <nav
      bind:this={navigationElement}
      class={`group sticky top-18 z-30 border-y border-border-card bg-background/95 py-4 backdrop-blur-sm lg:fixed lg:top-[calc(50%+2.25rem)] lg:right-0 lg:z-50 lg:max-h-[calc(100vh-4.5rem)] lg:-translate-y-1/2 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none ${compactNavigation ? 'lg:w-20' : 'lg:w-48 lg:overflow-y-auto'}`}
    >
      {#if compactNavigation}
        <button
          class="absolute right-0 top-0 z-20 inline-flex h-11 w-20 items-center justify-center gap-2 border border-border-card bg-background px-3 font-body text-label-sm font-semibold tracking-[0.12em] text-secondary uppercase shadow-card transition-colors duration-300 group-hover:border-secondary group-focus-visible:border-secondary"
          type="button"
          aria-label="Open table of contents and project choices"
        >
          <span
            class="size-2.5 rounded-full bg-secondary shadow-[0_0_0_4px_color-mix(in_srgb,var(--secondary)_18%,transparent)] transition-transform duration-300 group-hover:scale-125 group-focus-visible:scale-125"
            aria-hidden="true"
          ></span>
          TOC
        </button>
        <div
          bind:this={navigationContentsElement}
          class="pointer-events-none absolute right-0 top-0 z-10 max-h-[calc(100vh-4.5rem)] w-52 translate-x-[calc(100%-5rem)] overflow-y-auto border border-border-card bg-background p-3 pt-14 opacity-0 shadow-popover transition-[opacity,transform] duration-300 ease-out group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100"
        >
          <div
            class="flex items-center justify-between gap-3 bg-background lg:block lg:bg-transparent lg:p-0"
          >
            <button
              class="inline-flex w-full items-center justify-between gap-1.5 font-body text-label-sm font-semibold tracking-[0.12em] text-secondary uppercase lg:mb-2 lg:bg-background lg:px-3 lg:py-2"
              type="button"
              aria-controls="guide-contents"
              aria-expanded={guideOpen}
              onclick={toggleGuide}
            >
              {@html tocLabel}
              <Icon
                icon="ion:chevron-down-outline"
                class={`size-4 transition-transform duration-300 ${guideOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
          <div id="guide-contents" class={guideOpen ? 'block' : 'hidden'}>
            <ol class="mt-3 space-y-1 lg:mt-0 lg:space-y-2">
              {#each outline as item, index}
                {@const targetId = locked && index > 0 && reminderId ? reminderId : item.id}
                <li class:hidden={item.hidden}>
                  <a
                    class={`block border-l-2 py-1.5 pl-3 font-body text-sm transition-colors lg:border lg:border-r-0 lg:px-3 lg:py-2.5 lg:shadow-card lg:backdrop-blur-sm ${currentOutlineId === item.id ? 'border-secondary font-semibold text-primary lg:bg-secondary lg:text-on-secondary' : 'border-transparent text-foreground-alt hover:border-border-card hover:text-primary lg:border-border-card lg:bg-background/95 lg:hover:border-secondary lg:hover:bg-surface-container-low'}`}
                    href={`#${targetId}`}
                    aria-current={currentOutlineId === item.id ? 'location' : undefined}
                    onclick={event => navigate(event, targetId)}
                    >{index}. {@html item.label}</a
                  >
                </li>
              {/each}
            </ol>
          </div>
          {#if decisions.length > 0 && decisionsLabel}
            <div id="guide-project-choices" class="mt-6">
              <button
                class="inline-flex w-full items-center justify-between gap-1.5 bg-background px-3 py-2 font-body text-label-sm font-semibold tracking-[0.12em] text-secondary uppercase"
                type="button"
                aria-controls="guide-project-choices-list"
                aria-expanded={projectChoicesOpen}
                onclick={toggleProjectChoices}
              >
                {@html decisionsLabel}
                <Icon
                  icon="ion:chevron-down-outline"
                  class={`size-4 transition-transform duration-300 ${projectChoicesOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              <ul
                id="guide-project-choices-list"
                class={`mt-3 space-y-2 ${projectChoicesOpen ? 'block' : 'hidden'}`}
              >
                {#each decisions as decision}
                  {@const targetId =
                    locked && decision.id !== 'destination' && decision.id !== 'llm-involvement' && reminderId
                      ? reminderId
                      : decision.id}
                  <li>
                    <a
                      class="block border-l-2 py-1.5 pl-3 font-body text-sm transition-colors lg:border lg:border-r-0 lg:px-3 lg:py-2.5 lg:shadow-card lg:backdrop-blur-sm lg:border-border-card lg:bg-background/95 hover:border-secondary hover:bg-surface-container-low"
                      href={`#${targetId}`}
                      onclick={event => navigate(event, targetId)}
                    >
                      {#if decision.selection}
                        <span
                          class="block font-body text-[0.625rem] font-semibold tracking-[0.12em] text-foreground-alt uppercase"
                          >{@html decision.label}</span
                        >
                        <span class="mt-0.5 block font-semibold text-primary">
                          {@html decision.selection}
                        </span>
                      {:else}
                        <span class="block text-foreground-alt"
                          >{@html decision.label}</span
                        >
                      {/if}
                    </a>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {:else}
        <div
          class="flex items-center justify-between gap-3 bg-background px-3 py-2 lg:block lg:bg-transparent lg:p-0"
        >
          <button
            class="inline-flex w-full items-center justify-between gap-1.5 font-body text-label-sm font-semibold tracking-[0.12em] text-secondary uppercase lg:mb-2 lg:bg-background lg:px-3 lg:py-2"
            type="button"
            aria-controls="guide-contents"
            aria-expanded={guideOpen}
            onclick={toggleGuide}
          >
            {@html tocLabel}
            <Icon
              icon="ion:chevron-down-outline"
              class={`size-4 transition-transform duration-300 ${guideOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {#if decisions.length > 0 && decisionsLabel}
            <button
              class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-secondary lg:hidden"
              type="button"
              aria-controls="guide-project-choices-list"
              aria-expanded={projectChoicesOpen}
              onclick={toggleProjectChoices}
            >
              {@html decisionsLabel}
              <Icon
                icon="ion:chevron-down-outline"
                class={`size-4 transition-transform duration-300 ${projectChoicesOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          {/if}
        </div>
        <div id="guide-contents" class={guideOpen ? 'block' : 'hidden'}>
          <ol class="mt-3 space-y-1 lg:mt-0 lg:space-y-2">
            {#each outline as item, index}
              {@const targetId = locked && index > 0 && reminderId ? reminderId : item.id}
              <li class:hidden={item.hidden}>
                <a
                  class={`block border-l-2 py-1.5 pl-3 font-body text-sm transition-colors lg:border lg:border-r-0 lg:px-3 lg:py-2.5 lg:shadow-card lg:backdrop-blur-sm ${currentOutlineId === item.id ? 'border-secondary font-semibold text-primary lg:bg-secondary lg:text-on-secondary' : 'border-transparent text-foreground-alt hover:border-border-card hover:text-primary lg:border-border-card lg:bg-background/95 lg:hover:border-secondary lg:hover:bg-surface-container-low'}`}
                  href={`#${targetId}`}
                  aria-current={currentOutlineId === item.id ? 'location' : undefined}
                  onclick={event => navigate(event, targetId)}
                  >{index}. {@html item.label}</a
                >
              </li>
            {/each}
          </ol>
        </div>
        {#if decisions.length > 0 && decisionsLabel}
          <div id="guide-project-choices" class="mt-6">
            <button
              class="inline-flex w-full items-center justify-between gap-1.5 bg-background px-3 py-2 font-body text-label-sm font-semibold tracking-[0.12em] text-secondary uppercase"
              type="button"
              aria-controls="guide-project-choices-list"
              aria-expanded={projectChoicesOpen}
              onclick={toggleProjectChoices}
            >
              {@html decisionsLabel}
              <Icon
                icon="ion:chevron-down-outline"
                class={`size-4 transition-transform duration-300 ${projectChoicesOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            <ul
              id="guide-project-choices-list"
              class={`mt-3 space-y-2 ${projectChoicesOpen ? 'block' : 'hidden'}`}
            >
              {#each decisions as decision}
                {@const targetId =
                locked && decision.id !== 'destination' && decision.id !== 'llm-involvement' && reminderId
                  ? reminderId
                  : decision.id}
                <li>
                  <a
                    class="block border-l-2 py-1.5 pl-3 font-body text-sm transition-colors lg:border lg:border-r-0 lg:px-3 lg:py-2.5 lg:shadow-card lg:backdrop-blur-sm lg:border-border-card lg:bg-background/95 hover:border-secondary hover:bg-surface-container-low"
                    href={`#${targetId}`}
                    onclick={event => navigate(event, targetId)}
                  >
                    {#if decision.selection}
                      <span
                        class="block font-body text-[0.625rem] font-semibold tracking-[0.12em] text-foreground-alt uppercase"
                        >{@html decision.label}</span
                      >
                      <span class="mt-0.5 block font-semibold text-primary">
                        {@html decision.selection}
                      </span>
                    {:else}
                      <span class="block text-foreground-alt"
                        >{@html decision.label}</span
                      >
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {/if}
    </nav>
  </aside>
</div>
