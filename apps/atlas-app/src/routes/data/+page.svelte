<script lang="ts">
import Icon from '@iconify/svelte'
import { onMount } from 'svelte'

import * as CardDeck from '$lib/bits/components/cardDeck'
import { ReleaseCarousel } from '$lib/bits/components/carousel'
import {
  PageDescription,
  PageHeader,
  PageSection,
  PageSectionActions,
  PageSectionHeader,
  PageSectionTitle,
  PageTitle,
} from '$lib/bits/pages/shared'
import { Main } from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { apiFamilyThemes } from '$lib/registry/apiFamilyTheme'
import { getDataPageData } from '$lib/registry/meta.remote'

let data = $derived(await getDataPageData())
let locale = $derived(getCurrentLocale())
let activeApiIndex = $state<number | null>(null)
let apiDeckOrder = $state<number[]>([0, 1, 2, 3, 4])
let apiSwipeState = $state({
  pointerId: null as number | null,
  startX: 0,
  startY: 0,
  deltaX: 0,
  deltaY: 0,
  hasMoved: false,
  isDragging: false,
  isThrowing: false,
  dragMode: null as 'desktop' | 'mobile' | null,
  throwDirection: 1,
  throwingApiIndex: null as number | null,
  draggedApiIndex: null as number | null,
})
let suppressApiClick = false
let isApiMobileStack = $state<boolean | null>(null)
let isApiDeckVisible = $state(false)
let releaseCarousel = $state<{ scrollByPage: (direction: -1 | 1) => void }>()
let releaseCarouselNavigation = $state({
  canMoveBackward: false,
  canMoveForward: false,
})

const apiFamilyOrder = ['stats', 'divisions', 'addresses', 'places', 'streets'] as const
const atlasDocsUrl = '/docs'
const pendingApiFamilies = new Set(['stats', 'places', 'streets'])
const registryBackground = `linear-gradient(color-mix(in srgb, var(--background) 88%, transparent), color-mix(in srgb, var(--background) 88%, transparent)), url("data:image/svg+xml,%3Csvg width='120' height='96' viewBox='0 0 120 96' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 18c24 0 36 10 60 10s36-10 60-10M0 42c24 0 36 10 60 10s36-10 60-10M0 66c24 0 36 10 60 10s36-10 60-10M0 90c24 0 36 10 60 10s36-10 60-10' fill='none' stroke='%238e9192' stroke-width='0.7' opacity='0.14'/%3E%3C/svg%3E")`

onMount(() => {
  window.requestAnimationFrame(() => {
    isApiDeckVisible = true
  })
})

const rotateApiToBack = () => {
  const frontApiIndex = apiDeckOrder[0]
  if (frontApiIndex === undefined) return
  apiDeckOrder = [...apiDeckOrder.slice(1), frontApiIndex]
  activeApiIndex = null
  return frontApiIndex
}

const resetApiSwipeState = () => {
  apiSwipeState = {
    pointerId: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    hasMoved: false,
    isDragging: false,
    isThrowing: false,
    dragMode: null,
    throwDirection: 1,
    throwingApiIndex: null,
    draggedApiIndex: null,
  }
}

const handleApiPointerDown = (
  event: PointerEvent,
  apiIndex: number,
  orderIndex: number,
) => {
  const isDesktop = window.innerWidth > 900
  if (!isDesktop && orderIndex !== 0) return
  if (!isDesktop) isApiMobileStack = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  apiSwipeState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    deltaX: 0,
    deltaY: 0,
    hasMoved: false,
    isDragging: true,
    isThrowing: false,
    dragMode: isDesktop ? 'desktop' : 'mobile',
    throwDirection: 1,
    throwingApiIndex: null,
    draggedApiIndex: apiIndex,
  }
}

const handleApiPointerMove = (event: PointerEvent) => {
  if (apiSwipeState.pointerId !== event.pointerId) return
  const deltaX = event.clientX - apiSwipeState.startX
  const deltaY = event.clientY - apiSwipeState.startY
  const hasMoved = Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8
  if (hasMoved && event.cancelable) event.preventDefault()
  apiSwipeState = {
    ...apiSwipeState,
    deltaX,
    deltaY: deltaY * (apiSwipeState.dragMode === 'desktop' ? 1 : 0.35),
    hasMoved,
  }
}

