<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { onMount, type Snippet } from 'svelte'
import { fade, fly } from 'svelte/transition'

import {
  observeReleaseNavOutline,
  scrollToReleaseNavAnchor,
} from '#lib/bits/pages/docs/components/releaseNav/releaseNavScroll.js'

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
let guideOpen = $state(false)
let projectChoicesOpen = $state(true)
let navigationElement = $state<HTMLElement>()
let navigationContentsElement = $state<HTMLElement>()
let compactNavigation = $state(false)
let compactNavigationOpen = $state(false)
let expandedNavigationHeight = $state(0)
let navigationWasFixed = false
let currentOutlineId = $derived(activeOutlineId ?? observedOutlineId)

const fixedNavigationBreakpoint = '(min-width: 64rem)'
const expandedNavigationBreakpoint = '(min-width: 1280px)'
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

function navigationOverlapsContent() {
  const navigation = navigationElement
  if (!navigation) return false

  const main = navigation.closest('main')
  if (!main) return false

  const navigationRect = navigation.getBoundingClientRect()
  const rootFontSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  )
  const expandedWidth = 12 * rootFontSize
  const expandedHeight = compactNavigation
    ? Math.max(navigationRect.height, expandedNavigationHeight)
    : navigationRect.height
  const expandedTop = compactNavigation
    ? navigationRect.top - (expandedHeight - navigationRect.height) / 2
    : navigationRect.top
  const expandedNavigationRect = {
    bottom: expandedTop + expandedHeight,
    left: window.innerWidth - expandedWidth,
    right: window.innerWidth,
    top: expandedTop,
  }

  return Array.from(
    main.querySelectorAll<HTMLElement>('section, article, [role="region"]'),
  ).some(content => {
    if (navigation.contains(content) || content.contains(navigation)) return false

    const contentRect = content.getBoundingClientRect()
    return (
      contentRect.left < expandedNavigationRect.right &&
      contentRect.right > expandedNavigationRect.left &&
      contentRect.top < expandedNavigationRect.bottom &&
      contentRect.bottom > expandedNavigationRect.top
    )
  })
}

function updateNavigationPresentation() {
  if (!window.matchMedia(fixedNavigationBreakpoint).matches) {
    compactNavigation = false
    compactNavigationOpen = false
    navigationWasFixed = false
    guideOpen = false
    return
  }

  if (navigationContentsElement) {
    expandedNavigationHeight = navigationContentsElement.scrollHeight
  }

  if (!navigationWasFixed) {
    guideOpen = true
    navigationWasFixed = true
  }

  const canAlwaysShowNavigation = window.matchMedia(
    expandedNavigationBreakpoint,
  ).matches
  const headerHeight =
    document.querySelector('header')?.getBoundingClientRect().height ??
    defaultHeaderHeight
  const navigationHeight = compactNavigation
    ? expandedNavigationHeight
    : (navigationElement?.scrollHeight ?? 0)
  compactNavigation =
    !canAlwaysShowNavigation ||
    navigationHeight > window.innerHeight - headerHeight ||
    navigationOverlapsContent()
}

function toggleGuide() {
  guideOpen = !guideOpen
  if (window.matchMedia(fixedNavigationBreakpoint).matches) {
    requestAnimationFrame(updateNavigationPresentation)
  }
}

function toggleProjectChoices() {
  projectChoicesOpen = !projectChoicesOpen
  requestAnimationFrame(updateNavigationPresentation)
}

function openCompactNavigation() {
  if (compactNavigation) compactNavigationOpen = true
}

function closeCompactNavigation() {
  compactNavigationOpen = false
}

onMount(() => {
  let animationFrame: number | undefined
  let scrollEndTimeout: number | undefined
  const updateOnNextFrame = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = requestAnimationFrame(() => {
      animationFrame = undefined
      updateNavigationPresentation()
    })
  }
  const updateAfterScroll = () => {
    if (scrollEndTimeout) clearTimeout(scrollEndTimeout)
    scrollEndTimeout = window.setTimeout(() => {
      scrollEndTimeout = undefined
      updateOnNextFrame()
    }, 400)
  }

  updateOnNextFrame()
  window.addEventListener('resize', updateOnNextFrame)
  window.addEventListener('scroll', updateAfterScroll, { passive: true })

  return () => {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    if (scrollEndTimeout) clearTimeout(scrollEndTimeout)
    window.removeEventListener('resize', updateOnNextFrame)
    window.removeEventListener('scroll', updateAfterScroll)
  }
})
</script>

<div class="flex flex-col">
  <div class="min-w-0 lg:pr-56">{@render children?.()}</div>
  <aside class="hidden lg:order-0 lg:block" aria-label={tocLabel}>
    <nav
      bind:this={navigationElement}
      class={`sticky top-18 z-30 border-y border-border-card bg-background/95 py-4 backdrop-blur-sm lg:fixed lg:top-[calc(50%+2.25rem)] lg:right-0 lg:z-50 lg:max-h-[calc(100vh-4.5rem)] lg:-translate-y-1/2 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none lg:transition-[width] lg:duration-200 lg:ease-out ${compactNavigation ? 'lg:h-11 lg:w-20' : 'lg:w-48 lg:overflow-y-auto'}`}
      onmouseenter={openCompactNavigation}
      onmouseleave={closeCompactNavigation}
    >
      {#if compactNavigation}
        <button
          in:fade={{ duration: 160 }}
          class="absolute right-0 top-0 z-20 inline-flex h-11 w-20 items-center justify-center gap-2 border border-border-card bg-background px-3 font-body text-label-sm font-semibold transition-colors duration-200 hover:border-secondary"
          type="button"
          aria-label="Open table of contents and project choices"
          onclick={() => (compactNavigationOpen = !compactNavigationOpen)}
        >
          <span
            class="size-2.5 rounded-full bg-secondary shadow-[0_0_0_4px_color-mix(in_srgb,var(--secondary)_18%,transparent)]"
            aria-hidden="true"
          ></span>
          TOC
        </button>
        {#if compactNavigationOpen}
          <div class="absolute right-0 top-1/2 z-30 w-48 -translate-y-1/2">
            <div
              bind:this={navigationContentsElement}
              in:fly={{ x: 24, duration: 180, opacity: 0 }}
              out:fly={{ x: 24, duration: 180, opacity: 0 }}
              class="max-h-[calc(100vh-4.5rem)] overflow-y-auto bg-background shadow-popover"
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
                        >{index + 1}. {@html item.label}</a
                      >
                    </li>
                  {/each}
                </ol>
              </div>
              {#if decisions.length > 0 && decisionsLabel}
                <div id="guide-project-choices" class="mt-3">
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
          </div>
        {/if}
      {:else}
        <div
          bind:this={navigationContentsElement}
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
                  >{index + 1}. {@html item.label}</a
                >
              </li>
            {/each}
          </ol>
        </div>
        {#if decisions.length > 0 && decisionsLabel}
          <div id="guide-project-choices" class="mt-3">
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
