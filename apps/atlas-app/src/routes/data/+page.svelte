<script lang="ts">
import Icon from '@iconify/svelte'
import { Popover } from 'bits-ui'
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
import { Main, Seo } from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { apiFamilyThemes } from '$lib/registry/apiFamilyTheme'
import {
  getDataPageApiData,
  getDataPageBasemapData,
  getDataReleasesPageData,
  type DataPageRelease,
} from '$lib/registry/meta.remote'
import {
  getMarkdownTransclusion,
  getMarkdownTransclusionDisplayTitle,
} from '$lib/registry/referenceDocs'
import BasemapPostcard from '$lib/bits/pages/data/basemapPostcard.svelte'

const apiDataQuery = getDataPageApiData()
const basemapDataQuery = getDataPageBasemapData()
let apiData = $derived(apiDataQuery.ready ? apiDataQuery.current : undefined)
let basemapData = $derived(
  basemapDataQuery.ready ? basemapDataQuery.current : undefined,
)
let releases = $state<DataPageRelease[]>([])
let locale = $derived(getCurrentLocale())
const definitionHref = (id: 'api' | 'basemap') =>
  `saanseoi:${locale.toLowerCase()}:definition/${id}/v1`
let apiDefinition = $derived(getMarkdownTransclusion(definitionHref('api')))
let basemapDefinition = $derived(getMarkdownTransclusion(definitionHref('basemap')))
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
let isBasemapDeckVisible = $state(false)
let isReleaseCarouselVisible = $state(false)
let releaseCarousel = $state<{ scrollByPage: (direction: -1 | 1) => void }>()
let releaseCarouselNavigation = $state({
  canMoveBackward: false,
  canMoveForward: false,
})
let hasMoreReleases = $state(false)
let isLoadingMoreReleases = $state(false)
let nextReleaseOffset = $state(0)

const apiFamilyOrder = ['stats', 'divisions', 'addresses', 'places', 'streets'] as const
const atlasDocsUrl = '/docs'
const pendingApiFamilies = new Set(['stats', 'places', 'streets'])
const latestBasemapVersion = (code: 'gba' | 'hk' | 'mo') =>
  basemapData?.basemapReleases.find(
    release => release.regionCode === code && release.displayStatus === 'current',
  )?.version ??
  basemapData?.basemapReleases.find(release => release.regionCode === code)?.version ??
  'latest'
const basemapDirectory = [
  {
    code: 'hk',
    name: 'Hong Kong',
    tileset: 'hongkong',
  },
  {
    code: 'gba',
    name: 'Greater Bay Area',
    tileset: 'gba',
  },
  {
    code: 'mo',
    name: 'Macao',
    tileset: 'macau',
  },
] as const
let activeBasemapCode = $state<(typeof basemapDirectory)[number]['code'] | null>(null)
let basemapFlipDirection = $state<1 | -1>(1)
let suppressBasemapClick = false
let basemapDragState = $state({
  pointerId: null as number | null,
  startX: 0,
  startY: 0,
  deltaX: 0,
  deltaY: 0,
  hasMoved: false,
  isDragging: false,
  isThrowing: false,
  throwPhase: null as 'launch' | 'flight' | 'settle' | null,
  draggedCode: null as (typeof basemapDirectory)[number]['code'] | null,
  throwingCode: null as (typeof basemapDirectory)[number]['code'] | null,
})
onMount(() => {
  window.requestAnimationFrame(() => {
    isApiDeckVisible = true
    isBasemapDeckVisible = true
    isReleaseCarouselVisible = true
  })
})

