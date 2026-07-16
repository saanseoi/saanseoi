<script lang="ts">
import Icon from '@iconify/svelte'
import { Main } from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import topoImage from '$lib/assets/topo.jpg'
import { apiFamilyThemes, getApiFamilyTheme } from '$lib/registry/apiFamilyTheme'
import { getDataPageData } from '$lib/registry/meta.remote'

let data = $derived(await getDataPageData())
let locale = $derived(getCurrentLocale())
let activeApiIndex = $state<number | null>(null)
let apiDeckOrder = $state<Array<0 | 1 | 2 | 3>>([0, 1, 2, 3])
let apiSwipeState = $state({
  pointerId: null as number | null,
  startX: 0,
  startY: 0,
  deltaX: 0,
  deltaY: 0,
  hasMoved: false,
  isDragging: false,
  isThrowing: false,
  throwDirection: 1,
  throwingApiIndex: null as 0 | 1 | 2 | 3 | null,
})
let suppressApiClick = false
let isApiMobileStack = $state<boolean | null>(null)

const apiFamilyOrder = ['divisions', 'addresses', 'places', 'streets'] as const
const atlasDocsUrl = '/docs'
const pendingApiFamilies = new Set(['places', 'streets'])

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
    throwDirection: 1,
    throwingApiIndex: null,
  }
}

const handleApiPointerDown = (event: PointerEvent, orderIndex: number) => {
  if (window.innerWidth > 900) return
  if (orderIndex !== 0) return

  isApiMobileStack = true
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
    throwDirection: 1,
    throwingApiIndex: null,
  }
}

const handleApiPointerMove = (event: PointerEvent) => {
  if (window.innerWidth > 900) {
    resetApiSwipeState()
    return
  }

  if (apiSwipeState.pointerId !== event.pointerId) return

  if (event.cancelable) event.preventDefault()

  const deltaX = event.clientX - apiSwipeState.startX
  const deltaY = event.clientY - apiSwipeState.startY
  apiSwipeState = {
    ...apiSwipeState,
    deltaX,
    deltaY,
    hasMoved: Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8,
  }
}

const handleApiPointerEnd = (event: PointerEvent) => {
  if (window.innerWidth > 900) {
    resetApiSwipeState()
    return
  }

  if (apiSwipeState.pointerId !== event.pointerId) return

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
  } else if (apiSwipeState.hasMoved) {
    suppressApiClick = true
  }

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