const handleApiPointerEnd = (event: PointerEvent) => {
  if (apiSwipeState.pointerId !== event.pointerId) return
  if (
    apiSwipeState.dragMode === 'desktop' &&
    apiSwipeState.hasMoved &&
    apiSwipeState.draggedApiIndex !== null
  ) {
    suppressApiClick = true
    activeApiIndex = apiSwipeState.draggedApiIndex
    resetApiSwipeState()
    return
  }
  if (Math.abs(apiSwipeState.deltaX) > 76) {
    suppressApiClick = true
    const throwingApiIndex = apiDeckOrder[0]
    apiSwipeState = {
      ...apiSwipeState,
      pointerId: null,
      isDragging: false,
      isThrowing: true,
      throwDirection: apiSwipeState.deltaX >= 0 ? 1 : -1,
      throwingApiIndex: throwingApiIndex ?? null,
    }
    window.setTimeout(() => {
      rotateApiToBack()
      resetApiSwipeState()
    }, 420)
    return
  }
  if (apiSwipeState.hasMoved) suppressApiClick = true
  resetApiSwipeState()
}

const handleApiClick = (index: number) => {
  if (suppressApiClick) {
    suppressApiClick = false
    return
  }
  if (window.innerWidth <= 900) {
    activeApiIndex = null
    return
  }
  activeApiIndex = activeApiIndex === index ? null : index
}

const handleApiClickCapture = (event: MouseEvent) => {
  if (!suppressApiClick) return
  event.preventDefault()
  event.stopImmediatePropagation()
  suppressApiClick = false
}

const handleViewportResize = () => {
  const nextIsApiMobileStack = window.innerWidth <= 900
  if (isApiMobileStack !== null && isApiMobileStack !== nextIsApiMobileStack) {
    apiDeckOrder = [0, 1, 2, 3, 4]
    activeApiIndex = null
  }
  isApiMobileStack = nextIsApiMobileStack
  resetApiSwipeState()
  if (window.innerWidth <= 900) activeApiIndex = null
}

const apiByFamily = $derived(
  new Map(data.apis.map(api => [api.familyType.toLowerCase(), api])),
)
const apiDirectory = $derived(
  apiFamilyOrder.map(familyType => {
    const api = apiByFamily.get(familyType)
    const releases =
      api?.releases ?? data.releases.filter(release => release.apiFamily === familyType)
    const latestRelease =
      releases.find(release => release.displayStatus === 'current') ??
      [...releases].sort(
        (left, right) =>
          new Date(right.publishedAt ?? right.createdAt).getTime() -
          new Date(left.publishedAt ?? left.createdAt).getTime(),
      )[0]
    return {
      familyType,
      code: api?.code ?? `api-${familyType}-v0.1`,
      status: api?.status ?? 'planned',
      version: api?.version ?? '0.1',
      latestRelease,
      isPending: pendingApiFamilies.has(familyType),
      theme: apiFamilyThemes[familyType],
    }
  }),
)
const apiDirectoryItem = (index: number) => {
  const item = apiDirectory[index] ?? apiDirectory[0]
  if (!item) throw new Error('The API directory is empty')
  return item
}
const docsUrlForFamily = (familyType: string) => `${atlasDocsUrl}#tag/${familyType}`

const releaseDisplayCode = (code?: string | null, familyType?: string) => {
  if (!code) return m.data_no_release()
  const normalizedFamily = familyType?.toLowerCase()
  if (normalizedFamily)
    return code.replace(
      new RegExp(
        `^(?:data|rs)-hk-${normalizedFamily.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-`,
      ),
      '',
    )
  return code.replace(/^(?:data|rs)-hk-[a-z-]+-/, '')
}
const displayDate = (value?: string | null) =>
  !value
    ? m.data_unpublished()
    : new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }).format(new Date(value))