$effect(() => {
  if (!apiData) return
  releases = apiData.releases
  hasMoreReleases = apiData.hasMore
  nextReleaseOffset = apiData.nextOffset
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
  resetBasemapDragState()
  if (window.innerWidth <= 900) activeApiIndex = null
}

const apiByFamily = $derived(
  new Map(apiData?.apis.map(api => [api.familyType.toLowerCase(), api]) ?? []),
)
const apiDirectory = $derived(
  apiFamilyOrder.map(familyType => {
    const api = apiByFamily.get(familyType)
    const familyReleases =
      api?.releases ?? releases.filter(release => release.apiFamily === familyType)
    const latestRelease =
      familyReleases.find(release => release.displayStatus === 'current') ??
      [...familyReleases].sort(
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
const apiFamilyDescription = (familyType: string) =>
  ({
    divisions: m.data_api_description_divisions(),
    addresses: m.data_api_description_addresses(),
    places: m.data_api_description_places(),
    streets: m.data_api_description_streets(),
    stats: m.data_api_description_stats(),
  })[familyType] ?? m.data_public_api()
const docsUrlForFamily = (familyType: string) => `${atlasDocsUrl}#tag/${familyType}`

const releaseDisplayCode = (code?: string | null, familyType?: string) => {
  if (!code) return m.data_no_release()
  const normalisedFamily = familyType?.toLowerCase()
  if (normalisedFamily)
    return code.replace(
      new RegExp(
        `^(?:data|rs)-hk-${normalisedFamily.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-`,
      ),
      '',
    )
  return code.replace(/^(?:data|rs)-hk-[a-z-]+-/, '')
}
const displayDate = (value?: string | null) => {
  if (!value) return m.data_unpublished()
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}
const compactNumber = (value: number) =>
  new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
    notation: 'compact',
  }).format(value)
const releaseRecordCount = (release: DataPageRelease) => {
  return typeof release.primaryRecordCount === 'number'
    ? compactNumber(release.primaryRecordCount)
    : null
}
const releaseCarouselItems = $derived(
  releases.map(release => ({
    kind: 'api' as const,
    release,
    displayDate: displayDate(release.publishedAt ?? release.createdAt),
    displayCode: releaseDisplayCode(release.code, release.apiFamily),
    records: releaseRecordCount(release),
  })),
)
const basemapReleaseCarouselItems = $derived(
  (basemapData?.basemapReleases ?? []).map(release => ({
    kind: 'basemap' as const,
    release,
    displayDate: displayDate(release.version),
    displayCode: release.code,
    size: `${(release.size / 1_000_000).toFixed(1)} Mb`,
  })),
)
const allReleaseCarouselItems = $derived(
  [...releaseCarouselItems, ...basemapReleaseCarouselItems].sort((left, right) => {
    const leftDate =
      left.kind === 'basemap'
        ? left.release.version
        : (left.release.publishedAt ?? left.release.createdAt)
    const rightDate =
      right.kind === 'basemap'
        ? right.release.version
        : (right.release.publishedAt ?? right.release.createdAt)
    return rightDate.localeCompare(leftDate)
  }),
)
const isInitialReleaseLoading = $derived(
  apiDataQuery.loading || basemapDataQuery.loading,
)

const loadMoreReleases = async () => {
  if (isLoadingMoreReleases || !hasMoreReleases) return

  isLoadingMoreReleases = true
  try {
    const nextPage = await getDataReleasesPageData({ offset: nextReleaseOffset })
    const existingReleaseIds = new Set(releases.map(release => release.id))
    releases = [
      ...releases,
      ...nextPage.releases.filter(release => !existingReleaseIds.has(release.id)),
    ]
    hasMoreReleases = nextPage.hasMore
    nextReleaseOffset = nextPage.nextOffset
  } finally {
    isLoadingMoreReleases = false
  }
}

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
    ? 'min-[901px]:top-4! min-[901px]:left-1/2! min-[901px]:z-5! min-[901px]:h-[calc(36rem+6px)]! min-[901px]:w-[min(26rem,100%)]! min-[901px]:opacity-100! min-[901px]:transform-[translateX(-50%)_rotate(0deg)]! min-[901px]:shadow-[0_1.25rem_3rem_rgb(0_0_0/0.2)]'
    : activeApiIndex !== null
      ? `min-[901px]:top-132 min-[901px]:h-65.5 min-[901px]:w-[min(16.25rem,23vw)] ${expandedDeckPositions[nonActivePosition]}`
      : (collapsedDeckPositions[apiIndex] ?? '')
  const isDesktopActiveDrag =
    apiSwipeState.dragMode === 'desktop' &&
    apiSwipeState.isDragging &&
    apiSwipeState.draggedApiIndex === apiIndex &&
    isActive
  const isDesktopDragCandidate =
    apiSwipeState.dragMode === 'desktop' &&
    apiSwipeState.isDragging &&
    apiSwipeState.draggedApiIndex === apiIndex &&
    !isActive
  const desktopDragClass = isDesktopDragCandidate
    ? 'min-[901px]:z-6! min-[901px]:cursor-grabbing min-[901px]:transition-[border-color,box-shadow]! min-[901px]:will-change-transform min-[901px]:transform-[translate(var(--swipe-x),var(--swipe-y))_rotate(var(--swipe-rotate))]!'
    : isDesktopActiveDrag
      ? 'min-[901px]:cursor-grabbing min-[901px]:transition-[border-color,box-shadow]! min-[901px]:will-change-transform min-[901px]:transform-[translateX(calc(-50%+var(--swipe-x)))_translateY(var(--swipe-y))_rotate(var(--swipe-rotate))]!'
      : ''
  return `group absolute top-16 left-0 z-1 flex h-[calc(29.5rem-20px)] w-[min(18rem,26vw)] cursor-grab flex-col overflow-hidden rounded-[1.1rem] border border-[color-mix(in_srgb,var(--api-card-foreground)_28%,transparent)] bg-[linear-gradient(160deg,color-mix(in_srgb,var(--api-accent)_86%,white),var(--api-accent))] p-[0.55rem] text-left text-(--api-card-foreground) select-none shadow-[0_0.8rem_2.2rem_rgb(0_0_0/0.16)] transition-[top,left,width,transform,translate,rotate,border-color,height,opacity,box-shadow] duration-500 after:pointer-events-none after:absolute after:inset-[0.42rem] after:z-0 after:rounded-[0.78rem] after:border-[0.42rem] after:border-white/45 after:content-[''] min-[901px]:hover:[translate:0_-0.75rem] min-[901px]:hover:rotate-[0.001deg] hover:border-[color-mix(in_srgb,var(--api-card-foreground)_64%,transparent)] hover:shadow-[0_1.1rem_2.8rem_rgb(0_0_0/0.24)] focus-visible:border-[color-mix(in_srgb,var(--api-card-foreground)_64%,transparent)] focus-visible:outline-none focus-visible:shadow-[0_1.1rem_2.8rem_rgb(0_0_0/0.24)] active:cursor-grabbing dark:bg-[linear-gradient(160deg,color-mix(in_srgb,var(--api-accent)_72%,black),color-mix(in_srgb,var(--api-accent)_88%,black))] max-[900px]:top-5 max-[900px]:left-1/2 max-[900px]:h-[calc(32.5rem-20px)] max-[900px]:w-[min(20rem,calc(100vw-4rem))] max-[900px]:origin-center max-[900px]:touch-none ${desktopClass} ${desktopDragClass} ${mobileDeckPositions[mobilePosition] ?? ''} ${apiSwipeState.isDragging && apiSwipeState.dragMode === 'mobile' && orderIndex === 0 ? 'max-[900px]:transition-[border-color,box-shadow]' : ''}`
}

const activateBasemap = (code: (typeof basemapDirectory)[number]['code']) => {
  if (suppressBasemapClick) {
    suppressBasemapClick = false
    return
  }
  if (basemapDragState.isThrowing) return
  if (activeBasemapCode !== code) {
    basemapFlipDirection = code === 'gba' ? -1 : 1
  }
  activeBasemapCode = activeBasemapCode === code ? null : code
}

const handlePageKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  if (activeApiIndex === null && activeBasemapCode === null) return

  activeApiIndex = null
  activeBasemapCode = null
  event.preventDefault()
}

const handlePageClick = (event: MouseEvent) => {
  if (
    activeBasemapCode === null ||
    basemapDragState.isDragging ||
    basemapDragState.isThrowing
  )
    return
  if (
    event.target instanceof Element &&
    event.target.closest('[data-basemap-postcard]')
  )
    return

  activeBasemapCode = null
}

const resetBasemapDragState = () => {
  basemapDragState = {
    pointerId: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    hasMoved: false,
    isDragging: false,
    isThrowing: false,
    throwPhase: null,
    draggedCode: null,
    throwingCode: null,
  }
}

const handleBasemapPointerDown = (
  event: PointerEvent,
  code: (typeof basemapDirectory)[number]['code'],
) => {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  basemapDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    deltaX: 0,
    deltaY: 0,
    hasMoved: false,
    isDragging: true,
    isThrowing: false,
    throwPhase: null,
    draggedCode: code,
    throwingCode: null,
  }
}