const handleViewportResize = () => {
  const nextIsApiMobileStack = window.innerWidth <= 900

  if (isApiMobileStack !== null && isApiMobileStack !== nextIsApiMobileStack) {
    apiDeckOrder = [0, 1, 2, 3]
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
    const latestRelease = [...releases].sort(
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

const apiDirectoryItem = (index: 0 | 1 | 2 | 3) => {
  const api = apiDirectory[index] ?? apiDirectory[0]

  if (!api) throw new Error('The API directory must contain at least one item.')

  return api
}

const docsUrlForFamily = (familyType: string) => `${atlasDocsUrl}#tag/${familyType}`

const releaseDisplayCode = (code?: string | null, familyType?: string) => {
  if (!code) return m.data_no_release()

  const normalizedFamily = familyType?.toLowerCase()
  if (normalizedFamily) {
    return code.replace(
      new RegExp(
        `^(?:data|rs)-hk-${normalizedFamily.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-`,
      ),
      '',
    )
  }

  return code.replace(/^(?:data|rs)-hk-[a-z-]+-/, '')
}

const displayDate = (value?: string | null) => {
  if (!value) return m.data_unpublished()

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

const compactNumber = (value: number) =>
  new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
    notation: 'compact',
  }).format(value)

const releaseRecordCount = (release: (typeof data.releases)[number]) => {
  const primaryRowCount = release.rowCounts?.find(
    row => row.label === 'resourceType' || row.label === 'source',
  )?.rowCount

  if (typeof primaryRowCount === 'number') {
    return compactNumber(primaryRowCount)
  }

  const totalStat = release.stats?.find(
    row =>
      row.dimension === 'records' &&
      row.metric === 'count' &&
      row.metricUnit === 'count' &&
      !row.groupBy,
  )?.value

  return typeof totalStat === 'number' ? compactNumber(totalStat) : null
}

const handleReleaseTickerWheel = (event: WheelEvent) => {
  const container = event.currentTarget as HTMLElement
  const scrollDelta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY

  if (scrollDelta === 0) return

  const nextScrollLeft = container.scrollLeft + scrollDelta
  const maxScrollLeft = container.scrollWidth - container.clientWidth
  const canScroll =
    (scrollDelta < 0 && container.scrollLeft > 0) ||
    (scrollDelta > 0 && container.scrollLeft < maxScrollLeft)

  if (!canScroll) return

  event.preventDefault()
  container.scrollLeft = nextScrollLeft
}
</script>

<svelte:window onresize={handleViewportResize} />

<Main
  class="registry-page mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8 md:py-18"
>
  <section class="space-y-10">
    <div class="max-w-6xl space-y-4">
      <h1
        class="max-w-6xl font-display text-display-md leading-[0.98] font-bold text-primary md:text-[4.5rem]"
      >
        {m.data_title()}
      </h1>
      <p class="max-w-6xl font-body text-body-lg leading-8 text-foreground-alt">
        {m.data_description()}
      </p>
    </div>
  </section>

  <section id="apis" class="mt-16">
    <div
      class="flex flex-col gap-2 border-b border-outline-variant pb-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <h2 class="font-display text-headline-md font-bold text-primary">
        {m.data_apis()}
      </h2>
      <a
        class="font-body text-label-md font-semibold text-secondary"
        href={atlasDocsUrl}
      >
        {m.data_api_docs()}
      </a>
    </div>

    <div
      class="api-deck relative mt-6 grid gap-5 overflow-visible py-3 sm:grid-cols-2 xl:grid-cols-4"
      class:api-deck-expanded={activeApiIndex !== null}
      class:api-deck-active-1={activeApiIndex === 0}
      class:api-deck-active-2={activeApiIndex === 1}
      class:api-deck-active-3={activeApiIndex === 2}
      class:api-deck-active-4={activeApiIndex === 3}
      class:api-deck-dragging={apiSwipeState.isDragging}
      class:api-deck-throwing={apiSwipeState.isThrowing}
    >
      {#each apiDeckOrder as apiIndex, orderIndex (apiIndex)}
        {@const api = apiDirectoryItem(apiIndex)}
        <div
          class={`api-card api-card-${apiIndex + 1} api-stack-position-${orderIndex} ${
            activeApiIndex === apiIndex ? 'api-card-active' : ''
          } ${api.isPending ? 'api-card-pending' : ''} ${
            apiSwipeState.throwingApiIndex === apiIndex ? 'api-card-throwing-away' : ''
          }`}
          style={`--api-accent: ${api.theme.colorway.primary}; --api-secondary: ${api.theme.colorway.secondary}; --api-paper: ${api.theme.colorway.surface}; --api-ink: ${api.theme.colorway.ink}; --api-card-foreground: ${
            api.familyType === 'streets' ? api.theme.colorway.ink : '#fffaf0'
          }; --api-image-scale: ${
            api.familyType === 'streets' ? 1.25 : api.familyType === 'places' ? 1.05 : 1
          }; --swipe-x: ${
            orderIndex === 0 ? apiSwipeState.deltaX : 0
          }px; --swipe-y: ${
            orderIndex === 0 ? apiSwipeState.deltaY : 0
          }px; --swipe-rotate: ${
            orderIndex === 0 ? apiSwipeState.deltaX * 0.035 : 0
          }deg; --throw-direction: ${apiSwipeState.throwDirection};`}
        >
          <button
            class="api-card-activator"
            type="button"
            aria-label={api.theme.name}
            aria-pressed={activeApiIndex === apiIndex}
            onpointerdown={event => handleApiPointerDown(event, orderIndex)}
            onpointermove={handleApiPointerMove}
            onpointerup={handleApiPointerEnd}
            onpointercancel={handleApiPointerEnd}
            onclick={() => handleApiClick(apiIndex)}
          ></button>
          <span class="api-corner" aria-hidden="true"></span>
          <span class="api-card-art" aria-hidden="true">
            <img src={api.theme.image} alt="">
          </span>
          <span class="api-card-copy">
            <span class="flex flex-wrap items-start justify-between gap-3">
              <span
                class="block font-body text-caption font-semibold uppercase tracking-[0.16em] opacity-78"
              >
                {api.isPending ? m.data_planned_api() : m.data_public_api()}
              </span>
              {#if api.isPending}
                <span class="api-status-pill">{m.data_coming_soon()}</span>
              {/if}
            </span>
            <span
              class="mt-3 block font-display text-headline-lg-md font-bold leading-[1.02]"
            >
              {api.theme.name}
            </span>
            <span
              class="mt-5 flex flex-wrap items-center gap-2 font-body text-label-md"
            >
              <a
                class="api-link"
                href={`/apis/${api.familyType}`}
                onclick={event => event.stopPropagation()}
              >
                {m.data_releases()}
              </a>
              <a
                class="api-link"
                href={docsUrlForFamily(api.familyType)}
                target="_blank"
                rel="noreferrer"
                onclick={event => event.stopPropagation()}
              >
                {m.data_docs()}
                <Icon icon="proicons:arrow-up-right" class="size-4" />
              </a>
            </span>
            <span
              class={`api-card-details ${
                activeApiIndex === apiIndex ? 'api-card-details-visible' : ''
              }`}
            >
              <dl class="grid gap-2 font-body text-caption">
                <div class="flex items-baseline justify-between gap-4">
                  <dt class="font-semibold uppercase opacity-72">
                    {m.data_api_version()}
                  </dt>
                  <dd class="api-meta-value">v{api.version}</dd>
                </div>
                <div class="flex items-baseline justify-between gap-4">
                  <dt class="font-semibold uppercase opacity-72">
                    {m.data_latest_release()}
                  </dt>
                  <dd class="api-meta-value">
                    {releaseDisplayCode(api.latestRelease?.code, api.familyType)}
                  </dd>
                </div>
              </dl>
            </span>
          </span>
        </div>
      {/each}
    </div>
  </section>

  <section id="releases" class="mt-16">
    <div class="border-b border-outline-variant pb-4">
      <h2 class="font-display text-headline-md font-bold text-primary">
        {m.data_releases()}
      </h2>
    </div>

    <div
      class="release-ticker mt-6 overflow-x-auto pb-4"
      onwheel={handleReleaseTickerWheel}
    >
      <div class="flex min-w-max gap-4">
        {#each data.releases as release, index}
          {@const theme = getApiFamilyTheme(release.apiFamily)}
          {@const accent = theme?.colorway.primary ?? 'var(--secondary)'}
          {@const secondary = theme?.colorway.secondary ?? 'var(--accent)'}
          {@const ink = release.apiFamily === 'streets' ? '#111717' : '#fffaf0'}
          {@const records = releaseRecordCount(release)}
          <a
            class="release-ticker-card group relative grid w-80 shrink-0 overflow-hidden rounded-lg p-5 text-(--release-ink)"
            style={`--release-accent: ${accent}; --release-secondary: ${secondary}; --release-ink: ${ink}; --release-step: ${index}; --release-topo-image: url('${topoImage}'); --release-topo-x: ${(index % 4) * 25}%; --release-topo-y: ${(Math.floor(index / 4) % 4) * 25}%; --release-topo-scale-x: ${index % 2 === 0 ? 1 : -1}; --release-topo-scale-y: ${index % 3 === 0 ? -1 : 1}; background: var(--release-accent);`}
            href={`/apis/${release.apiFamily}/${release.code}`}
          >
            <span class="release-ticker-contours" aria-hidden="true"></span>
            <span class="relative flex items-start justify-between gap-4">
              <span>
                <span
                  class="block font-body text-caption font-semibold uppercase tracking-[0.16em] opacity-76"
                >
                  {displayDate(release.publishedAt ?? release.createdAt)}
                </span>
                <span
                  class="mt-3 block font-display text-[1.65rem] font-bold leading-none"
                >
                  {theme?.name ?? release.apiFamily}
                </span>
              </span>
              <span
                class="rounded border border-current/24 bg-white/12 px-2 py-1 font-body text-caption font-semibold backdrop-blur"
              >
                {release.status}
              </span>
            </span>
            <span
              class="relative mt-8 block font-mono text-[1.8rem] font-bold leading-[1.02]"
            >
              v{releaseDisplayCode(release.code, release.apiFamily)}
            </span>
            <span
              class="relative mt-5 grid grid-cols-[minmax(8.5rem,1.2fr)_minmax(0,0.8fr)] gap-3 font-body text-caption"
            >
              <span class="release-ticker-stat release-ticker-schema">
                <span class="opacity-68">{m.data_schema()}</span>
                <span class="mt-1 font-mono text-[0.95rem] font-bold leading-none">
                  {release.schemaVersion}
                </span>
              </span>
              <span class="release-ticker-stat">
                <span class="opacity-68">{m.data_records()}</span>
                <span class="mt-1 font-mono text-[0.95rem] font-bold leading-none">
                  {records ?? m.data_pending()}
                </span>
              </span>
            </span>
            <span
              class="relative mt-6 inline-flex items-center justify-self-end gap-1 font-body text-label-md font-semibold"
            >
              {m.data_view_release()}
              <Icon
                icon="proicons:arrow-right"
                class="size-4 transition group-hover:translate-x-1"
              />
            </span>
          </a>
        {/each}
      </div>
    </div>
  </section>
</Main>

<style>
:global(.registry-page) {
  background-image:
    linear-gradient(
      color-mix(in srgb, var(--background) 88%, transparent),
      color-mix(in srgb, var(--background) 88%, transparent)
    ),
    url("data:image/svg+xml,%3Csvg width='120' height='96' viewBox='0 0 120 96' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 18c24 0 36 10 60 10s36-10 60-10M0 42c24 0 36 10 60 10s36-10 60-10M0 66c24 0 36 10 60 10s36-10 60-10M0 90c24 0 36 10 60 10s36-10 60-10' fill='none' stroke='%238e9192' stroke-width='0.7' opacity='0.14'/%3E%3C/svg%3E");
  background-repeat: repeat;
}

.release-ticker {
  scrollbar-color: color-mix(in srgb, var(--secondary) 55%, transparent) transparent;
}

.release-ticker-card {
  min-height: 17.25rem;
  box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 0.14);
  isolation: isolate;
  transition: box-shadow 220ms ease;
}

.release-ticker-card::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  content: "";
  background:
    radial-gradient(
      circle at 45% 42%,
      color-mix(in srgb, var(--release-accent) 74%, #fff 26%) 0,
      transparent 52%
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--release-accent) 86%, #000 14%),
      color-mix(in srgb, var(--release-accent) 58%, var(--release-secondary) 42%)
    );
}

.release-ticker-card::after {
  position: absolute;
  right: -3rem;
  bottom: -4.5rem;
  z-index: 1;
  width: 12rem;
  height: 12rem;
  content: "";
  border: 1px solid currentColor;
  opacity: 0.18;
  transform: rotate(18deg);
}

.release-ticker-contours {
  position: absolute;
  inset: -10%;
  z-index: 1;
  opacity: 0.26;
  background-image: var(--release-topo-image);
  background-position: var(--release-topo-x) var(--release-topo-y);
  background-repeat: no-repeat;
  background-size: 70rem auto;
  filter: saturate(0.96) contrast(1.06);
  mix-blend-mode: screen;
  transform: scale(var(--release-topo-scale-x), var(--release-topo-scale-y));
  transition:
    opacity 220ms ease,
    background-size 420ms ease;
}

.release-ticker-card > :not(.release-ticker-contours) {
  position: relative;
  z-index: 2;
}

.release-ticker-card:hover,
.release-ticker-card:focus-visible {
  outline: none;
  box-shadow: 0 1.25rem 3rem rgb(0 0 0 / 0.2);
}

.release-ticker-card:hover .release-ticker-contours,
.release-ticker-card:focus-visible .release-ticker-contours {
  opacity: 0.34;
  background-size: 76rem auto;
}

.release-ticker-stat {
  display: grid;
  min-height: 4.5rem;
  align-content: center;
  border: 1px solid currentColor;
  background: rgb(255 255 255 / 0.1);
  padding: 0.75rem;
  backdrop-filter: blur(8px);
}

.release-ticker-schema {
  min-width: 8.5rem;
}

.api-deck {
  height: 35rem;
  isolation: isolate;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
  transition: height 500ms ease;
}

.api-deck::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  content: "";
  opacity: 0.05;
  background-image: radial-gradient(var(--secondary) 1px, transparent 1px);
  background-size: 1.2rem 1.2rem;
}

.api-deck-expanded {
  height: 45rem;
}

.api-card {
  position: absolute;
  z-index: 1;
  display: flex;
  top: 4rem;
  left: 0;
  width: min(18rem, 26vw);
  height: 28rem;
  cursor: pointer;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--api-card-foreground) 24%, transparent);
  border-radius: 1rem;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--api-accent) 88%, white),
    var(--api-accent)
  );
  color: var(--api-card-foreground);
  padding: 1.25rem;
  text-align: left;
  user-select: none;
  box-shadow: var(--shadow-mini);
  transition:
    top 500ms ease,
    left 500ms ease,
    width 500ms ease,
    transform 500ms ease,
    border-color 200ms ease,
    height 500ms ease,
    opacity 300ms ease,
    box-shadow 300ms ease;
}

