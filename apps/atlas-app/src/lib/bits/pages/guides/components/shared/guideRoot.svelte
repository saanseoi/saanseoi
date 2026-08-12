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
let combinedPanelsHeight = $state(0)
let panelsFitViewport = $state(true)
let currentOutlineId = $derived(activeOutlineId ?? observedOutlineId)

const desktopBreakpoint = '(min-width: 1024px)'
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

function updatePanelCapacity() {
  if (!window.matchMedia(desktopBreakpoint).matches) {
    panelsFitViewport = true
    return
  }

  if (guideOpen && projectChoicesOpen && navigationElement) {
    combinedPanelsHeight = navigationElement.scrollHeight
  }

  const headerHeight =
    document.querySelector('header')?.getBoundingClientRect().height ??
    defaultHeaderHeight
  panelsFitViewport =
    combinedPanelsHeight === 0 ||
    combinedPanelsHeight <= window.innerHeight - headerHeight
}

function refreshPanelState(preferredOpenPanel: 'guide' | 'project' = 'guide') {
  updatePanelCapacity()

  if (!panelsFitViewport && guideOpen && projectChoicesOpen) {
    if (preferredOpenPanel === 'guide') projectChoicesOpen = false
    else guideOpen = false
  }
}

function toggleGuide() {
  const openingGuide = !guideOpen
  guideOpen = openingGuide

  if (openingGuide && !panelsFitViewport) projectChoicesOpen = false
  requestAnimationFrame(() => refreshPanelState('guide'))
}

function toggleProjectChoices() {
  const openingProjectChoices = !projectChoicesOpen
  projectChoicesOpen = openingProjectChoices

  if (openingProjectChoices && !panelsFitViewport) guideOpen = false
  requestAnimationFrame(() => refreshPanelState('project'))
}

onMount(() => {
  const handleViewportResize = () => refreshPanelState()

  requestAnimationFrame(handleViewportResize)
  window.addEventListener('resize', handleViewportResize)

  return () => window.removeEventListener('resize', handleViewportResize)
})
</script>

<div class="flex flex-col">
  <div class="min-w-0">{@render children?.()}</div>
  <aside class="order-first lg:order-0" aria-label={tocLabel}>
    <nav
      bind:this={navigationElement}
      class="sticky top-18 z-30 border-y border-border-card bg-background/95 py-4 backdrop-blur-sm lg:fixed lg:top-[calc(50%+2.25rem)] lg:right-0 lg:z-50 lg:max-h-[calc(100vh-4.5rem)] lg:w-48 lg:-translate-y-1/2 lg:overflow-y-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
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
    </nav>
  </aside>
</div>