const handleBasemapPointerMove = (event: PointerEvent) => {
  if (basemapDragState.pointerId !== event.pointerId) return
  const deltaX = event.clientX - basemapDragState.startX
  const deltaY = event.clientY - basemapDragState.startY
  const hasMoved = Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8
  if (hasMoved && event.cancelable) event.preventDefault()
  basemapDragState = {
    ...basemapDragState,
    deltaX,
    deltaY,
    hasMoved,
  }
}

const handleBasemapPointerEnd = (event: PointerEvent) => {
  if (basemapDragState.pointerId !== event.pointerId) return
  const draggedCode = basemapDragState.draggedCode
  if (basemapDragState.hasMoved && draggedCode !== null) {
    suppressBasemapClick = true
    if (
      activeBasemapCode === draggedCode &&
      Math.hypot(basemapDragState.deltaX, basemapDragState.deltaY) >= 96
    ) {
      activeBasemapCode = null
      resetBasemapDragState()
      return
    }
    if (activeBasemapCode === draggedCode) {
      resetBasemapDragState()
      return
    }
    basemapFlipDirection = basemapDragState.deltaX >= 0 ? 1 : -1
    activeBasemapCode = draggedCode
    basemapDragState = {
      ...basemapDragState,
      pointerId: null,
      isDragging: false,
      isThrowing: true,
      throwPhase: 'launch',
      throwingCode: draggedCode,
    }
    window.setTimeout(() => {
      if (
        basemapDragState.throwingCode !== draggedCode ||
        basemapDragState.throwPhase !== 'launch'
      )
        return
      basemapDragState = { ...basemapDragState, throwPhase: 'flight' }
    }, 280)
    window.setTimeout(() => {
      if (
        basemapDragState.throwingCode !== draggedCode ||
        basemapDragState.throwPhase !== 'flight'
      )
        return
      basemapDragState = { ...basemapDragState, throwPhase: 'settle' }
    }, 800)
    window.setTimeout(() => {
      if (basemapDragState.throwingCode !== draggedCode) return
      resetBasemapDragState()
    }, 1_260)
    return
  }
  resetBasemapDragState()
}