.api-card:hover,
.api-card:focus-within {
  border-color: color-mix(in srgb, var(--api-card-foreground) 58%, transparent);
  outline: none;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--api-card-foreground) 18%, transparent),
    var(--shadow-mini);
}

.api-card-1 {
  left: calc(50% - 29.75rem);
  transform: translateY(0.2rem) rotate(-3deg);
}

.api-card-2 {
  left: calc(50% - 15.6rem);
  transform: translateY(1.35rem) rotate(1.6deg);
}

.api-card-3 {
  left: calc(50% - 1.4rem);
  transform: translateY(-0.35rem) rotate(-1.2deg);
}

.api-card-4 {
  left: calc(50% + 12.75rem);
  transform: translateY(0.85rem) rotate(3deg);
}

.api-card-1:hover,
.api-card-1:focus-within {
  transform: translateY(-0.1rem) rotate(-0.8deg);
}

.api-card-2:hover,
.api-card-2:focus-within {
  transform: translateY(1.05rem) rotate(0.7deg);
}

.api-card-3:hover,
.api-card-3:focus-within {
  transform: translateY(-0.65rem) rotate(-0.4deg);
}

.api-card-4:hover,
.api-card-4:focus-within {
  transform: translateY(0.55rem) rotate(1deg);
}

.api-deck-expanded .api-card {
  top: 33rem;
  width: min(16.25rem, 23vw);
  height: 10.25rem;
  justify-content: flex-start;
  padding: 1rem;
  opacity: 0.74;
}