const compactNumber = (value: number) =>
  new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
    notation: 'compact',
  }).format(value)
const releaseRecordCount = (release: (typeof data.releases)[number]) => {
  return typeof release.primaryRecordCount === 'number'
    ? compactNumber(release.primaryRecordCount)
    : null
}
const releaseCarouselItems = $derived(
  data.releases.map(release => ({
    release,
    displayDate: displayDate(release.publishedAt ?? release.createdAt),
    displayCode: releaseDisplayCode(release.code, release.apiFamily),
    records: releaseRecordCount(release),
  })),
)

const collapsedDeckPositions = [
  'min-[901px]:left-[calc(50%-37rem)] min-[901px]:translate-y-[0.2rem] min-[901px]:-rotate-3',
  'min-[901px]:left-[calc(50%-22.8rem)] min-[901px]:translate-y-[1.35rem] min-[901px]:rotate-[1.6deg]',
  'min-[901px]:left-[calc(50%-8.6rem)] min-[901px]:translate-y-[-0.35rem] min-[901px]:rotate-[-1.2deg]',
  'min-[901px]:left-[calc(50%+5.55rem)] min-[901px]:translate-y-[0.85rem] min-[901px]:rotate-3',
  'min-[901px]:left-[calc(50%+19.7rem)] min-[901px]:translate-y-[0.1rem] min-[901px]:rotate-[-1.5deg]',
] as const
const expandedDeckPositions = [
  'min-[901px]:left-[calc(50%-27rem)] min-[901px]:translate-y-[0.2rem] min-[901px]:-rotate-3',
  'min-[901px]:left-[calc(50%-14.8rem)] min-[901px]:translate-y-[1.05rem] min-[901px]:rotate-[1.6deg]',
  'min-[901px]:left-[calc(50%-2.7rem)] min-[901px]:translate-y-[-0.35rem] min-[901px]:rotate-[-1.2deg]',
  'min-[901px]:left-[calc(50%+9.4rem)] min-[901px]:translate-y-[0.6rem] min-[901px]:rotate-2',
] as const
const mobileDeckPositions = [
  'max-[900px]:z-20 max-[900px]:transform-[translateX(-50%)_translate(var(--swipe-x),var(--swipe-y))_rotate(var(--swipe-rotate))]',
  'max-[900px]:z-19 max-[900px]:transform-[translateX(-50%)_translate(.65rem,.55rem)_rotate(2.4deg)]',
  'max-[900px]:z-18 max-[900px]:transform-[translateX(-50%)_translate(1.25rem,1.1rem)_rotate(4.2deg)]',
  'max-[900px]:z-17 max-[900px]:transform-[translateX(-50%)_translate(1.8rem,1.65rem)_rotate(6deg)]',
  'max-[900px]:z-16 max-[900px]:transform-[translateX(-50%)_translate(2.25rem,2.05rem)_rotate(7.5deg)]',
] as const
const apiCardClass = (apiIndex: number, orderIndex: number) => {
  const isActive = activeApiIndex === apiIndex
  const nonActivePosition =
    activeApiIndex === null
      ? -1
      : apiDeckOrder.filter(index => index !== activeApiIndex).indexOf(apiIndex)
  const mobilePosition = apiSwipeState.isThrowing
    ? orderIndex === 0
      ? 4
      : orderIndex - 1
    : orderIndex
  const desktopClass = isActive
    ? 'min-[901px]:top-4! min-[901px]:left-1/2! min-[901px]:z-5! min-[901px]:h-152! min-[901px]:w-[min(26rem,100%)]! min-[901px]:opacity-100! min-[901px]:transform-[translateX(-50%)_rotate(0deg)]! min-[901px]:shadow-[0_1.25rem_3rem_rgb(0_0_0/0.2)]'
    : activeApiIndex !== null
      ? `min-[901px]:top-132 min-[901px]:h-41 min-[901px]:w-[min(16.25rem,23vw)] min-[901px]:opacity-74 ${expandedDeckPositions[nonActivePosition]}`
      : (collapsedDeckPositions[apiIndex] ?? '')
  const isDesktopDragCandidate =
    apiSwipeState.dragMode === 'desktop' &&
    apiSwipeState.hasMoved &&
    apiSwipeState.draggedApiIndex === apiIndex &&
    !isActive
  const isDesktopActiveDrag =
    apiSwipeState.dragMode === 'desktop' &&
    apiSwipeState.isDragging &&
    apiSwipeState.draggedApiIndex === apiIndex &&
    isActive
  const desktopDragClass = isDesktopDragCandidate
    ? 'min-[901px]:top-4! min-[901px]:left-1/2! min-[901px]:z-6! min-[901px]:h-152! min-[901px]:w-[min(26rem,100%)]! min-[901px]:cursor-grabbing min-[901px]:opacity-100! min-[901px]:transition-[top,left,width,height,border-color,opacity,box-shadow]! min-[901px]:duration-500 min-[901px]:will-change-transform min-[901px]:transform-[translateX(calc(-50%+var(--swipe-x)))_translateY(var(--swipe-y))_rotate(var(--swipe-rotate))]!'
    : isDesktopActiveDrag
      ? 'min-[901px]:cursor-grabbing min-[901px]:transition-[border-color,box-shadow]! min-[901px]:will-change-transform min-[901px]:transform-[translateX(calc(-50%+var(--swipe-x)))_translateY(var(--swipe-y))_rotate(var(--swipe-rotate))]!'
      : ''
  return `absolute top-16 left-0 z-1 flex h-112 w-[min(18rem,26vw)] cursor-grab flex-col justify-between overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--api-card-foreground)_24%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--api-accent)_88%,white),var(--api-accent))] p-5 text-left text-(--api-card-foreground) select-none shadow-mini transition-[top,left,width,transform,border-color,height,opacity,box-shadow] duration-500 hover:border-[color-mix(in_srgb,var(--api-card-foreground)_58%,transparent)] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--api-card-foreground)_18%,transparent),var(--shadow-mini)] focus-visible:border-[color-mix(in_srgb,var(--api-card-foreground)_58%,transparent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,var(--api-card-foreground)_18%,transparent),var(--shadow-mini)] active:cursor-grabbing dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--api-accent)_72%,black),color-mix(in_srgb,var(--api-accent)_86%,black))] max-[900px]:top-5 max-[900px]:left-1/2 max-[900px]:h-124 max-[900px]:w-[min(20rem,calc(100vw-4rem))] max-[900px]:justify-start max-[900px]:p-5 max-[900px]:origin-center max-[900px]:touch-none ${desktopClass} ${desktopDragClass} ${mobileDeckPositions[mobilePosition] ?? ''} ${apiSwipeState.isDragging && apiSwipeState.dragMode === 'mobile' && orderIndex === 0 ? 'max-[900px]:transition-[border-color,box-shadow]' : ''}`
}
</script>