const basemapInactiveIndex = (code: (typeof basemapDirectory)[number]['code']) =>
  basemapDirectory
    .filter(region => region.code !== activeBasemapCode)
    .findIndex(region => region.code === code)

const basemapCardClass = (code: (typeof basemapDirectory)[number]['code']) => {
  const isSelected = activeBasemapCode === code
  const isShrunk = activeBasemapCode !== null && !isSelected
  const inactiveIndex = basemapInactiveIndex(code)

  if (isSelected) {
    return 'relative order-1 w-full min-[901px]:absolute min-[901px]:top-12 min-[901px]:left-1/2 min-[901px]:w-[min(38rem,calc(100%-4rem))]'
  }

  if (isShrunk) {
    return `relative order-2 w-[86%] justify-self-center min-[901px]:absolute min-[901px]:top-132 min-[901px]:w-[min(15rem,27%)] ${inactiveIndex === 0 ? 'min-[901px]:left-[calc(50%-14rem)]' : 'min-[901px]:left-[calc(50%-2rem)]'}`
  }

  const positions = {
    hk: 'max-[900px]:absolute max-[900px]:top-0 max-[900px]:-left-3 max-[900px]:w-[96%] min-[901px]:top-21 min-[901px]:left-[4%]',
    gba: 'max-[900px]:absolute max-[900px]:top-[59cqw] max-[900px]:left-[2%] max-[900px]:w-[96%] min-[901px]:top-21 min-[901px]:left-[35%]',
    mo: 'max-[900px]:absolute max-[900px]:top-[118cqw] max-[900px]:left-[4%] max-[900px]:w-[96%] min-[901px]:top-21 min-[901px]:right-[4%]',
  } as const
  return `relative w-full min-[901px]:absolute min-[901px]:w-[30%] ${positions[code]}`
}
</script>

<Seo title={m.data_title()} description={m.data_description()} />

<svelte:window
  onresize={handleViewportResize}
  onkeydown={handlePageKeydown}
  onclick={handlePageClick}