.api-card-active,
.api-deck-expanded .api-card-active {
  position: absolute;
  top: 1rem;
  left: 50%;
  z-index: 5;
  width: min(26rem, 100%);
  height: 38rem;
  justify-content: flex-start;
  opacity: 1;
  box-shadow: 0 1.25rem 3rem rgb(0 0 0 / 0.2);
  transform: translateX(-50%) rotate(0deg);
  transform-origin: top center;
}

.api-deck-expanded .api-card-1:not(.api-card-active) {
  left: calc(50% - 28.8rem);
  transform: translateY(0.2rem) rotate(-3deg);
}

.api-deck-expanded .api-card-2:not(.api-card-active) {
  left: calc(50% - 15.6rem);
  transform: translateY(1.05rem) rotate(1.6deg);
}

.api-deck-expanded .api-card-3:not(.api-card-active) {
  left: calc(50% - 2.4rem);
  transform: translateY(-0.35rem) rotate(-1.2deg);
}

.api-deck-expanded .api-card-4:not(.api-card-active) {
  left: calc(50% + 10.8rem);
  transform: translateY(0.8rem) rotate(3deg);
}

.api-deck-active-1 .api-card-2:not(.api-card-active),
.api-deck-active-2 .api-card-1:not(.api-card-active),
.api-deck-active-3 .api-card-1:not(.api-card-active),
.api-deck-active-4 .api-card-1:not(.api-card-active) {
  left: calc(50% - 20.1rem);
  transform: translateY(0.2rem) rotate(-3deg);
}