<svelte:window onresize={handleViewportResize} />

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) bg-(image:--registry-background) bg-repeat px-6 py-14 md:px-8 md:py-18"
  style={`--registry-background: ${registryBackground};`}
>
  <section class="space-y-10">
    <PageHeader>
      <PageTitle>{m.data_title()}</PageTitle>
      <PageDescription>{m.data_description()}</PageDescription>
    </PageHeader>
  </section>

  <PageSection id="apis">
    <PageSectionHeader>
      <PageSectionTitle>{m.data_apis()}</PageSectionTitle>
      <PageSectionActions>
        <a
          class="font-body text-label-md font-semibold text-secondary"
          href={atlasDocsUrl}
          >{m.data_api_docs()}</a
        >
      </PageSectionActions>
    </PageSectionHeader>

    <CardDeck.Root
      class={`relative mt-6 h-140 isolate overflow-visible py-3 transition-[height] duration-500 before:absolute before:inset-0 before:-z-1 before:bg-[radial-gradient(var(--secondary)_1px,transparent_1px)] before:bg-size-[1.2rem_1.2rem] before:opacity-[0.05] ${activeApiIndex !== null ? 'min-[901px]:h-180' : ''} max-[900px]:block max-[900px]:h-140 max-[900px]:pt-5 max-[900px]:pb-8`}
    >
      {#each apiDeckOrder as apiIndex, orderIndex (apiIndex)}
        {@const api = apiDirectoryItem(apiIndex)}
        {#if isApiDeckVisible}
          <CardDeck.Card
            intro={{ y: 18, duration: 360, delay: orderIndex * 70 }}
            as="article"
            class={apiCardClass(apiIndex, orderIndex)}
            style={`--api-accent: ${api.theme.colorway.primary}; --api-card-foreground: ${api.familyType === 'streets' ? api.theme.colorway.ink : '#fffaf0'}; --api-image-scale: ${api.familyType === 'streets' ? 1.25 : api.familyType === 'places' ? 1.05 : 1}; --swipe-x: ${apiSwipeState.draggedApiIndex === apiIndex ? apiSwipeState.deltaX : 0}px; --swipe-y: ${apiSwipeState.draggedApiIndex === apiIndex ? apiSwipeState.deltaY : 0}px; --swipe-rotate: ${apiSwipeState.draggedApiIndex === apiIndex ? apiSwipeState.deltaX * 0.035 : 0}deg;`}
            onclickcapture={handleApiClickCapture}
            onpointerdown={(event: PointerEvent) => handleApiPointerDown(event, apiIndex, orderIndex)}
            onpointermove={handleApiPointerMove}
            onpointerup={handleApiPointerEnd}
            onpointercancel={handleApiPointerEnd}
            onclick={() => handleApiClick(apiIndex)}
          >
            {#if apiIndex !== 2}
              <CardDeck.Visual
                class={`absolute size-[1.1rem] border-current opacity-[0.42] ${apiIndex === 0 ? 'top-[-0.45rem] left-[-0.45rem] border-t border-l' : 'right-[-0.45rem] bottom-[-0.45rem] border-r border-b'}`}
              />
            {/if}
            <CardDeck.Visual
              class="relative mb-4 block aspect-square w-full shrink-0 overflow-hidden rounded-[0.65rem] bg-[color-mix(in_srgb,var(--api-card-foreground)_15%,transparent)]"
            >
              <img
                class="pointer-events-none block size-full object-fill transform-[scale(var(--api-image-scale))] origin-center"
                src={api.theme.image}
                alt=""
                draggable="false"
              >
            </CardDeck.Visual>
            <span class="relative z-2 block">
              <span class="flex flex-wrap items-start justify-between gap-3"
                ><span
                  class="block font-body text-caption font-semibold uppercase tracking-[0.16em] opacity-78"
                  >{api.isPending ? m.data_planned_api() : m.data_public_api()}</span
                >
                {#if api.isPending}
                  <span
                    class="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--api-card-foreground)_34%,transparent)] bg-[color-mix(in_srgb,var(--api-card-foreground)_15%,transparent)] px-2 py-1 font-body text-[0.7rem] leading-none font-extrabold uppercase"
                    >{m.data_coming_soon()}</span
                  >
                {/if}</span
              >
              <span
                class="mt-3 block font-display text-headline-lg-md font-bold leading-[1.02]"
                >{api.theme.name}</span
              >
              <span
                class="mt-5 flex flex-wrap items-center gap-2 font-body text-label-md"
                ><a
                  class="inline-flex items-center gap-[0.28rem] rounded-full border border-[color-mix(in_srgb,var(--api-card-foreground)_34%,transparent)] bg-[color-mix(in_srgb,var(--api-card-foreground)_13%,transparent)] px-3 py-1.5 font-bold no-underline transition-colors hover:border-[color-mix(in_srgb,var(--api-card-foreground)_62%,transparent)] hover:bg-[color-mix(in_srgb,var(--api-card-foreground)_22%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--api-card-foreground)_62%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--api-card-foreground)_22%,transparent)] focus-visible:outline-none"
                  href={`/apis/${api.familyType}`}
                  onpointerdown={event => event.stopPropagation()}
                  onclick={event => event.stopPropagation()}
                  >{m.data_releases()}</a
                ><a
                  class="inline-flex items-center gap-[0.28rem] rounded-full border border-[color-mix(in_srgb,var(--api-card-foreground)_34%,transparent)] bg-[color-mix(in_srgb,var(--api-card-foreground)_13%,transparent)] px-3 py-1.5 font-bold no-underline transition-colors hover:border-[color-mix(in_srgb,var(--api-card-foreground)_62%,transparent)] hover:bg-[color-mix(in_srgb,var(--api-card-foreground)_22%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--api-card-foreground)_62%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--api-card-foreground)_22%,transparent)] focus-visible:outline-none"
                  href={docsUrlForFamily(api.familyType)}
                  target="_blank"
                  rel="noreferrer"
                  onpointerdown={event => event.stopPropagation()}
                  onclick={event => event.stopPropagation()}
                  >{m.data_docs()}
                  <Icon icon="proicons:arrow-up-right" class="size-4" /></a
                ></span
              >
              <span
                class={`block max-h-0 overflow-hidden opacity-0 pointer-events-none transition-[max-height,margin-top,opacity] duration-450 ${activeApiIndex === apiIndex || (apiSwipeState.dragMode === 'desktop' && apiSwipeState.hasMoved && apiSwipeState.draggedApiIndex === apiIndex) ? 'mt-4 max-h-32 opacity-100 pointer-events-auto' : ''}`}
                ><dl class="grid gap-2 font-body text-caption">
                  <div class="flex items-baseline justify-between gap-4">
                    <dt class="font-semibold uppercase opacity-72">
                      {m.data_api_version()}
                    </dt>
                    <dd
                      class="rounded-[0.35rem] border border-[color-mix(in_srgb,var(--api-card-foreground)_28%,transparent)] bg-[color-mix(in_srgb,var(--api-card-foreground)_14%,transparent)] px-2 py-0.5 font-mono text-[0.76rem] font-extrabold"
                    >
                      v{api.version}
                    </dd>
                  </div>
                  <div class="flex items-baseline justify-between gap-4">
                    <dt class="font-semibold uppercase opacity-72">
                      {m.data_latest_release()}
                    </dt>
                    <dd
                      class="rounded-[0.35rem] border border-[color-mix(in_srgb,var(--api-card-foreground)_28%,transparent)] bg-[color-mix(in_srgb,var(--api-card-foreground)_14%,transparent)] px-2 py-0.5 font-mono text-[0.76rem] font-extrabold"
                    >
                      {releaseDisplayCode(api.latestRelease?.code, api.familyType)}
                    </dd>
                  </div>
                </dl></span
              >
            </span>
          </CardDeck.Card>
        {/if}
      {/each}
    </CardDeck.Root>
  </PageSection>

  <PageSection id="releases">
    <PageSectionHeader>
      <PageSectionTitle>{m.data_releases()}</PageSectionTitle>
      <PageSectionActions>
        <button
          class="grid size-9 place-items-center rounded border border-outline-variant text-secondary transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:pointer-events-none disabled:opacity-40"
          type="button"
          aria-label="Previous releases"
          disabled={!releaseCarouselNavigation.canMoveBackward}
          onclick={() => releaseCarousel?.scrollByPage(-1)}
        >
          <Icon icon="proicons:chevron-left" class="size-4" />
        </button>
        <button
          class="grid size-9 place-items-center rounded border border-outline-variant text-secondary transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:pointer-events-none disabled:opacity-40"
          type="button"
          aria-label="Next releases"
          disabled={!releaseCarouselNavigation.canMoveForward}
          onclick={() => releaseCarousel?.scrollByPage(1)}
        >
          <Icon icon="proicons:chevron-right" class="size-4" />
        </button>
      </PageSectionActions>
    </PageSectionHeader>
    {#if releaseCarouselItems.length > 0}
      <ReleaseCarousel
        bind:this={releaseCarousel}
        items={releaseCarouselItems}
        onnavigationchange={navigation => (releaseCarouselNavigation = navigation)}
      />
    {:else}
      <p class="mt-6 text-sm text-secondary">{m.data_no_releases_yet()}</p>
    {/if}
  </PageSection>
</Main>