/>

<Main
  class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-18"
>
  <section class="space-y-10">
    <PageHeader>
      <PageTitle>{m.data_title()}</PageTitle>
      <PageDescription>
        {m.data_description_before_apis()}
        <Popover.Root>
          <Popover.Trigger openOnHover openDelay={200}>
            {#snippet child({ props })}
              <button
                {...props}
                class="font-inherit font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
                type="button"
                aria-label={getMarkdownTransclusionDisplayTitle(apiDefinition, locale)}
              >
                {m.reference_api()}
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              class="z-70 max-w-80 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm text-foreground shadow-popover"
              side="bottom"
              sideOffset={8}
              collisionPadding={{ right: 16 }}
              >{@html apiDefinition?.markdown ?? ''}</Popover.Content
            >
          </Popover.Portal>
        </Popover.Root>
        {m.data_description_after_apis()}
        <Popover.Root>
          <Popover.Trigger openOnHover openDelay={200}>
            {#snippet child({ props })}
              <button
                {...props}
                class="font-inherit font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
                type="button"
                aria-label={getMarkdownTransclusionDisplayTitle(basemapDefinition, locale)}
              >
                {m.reference_basemap()}
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              class="z-70 max-w-80 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm text-foreground shadow-popover"
              side="bottom"
              sideOffset={8}
              collisionPadding={{ right: 16 }}
              >{@html basemapDefinition?.markdown ?? ''}</Popover.Content
            >
          </Popover.Portal>
        </Popover.Root>
        {m.data_description_after_basemaps()}
        <a
          class="font-semibold text-secondary underline decoration-secondary/45 underline-offset-4 hover:text-primary hover:decoration-primary"
          href="/guides/create-a-map"
          >{m.data_create_map()}</a
        >
        {m.data_description_after_create_map()}
      </PageDescription>
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
      class={`relative mt-6 h-143 isolate overflow-visible py-3 transition-[height] duration-500 before:absolute before:inset-0 before:-z-1 before:bg-[radial-gradient(var(--secondary)_1px,transparent_1px)] before:bg-size-[1.2rem_1.2rem] before:opacity-0 dark:before:opacity-[0.05] ${activeApiIndex !== null ? 'min-[901px]:h-220' : ''} max-[900px]:block max-[900px]:h-140 max-[900px]:pt-5 max-[900px]:pb-8`}
    >
      {#each apiDeckOrder as apiIndex, orderIndex (apiIndex)}
        {@const api = apiDirectoryItem(apiIndex)}
        {#if isApiDeckVisible}
          <CardDeck.Card
            intro={{ y: 18, duration: 360, delay: orderIndex * 70 }}
            as="article"
            class={apiCardClass(apiIndex, orderIndex)}
            style={`--api-accent: ${api.theme.colorway.primary}; --api-ink: ${api.theme.colorway.ink}; --api-card-foreground: #fff9ed; --swipe-x: ${apiSwipeState.draggedApiIndex === apiIndex ? apiSwipeState.deltaX : 0}px; --swipe-y: ${apiSwipeState.draggedApiIndex === apiIndex ? apiSwipeState.deltaY : 0}px; --swipe-rotate: ${apiSwipeState.draggedApiIndex === apiIndex ? apiSwipeState.deltaX * 0.035 : 0}deg;`}
            onclickcapture={handleApiClickCapture}
            onpointerdown={(event: PointerEvent) => handleApiPointerDown(event, apiIndex, orderIndex)}
            onpointermove={handleApiPointerMove}
            onpointerup={handleApiPointerEnd}
            onpointercancel={handleApiPointerEnd}
            onclick={() => handleApiClick(apiIndex)}
          >
            <div
              class={`relative z-1 flex size-full min-h-0 flex-col overflow-hidden rounded-[0.7rem] border border-black/16 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--api-accent)_86%,white),var(--api-accent))] px-2 pt-2 shadow-[inset_0_1px_rgb(255_255_255/0.2)] dark:bg-[linear-gradient(160deg,color-mix(in_srgb,var(--api-accent)_72%,black),color-mix(in_srgb,var(--api-accent)_88%,black))] ${activeApiIndex === apiIndex ? 'pb-[18px]' : 'pb-[6px]'}`}
            >
              <CardDeck.ApiVisual image={api.theme.image} />
              <CardDeck.ApiBody
                active={activeApiIndex === apiIndex}
                anotherCardActive={activeApiIndex !== null && activeApiIndex !== apiIndex}
                isLoading={apiDataQuery.loading}
                familyLabel={m.sources_flow_api_family()}
                accessLabel={api.isPending ? m.data_coming_soon() : m.data_open_access()}
                name={api.theme.name}
                description={apiFamilyDescription(api.familyType)}
                releasesHref={`/apis/${api.familyType}`}
                releasesLabel={m.data_releases()}
                docsHref={docsUrlForFamily(api.familyType)}
                docsLabel={m.data_docs()}
                versionLabel={m.data_api_version()}
                version={api.version}
                releaseLabel={m.data_latest_release()}
                release={releaseDisplayCode(api.latestRelease?.code, api.familyType)}
              />
            </div>
          </CardDeck.Card>
        {/if}
      {/each}
    </CardDeck.Root>
  </PageSection>

  <PageSection id="basemaps">
    <PageSectionHeader>
      <PageSectionTitle>{m.data_basemaps()}</PageSectionTitle>
      <PageSectionActions>
        <a class="font-body text-label-md font-semibold text-secondary" href="/themes"
          >{m.data_map_styles()}</a
        >
        <a
          class="font-body text-label-md font-semibold text-secondary"
          href="/basemaps/get-started"
          >{m.data_get_started()}</a
        >
      </PageSectionActions>
    </PageSectionHeader>
    <CardDeck.Root
      class={`relative mt-6 h-224 isolate overflow-visible transition-[height,padding] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none max-[900px]:mb-12 max-[900px]:@container ${activeBasemapCode === null ? 'pt-16 max-[900px]:h-[calc(182vw-5.46rem)] min-[901px]:h-112' : 'pt-12 max-[900px]:h-auto min-[901px]:h-184'}`}
    >
      {#if isBasemapDeckVisible}
        {#each basemapDirectory as region, index (region.code)}
          <div class="contents">
            <BasemapPostcard
              {...region}
              version={latestBasemapVersion(region.code)}
              isLoading={basemapDataQuery.loading}
              intro={{ y: 18, duration: 360, delay: index * 70 }}
              isSelected={activeBasemapCode === region.code}
              isShrunk={activeBasemapCode !== null && activeBasemapCode !== region.code}
              shrunkIndex={activeBasemapCode !== null && activeBasemapCode !== region.code
                ? basemapInactiveIndex(region.code)
                : null}
              isDragging={basemapDragState.isDragging && basemapDragState.draggedCode === region.code}
              isThrowing={basemapDragState.isThrowing && basemapDragState.throwingCode === region.code}
              throwPhase={basemapDragState.throwingCode === region.code
                ? basemapDragState.throwPhase
                : null}
              dragX={basemapDragState.draggedCode === region.code ? basemapDragState.deltaX : 0}
              dragY={basemapDragState.draggedCode === region.code ? basemapDragState.deltaY : 0}
              flipDirection={basemapFlipDirection}
              layoutClass={basemapCardClass(region.code)}
              onactivate={() => activateBasemap(region.code)}
              onpointerdown={event => handleBasemapPointerDown(event, region.code)}
              onpointermove={handleBasemapPointerMove}
              onpointerup={handleBasemapPointerEnd}
              onpointercancel={handleBasemapPointerEnd}
            />
          </div>
        {/each}
      {/if}
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
    {#if isReleaseCarouselVisible}
      {#if allReleaseCarouselItems.length > 0 || isInitialReleaseLoading}
        <div class="relative left-1/2 w-screen -translate-x-1/2">
          <ReleaseCarousel
            bind:this={releaseCarousel}
            items={allReleaseCarouselItems}
            isLoading={isInitialReleaseLoading || isLoadingMoreReleases}
            onnavigationchange={navigation => (releaseCarouselNavigation = navigation)}
            onreachend={loadMoreReleases}
          />
        </div>
      {:else}
        <p class="mt-6 text-sm text-secondary">{m.data_no_releases_yet()}</p>
      {/if}
    {/if}
  </PageSection>
</Main>