.api-deck-active-1 .api-card-3:not(.api-card-active),
.api-deck-active-2 .api-card-3:not(.api-card-active),
.api-deck-active-3 .api-card-2:not(.api-card-active),
.api-deck-active-4 .api-card-2:not(.api-card-active) {
  left: calc(50% - 8rem);
  transform: translateY(1.05rem) rotate(1.6deg);
}

.api-deck-active-1 .api-card-4:not(.api-card-active),
.api-deck-active-2 .api-card-4:not(.api-card-active),
.api-deck-active-3 .api-card-4:not(.api-card-active),
.api-deck-active-4 .api-card-3:not(.api-card-active) {
  left: calc(50% + 4.1rem);
  transform: translateY(-0.35rem) rotate(-1.2deg);
}

.api-deck-expanded .api-card-active:hover,
.api-deck-expanded .api-card-active:focus-within {
  transform: translateX(-50%) rotate(0deg);
}

.api-corner {
  position: absolute;
  width: 1.1rem;
  height: 1.1rem;
  border-style: solid;
  border-width: 0;
  border-color: currentColor;
  opacity: 0.42;
}

.api-card-1 .api-corner {
  top: -0.45rem;
  left: -0.45rem;
  border-top-width: 1px;
  border-left-width: 1px;
}

.api-card-2 .api-corner,
.api-card-4 .api-corner {
  right: -0.45rem;
  bottom: -0.45rem;
  border-right-width: 1px;
  border-bottom-width: 1px;
}

.api-card-3 .api-corner {
  display: none;
}

.api-card-art {
  position: relative;
  display: block;
  flex-shrink: 0;
  width: 100%;
  aspect-ratio: 1;
  margin-bottom: 1rem;
  overflow: hidden;
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--api-card-foreground) 15%, transparent);
}

.api-card-art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  transform: scale(var(--api-image-scale));
  transform-origin: center;
}

.api-card-copy {
  position: relative;
  z-index: 2;
  display: block;
  pointer-events: none;
}

.api-card-activator {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  cursor: pointer;
  border: 0;
  background: transparent;
  padding: 0;
  touch-action: none;
}

.api-deck-expanded .api-card:not(.api-card-active) .api-card-art {
  display: none;
}

.api-card-active .api-card-art {
  margin-bottom: 0.9rem;
}

.api-link {
  display: inline-flex;
  pointer-events: auto;
  align-items: center;
  gap: 0.28rem;
  border: 1px solid color-mix(in srgb, var(--api-card-foreground) 34%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--api-card-foreground) 13%, transparent);
  padding: 0.38rem 0.7rem;
  color: inherit;
  font-weight: 700;
  text-decoration: none;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.api-link:hover,
.api-link:focus-visible {
  border-color: color-mix(in srgb, var(--api-card-foreground) 62%, transparent);
  background: color-mix(in srgb, var(--api-card-foreground) 22%, transparent);
  outline: none;
}

.api-status-pill {
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--api-card-foreground) 34%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--api-card-foreground) 15%, transparent);
  padding: 0.22rem 0.52rem;
  font-family: var(--font-body);
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
}

.api-card-details {
  display: block;
  max-height: 0;
  margin-top: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition:
    max-height 450ms ease,
    margin-top 450ms ease,
    opacity 240ms ease;
}

.api-card-active .api-card-details,
.api-card .api-card-details-visible {
  max-height: 8rem;
  margin-top: 1rem;
  opacity: 1;
  pointer-events: auto;
}

.api-meta-value {
  border: 1px solid color-mix(in srgb, var(--api-card-foreground) 28%, transparent);
  border-radius: 0.35rem;
  background: color-mix(in srgb, var(--api-card-foreground) 14%, transparent);
  padding: 0.15rem 0.45rem;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.76rem;
  font-weight: 800;
}

:global(.dark) .api-card {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--api-accent) 72%, black),
    color-mix(in srgb, var(--api-accent) 86%, black)
  );
}

@media (max-width: 900px) {
  .api-deck {
    height: 35rem;
    display: block;
    padding-top: 1.25rem;
    padding-bottom: 2rem;
  }

  .api-card,
  .api-card-1,
  .api-card-2,
  .api-card-3,
  .api-card-4 {
    position: absolute;
    top: 1.25rem;
    left: 50%;
    width: min(20rem, calc(100vw - 4rem));
    grid-column: auto;
    margin-left: 0;
    height: 31rem;
    padding: 1.25rem;
    justify-content: flex-start;
    touch-action: none;
    transform-origin: center;
  }

  .api-stack-position-0,
  .api-stack-position-0:hover,
  .api-stack-position-0:focus-visible,
  .api-deck-expanded .api-stack-position-0,
  .api-deck-expanded .api-stack-position-0:hover,
  .api-deck-expanded .api-stack-position-0:focus-visible,
  .api-deck-expanded .api-stack-position-0.api-card-active {
    z-index: 20;
    opacity: 1;
    transform: translateX(-50%) translate(var(--swipe-x), var(--swipe-y))
      rotate(var(--swipe-rotate));
  }

  .api-deck-dragging .api-stack-position-0 {
    transition:
      border-color 200ms ease,
      box-shadow 300ms ease;
  }

  .api-stack-position-1,
  .api-stack-position-1:hover,
  .api-stack-position-1:focus-visible,
  .api-deck-expanded .api-stack-position-1,
  .api-deck-expanded .api-stack-position-1:hover,
  .api-deck-expanded .api-stack-position-1:focus-visible,
  .api-deck-expanded .api-stack-position-1.api-card-active {
    z-index: 19;
    opacity: 1;
    transform: translateX(-50%) translate(0.65rem, 0.55rem) rotate(2.4deg);
  }

  .api-stack-position-2,
  .api-stack-position-2:hover,
  .api-stack-position-2:focus-visible,
  .api-deck-expanded .api-stack-position-2,
  .api-deck-expanded .api-stack-position-2:hover,
  .api-deck-expanded .api-stack-position-2:focus-visible,
  .api-deck-expanded .api-stack-position-2.api-card-active {
    z-index: 18;
    opacity: 1;
    transform: translateX(-50%) translate(1.25rem, 1.1rem) rotate(4.2deg);
  }

  .api-stack-position-3,
  .api-stack-position-3:hover,
  .api-stack-position-3:focus-visible,
  .api-deck-expanded .api-stack-position-3,
  .api-deck-expanded .api-stack-position-3:hover,
  .api-deck-expanded .api-stack-position-3:focus-visible,
  .api-deck-expanded .api-stack-position-3.api-card-active {
    z-index: 17;
    opacity: 1;
    transform: translateX(-50%) translate(1.8rem, 1.65rem) rotate(6deg);
  }

  .api-deck-throwing .api-stack-position-1,
  .api-deck-throwing .api-stack-position-1:hover,
  .api-deck-throwing .api-stack-position-1:focus-visible {
    z-index: 20;
    transform: translateX(-50%) translate(0, 0) rotate(0deg);
  }

  .api-deck-throwing .api-stack-position-2,
  .api-deck-throwing .api-stack-position-2:hover,
  .api-deck-throwing .api-stack-position-2:focus-visible {
    z-index: 19;
    transform: translateX(-50%) translate(0.65rem, 0.55rem) rotate(2.4deg);
  }

  .api-deck-throwing .api-stack-position-3,
  .api-deck-throwing .api-stack-position-3:hover,
  .api-deck-throwing .api-stack-position-3:focus-visible {
    z-index: 18;
    transform: translateX(-50%) translate(1.25rem, 1.1rem) rotate(4.2deg);
  }

  .api-deck-throwing .api-card-throwing-away,
  .api-deck-throwing .api-card-throwing-away:hover,
  .api-deck-throwing .api-card-throwing-away:focus-visible,
  .api-deck-expanded.api-deck-throwing .api-card-throwing-away {
    z-index: 17;
    opacity: 1;
    transform: translateX(-50%) translate(1.8rem, 1.65rem) rotate(6deg);
  }

  .api-card-active,
  .api-deck-expanded .api-card,
  .api-deck-expanded .api-card-active {
    top: 1.25rem;
    left: 50%;
    width: min(20rem, calc(100vw - 4rem));
    height: 31rem;
    justify-content: flex-start;
    padding: 1.25rem;
    box-shadow: var(--shadow-mini);
  }

  .api-card-art,
  .api-card-active .api-card-art,
  .api-deck-expanded .api-card:not(.api-card-active) .api-card-art {
    display: block;
    height: auto;
    aspect-ratio: 1;
    margin-bottom: 1rem;
  }

  .api-card-active .api-card-details,
  .api-card .api-card-details-visible {
    max-height: 8rem;
    margin-top: 1rem;
    opacity: 1;
  }
}
</style>
