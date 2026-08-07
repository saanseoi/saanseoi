<script lang="ts">
import Icon from '@iconify/svelte'
import { onMount } from 'svelte'

import * as CardDeck from '$lib/bits/components/cardDeck'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'

type Props = {
  code: 'gba' | 'hk' | 'mo'
  name: string
  tileset: string
  version: string
  isSelected: boolean
  isShrunk: boolean
  shrunkIndex: number | null
  isDragging: boolean
  isThrowing: boolean
  throwPhase: 'launch' | 'flight' | 'settle' | null
  dragX: number
  dragY: number
  flipDirection: 1 | -1
  layoutClass: string
  intro: { delay?: number; duration?: number; y?: number }
  onactivate: () => void
  onpointerdown: (event: PointerEvent) => void
  onpointermove: (event: PointerEvent) => void
  onpointerup: (event: PointerEvent) => void
  onpointercancel: (event: PointerEvent) => void
}

let {
  code,
  tileset,
  version,
  isSelected,
  isShrunk,
  shrunkIndex,
  isDragging,
  isThrowing,
  throwPhase,
  dragX,
  dragY,
  flipDirection,
  layoutClass,
  intro,
  onactivate,
  onpointerdown,
  onpointermove,
  onpointerup,
  onpointercancel,
}: Props = $props()
const tileOrigin = 'https://tiles.saanseoi.hk'
const accentByRegion = {
  hk: '#C83D3D',
  mo: '#00856A',
  gba: '#287FA3',
} as const
const patternByRegion = {
  hk: 'repeating-linear-gradient(135deg, #f8f3e6 0 9px, #C83D3D 9px 18px, #f8f3e6 18px 27px)',
  mo: 'repeating-linear-gradient(135deg, #f3f5ea 0 11px, #00856A 11px 20px, #f3f5ea 20px 32px)',
  gba: 'repeating-linear-gradient(135deg, #eef6f5 0 15px, #287FA3 15px 25px, #eef6f5 25px 40px)',
} as const
const darkPatternByRegion = {
  hk: 'repeating-linear-gradient(135deg, #f8f3e6 0 9px, #C83D3D 9px 18px, #f8f3e6 18px 27px)',
  mo: 'repeating-linear-gradient(135deg, #f8f3e6 0 11px, #00856A 11px 20px, #f8f3e6 20px 32px)',
  gba: 'repeating-linear-gradient(135deg, #f8f3e6 0 15px, #287FA3 15px 25px, #f8f3e6 25px 40px)',
} as const
const tiltByRegion = {
  // The Greater Bay Area is the centred, foremost card; the outer postcards
  // fan away from it like a casually placed travel stack.
  hk: -6.8,
  gba: 1.2,
  mo: -4.8,
} as const
const offsetXByRegion = {
  hk: 14,
  gba: 0,
  mo: -8,
} as const
const offsetYByRegion = {
  hk: 24,
  gba: -10,
  mo: 8,
} as const
const stackOrderByRegion = {
  hk: 3,
  gba: 2,
  mo: 1,
} as const
const coverageByRegion = {
  hk: () => m.postcard_coverage_hk(),
  mo: () => m.postcard_coverage_mo(),
  gba: () => m.postcard_coverage_gba(),
} as const
const openStreetMapBoundsByRegion = {
  gba: [112.4, 21.6, 115.2, 23.5],
  hk: [113.82, 22.14, 114.48, 22.58],
  mo: [113.48, 22.1, 113.62, 22.25],
} as const
let locale = $derived(getCurrentLocale())
let isChineseLocale = $derived(locale.startsWith('zh'))
let isPreviewLoaded = $state(false)
let isIntroVisible = $state(false)
let isIntroActive = $state(true)
let frontButton = $state<HTMLButtonElement>()
let returnButton = $state<HTMLButtonElement>()
const accent = $derived(accentByRegion[code])
const regionalName = $derived(
  code === 'hk'
    ? m.postcard_region_hk()
    : code === 'mo'
      ? m.postcard_region_mo()
      : m.postcard_region_gba(),
)
const stampDestination = $derived(code === 'gba' ? 'CN' : code.toUpperCase())
const pattern = $derived(patternByRegion[code])
const darkPattern = $derived(darkPatternByRegion[code])
const tilt = $derived(tiltByRegion[code])
const offsetX = $derived(offsetXByRegion[code])
const offsetY = $derived(offsetYByRegion[code])
const shrunkTilt = $derived(shrunkIndex === 0 ? -7.5 : 6.5)
const stackOrder = $derived(stackOrderByRegion[code])
const coverage = $derived(coverageByRegion[code]())
const openStreetMapUrl = $derived(
  `https://www.openstreetmap.org/?bbox=${openStreetMapBoundsByRegion[code].join(',')}`,
)
const displayOrder = $derived(
  isDragging || isSelected ? 30 : isShrunk ? (shrunkIndex === 0 ? 1 : 2) : stackOrder,
)
// Build momentum from the actual flick, but give even a short flick enough
// travel to feel like it has been pulled into the open position.
const throwDistance = $derived(
  Math.min(Math.max(Math.abs(dragX) * 0.82 + 98, 136), 250),
)
const throwLift = $derived(
  Math.min(Math.max(78 + Math.abs(dragX) * 0.22 + Math.max(-dragY, 0) * 0.3, 78), 154),
)
const throwRotation = $derived(Math.min(12 + Math.abs(dragX) * 0.042, 21))
const postcardTransform = $derived(
  isDragging
    ? isSelected
      ? `translate(${dragX}px, ${dragY}px) rotate(${dragX * 0.025}deg) scale(1)`
      : isShrunk
        ? `translate(${dragX}px, ${dragY}px) rotate(${shrunkTilt + dragX * 0.04}deg) scale(0.86)`
        : `translate(${offsetX + dragX}px, ${offsetY + dragY}px) rotate(${tilt + dragX * 0.035}deg) scale(1.18)`
    : isSelected
      ? isThrowing
        ? throwPhase === 'launch'
          ? `translate(${flipDirection * throwDistance}px, -${throwLift}px) rotate(${flipDirection * throwRotation}deg) scale(1.105)`
          : throwPhase === 'flight'
            ? `translate(0, -0.7rem) rotate(${-flipDirection * 2.5}deg) scale(1.035)`
            : 'rotate(0deg) scale(1)'
        : 'rotate(0deg) scale(1)'
      : isShrunk
        ? `translate(0, 0) rotate(${shrunkTilt}deg) scale(0.86)`
        : `translate(${offsetX}px, ${offsetY}px) rotate(${tilt}deg) scale(1.18)`,
)
const flipAngle = $derived(flipDirection * 180)
const flipTransform = $derived(
  isSelected
    ? `rotateY(${flipAngle * (throwPhase === 'launch' ? 0.48 : 1)}deg)`
    : 'none',
)
// The throw trajectory supplies the directional motion. Keeping the 3D pivot
// centred means the reverse face lands exactly where the front face was.
const flipOrigin = 'center center'
const schemaVersion = 'protomaps-v4.0'
const releaseVersion = $derived(
  version === 'latest' ? m.postcard_latest() : `${version}.0`,
)
const viewerUrl = $derived(
  `https://viewer.saanseoi.hk/?region=${code}&version=${version}&theme=midnight&locale=${locale}`,
)
const releaseNotesUrl = $derived(`/basemaps/releases/${code}/${version}`)
const publicFormats = [
  {
    name: 'PMTiles',
    href: 'https://docs.protomaps.com/pmtiles/',
  },
  {
    name: 'TileJSON',
    href: 'https://github.com/mapbox/tilejson-spec/tree/master/3.0.0',
  },
  {
    name: 'MVT',
    href: 'https://github.com/mapbox/vector-tile-spec/tree/master/2.1',
  },
  {
    name: 'GeoJSON',
    href: 'https://datatracker.ietf.org/doc/html/rfc7946',
  },
] as const
const stopCardInteraction = (event: Event) => event.stopPropagation()

$effect(() => {
  if (!isSelected && document.activeElement === returnButton) {
    frontButton?.focus()
  }
})

onMount(() => {
  const frame = window.requestAnimationFrame(() => {
    isIntroVisible = true
  })
  const timeout = window.setTimeout(
    () => {
      isIntroActive = false
    },
    (intro.delay ?? 0) + (intro.duration ?? 360),
  )

  return () => {
    window.cancelAnimationFrame(frame)
    window.clearTimeout(timeout)
  }
})
</script>

<CardDeck.Card
  as="article"
  class={`group block select-none transform-(--postcard-transform) transition-[top,left,width,transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${isDragging || isThrowing || isSelected ? 'will-change-transform' : ''} ${throwPhase === 'launch' ? 'duration-520! ease-[cubic-bezier(0.18,0.72,0.32,1)]!' : throwPhase === 'flight' ? 'duration-640! ease-[cubic-bezier(0.14,0.9,0.25,1.08)]!' : throwPhase === 'settle' ? 'duration-460! ease-[cubic-bezier(0.16,1.32,0.32,1)]!' : ''} ${isSelected ? 'min-[901px]:transform-[translateX(-50%)_var(--postcard-transform)]' : ''} ${layoutClass}`}
  style={`--postcard-accent: ${accent}; --postcard-pattern: ${pattern}; --postcard-dark-pattern: ${darkPattern}; --postcard-transform: ${postcardTransform}; z-index: ${displayOrder};`}
>
  <div
    class={`relative aspect-3/2 transition-[opacity,translate] duration-360 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none ${isIntroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4.5'} ${isSelected ? 'perspective-distant max-[900px]:aspect-auto' : ''}`}
    style={isIntroActive ? `transition-delay: ${intro.delay ?? 0}ms;` : undefined}
  >
    <div
      class={`relative size-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${isSelected ? 'transform-3d max-[900px]:h-auto' : ''} ${throwPhase === 'launch' ? 'duration-520! ease-[cubic-bezier(0.18,0.72,0.32,1)]!' : throwPhase === 'flight' ? 'duration-640! ease-[cubic-bezier(0.14,0.9,0.25,1.08)]!' : throwPhase === 'settle' ? 'duration-460! ease-[cubic-bezier(0.16,1.32,0.32,1)]!' : ''}`}
      style={`transform: ${flipTransform}; transform-origin: ${flipOrigin};`}
    >
      <button
        class={`absolute inset-0 block size-full rounded-none text-left touch-none transition-transform duration-300 ease-out hover:-translate-y-1 focus:outline-none focus-visible:-translate-y-1 focus-visible:outline-none ${isSelected ? 'pointer-events-none backface-hidden' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        type="button"
        bind:this={frontButton}
        aria-label={m.postcard_show_details().replace('{name}', regionalName)}
        aria-pressed={isSelected}
        aria-hidden={isSelected}
        tabindex={isSelected ? -1 : 0}
        onclick={onactivate}
        {onpointerdown}
        {onpointermove}
        {onpointerup}
        {onpointercancel}
      >
        <span
          class="relative block size-full overflow-hidden rounded-none bg-(image:--postcard-pattern) p-[0.65rem] shadow-[0_0.8rem_2.2rem_rgb(0_0_0/0.15)] dark:bg-(image:--postcard-dark-pattern)"
        >
          <CardDeck.Visual
            class="relative block size-full overflow-hidden rounded-none bg-[#e8f0ee]"
          >
            <img
              class={`absolute inset-0 block size-full object-cover transition-[filter,opacity] duration-450 ease-out group-hover:brightness-103 group-hover:saturate-105 group-focus-within:brightness-103 group-focus-within:saturate-105 ${isPreviewLoaded ? 'delay-50 opacity-100' : 'opacity-0'}`}
              src={`${tileOrigin}/render/${code}/${tileset}-latest-postcard.webp`}
              alt=""
              draggable="false"
              onload={() => (isPreviewLoaded = true)}
            >
            <span
              class="pointer-events-none absolute top-4 right-4 grid size-12 place-items-center rounded-full bg-[#f8f3e6]/92 font-mono text-[0.55rem] leading-none font-bold tracking-[0.08em] shadow-sm"
              style={`color: ${accent};`}
              aria-hidden="true"
            >
              <span
                class="absolute inset-0 rounded-full border border-dashed border-current transition-transform duration-500 ease-out group-hover:rotate-28 group-focus-within:rotate-28"
              ></span>
              <span class="relative text-center">
                <span class="block">{m.postcard_air()}</span>
                <span class="block">{stampDestination}</span>
              </span>
            </span>
            <span
              class={`absolute right-3 bottom-3 left-3 flex items-end gap-3 ${code === 'mo' ? 'justify-end' : 'justify-between'}`}
            >
              <span
                class="max-w-[76%] rounded-[0.2rem] border border-black/10 bg-[#fff9ed]/92 px-3 py-2 text-[#213238] shadow-[0_0.3rem_0.9rem_rgb(32_45_48/0.14)]"
              >
                <span
                  class="block font-mono text-[0.52rem] leading-none font-bold tracking-[0.14em] uppercase opacity-62"
                  >{m.postcard_basemap()}</span
                >
                <span
                  class={`${isChineseLocale ? 'mt-0.5' : 'mt-1'} block font-[Caveat] text-[clamp(1.35rem,2.7vw,1.9rem)] leading-[0.82] font-bold tracking-[-0.02em]`}
                  style={`color: ${accent};`}
                  >{regionalName}</span
                >
              </span>
              <Icon
                icon="proicons:arrow-up-right"
                class="mb-1 size-7 shrink-0 rounded-full bg-[#fff9ed]/92 p-1.5 text-[#213238] shadow-[0_0.2rem_0.6rem_rgb(32_45_48/0.16)]"
              />
            </span>
          </CardDeck.Visual>
        </span>
      </button>

      <section
        class={`absolute inset-0 overflow-hidden rounded-none bg-(image:--postcard-pattern) p-[0.65rem] text-[#213238] touch-none shadow-[0_0.8rem_2.2rem_rgb(0_0_0/0.15)] dark:bg-(image:--postcard-dark-pattern) ${isSelected ? isDragging ? 'pointer-events-auto cursor-grabbing backface-hidden max-[900px]:static' : 'pointer-events-auto cursor-grab backface-hidden max-[900px]:static' : 'pointer-events-none invisible'}`}
        style={`transform: rotateY(${flipAngle}deg);`}
        aria-hidden={!isSelected}
      >
        <button
          class="absolute inset-0 size-full rounded-none focus:outline-none focus-visible:outline-none"
          type="button"
          bind:this={returnButton}
          aria-label={m.postcard_return_to_stack()}
          tabindex={isSelected ? 0 : -1}
          onclick={onactivate}
          {onpointerdown}
          {onpointermove}
          {onpointerup}
          {onpointercancel}
        ></button>
        <div
          class="pointer-events-none relative z-1 flex size-full flex-col rounded-none border border-[#213238]/15 bg-[#fff9ed] p-5"
        >
          <div
            class={`flex size-full flex-col transition-opacity duration-200 ${isSelected ? 'delay-200 opacity-100' : 'opacity-0'}`}
          >
            <span class="flex items-start justify-between gap-4">
              <span>
                <span
                  class="block font-mono text-[0.58rem] leading-none font-bold tracking-[0.16em] uppercase opacity-62"
                  >{m.postcard_basemap()}</span
                >
                <span
                  class="mt-2 block font-[Caveat] text-[clamp(2.15rem,5vw,3.3rem)] leading-[0.82] font-bold tracking-[-0.02em]"
                  style={`color: ${accent};`}
                  >{regionalName}</span
                >
              </span>
              <span
                class="grid size-13 shrink-0 rotate-[7deg] place-items-center rounded-full border border-dashed border-current font-mono text-[0.58rem] leading-none font-bold tracking-[0.08em]"
                style={`color: ${accent};`}
                aria-hidden="true"
                >{m.postcard_latest()}</span
              >
            </span>

            <p
              class="mt-4 max-w-148 font-body text-label-md leading-snug text-[#213238]/76"
            >
              {m.postcard_description_before_protomaps()}
              <a
                class="pointer-events-auto font-semibold text-[#213238] underline decoration-[#213238]/30 underline-offset-3"
                href="https://docs.protomaps.com/basemaps/layers"
                target="_blank"
                rel="noreferrer"
                onclick={stopCardInteraction}
                onpointerdown={stopCardInteraction}
                >Protomaps Basemap Layers</a
              >
              {m.postcard_description_after_protomaps()}
              <a
                class="pointer-events-auto font-semibold text-[#213238] underline decoration-[#213238]/30 underline-offset-3"
                href={openStreetMapUrl}
                target="_blank"
                rel="noreferrer"
                onclick={stopCardInteraction}
                onpointerdown={stopCardInteraction}
                >OpenStreetMap</a
              >
              {m.postcard_description_after_openstreetmap()}
            </p>

            <dl class="mt-5 grid grid-cols-2 gap-2 font-body text-caption">
              <div
                class="rounded-[0.3rem] border border-[#213238]/12 bg-[#213238]/[0.035] px-3 py-2"
              >
                <dt class="font-semibold uppercase tracking-[0.08em] opacity-55">
                  {m.postcard_coverage()}
                </dt>
                <dd class="mt-0.5 font-bold">
                  <a
                    class="pointer-events-auto underline decoration-[#213238]/25 underline-offset-3 hover:decoration-[#213238]/60"
                    href={viewerUrl}
                    target="_blank"
                    rel="noreferrer"
                    onclick={stopCardInteraction}
                    onpointerdown={stopCardInteraction}
                    >{coverage}</a
                  >
                </dd>
              </div>
              <div
                class="rounded-[0.3rem] border border-[#213238]/12 bg-[#213238]/[0.035] px-3 py-2"
              >
                <dt class="font-semibold uppercase tracking-[0.08em] opacity-55">
                  {m.postcard_format()}
                </dt>
                <dd class="mt-0.5 font-bold">
                  {#each publicFormats as format, index}
                    {#if index > 0}
                      <span aria-hidden="true"> · </span>
                    {/if}
                    <a
                      class="pointer-events-auto underline decoration-[#213238]/25 underline-offset-3 hover:decoration-[#213238]/60"
                      href={format.href}
                      target="_blank"
                      rel="noreferrer"
                      onclick={stopCardInteraction}
                      onpointerdown={stopCardInteraction}
                      >{format.name}</a
                    >
                  {/each}
                </dd>
              </div>
              <div
                class="rounded-[0.3rem] border border-[#213238]/12 bg-[#213238]/[0.035] px-3 py-2"
              >
                <dt class="font-semibold uppercase tracking-[0.08em] opacity-55">
                  {m.postcard_schema()}
                </dt>
                <dd class="mt-0.5 font-bold">
                  <a
                    class="pointer-events-auto underline decoration-[#213238]/25 underline-offset-3 hover:decoration-[#213238]/60"
                    href={`${releaseNotesUrl}#schema`}
                    onclick={stopCardInteraction}
                    onpointerdown={stopCardInteraction}
                    >{schemaVersion}</a
                  >
                </dd>
              </div>
              <div
                class="rounded-[0.3rem] border border-[#213238]/12 bg-[#213238]/[0.035] px-3 py-2"
              >
                <dt class="font-semibold uppercase tracking-[0.08em] opacity-55">
                  {m.postcard_version()}
                </dt>
                <dd class="mt-0.5 font-bold">
                  <a
                    class="pointer-events-auto underline decoration-[#213238]/25 underline-offset-3 hover:decoration-[#213238]/60"
                    href={releaseNotesUrl}
                    onclick={stopCardInteraction}
                    onpointerdown={stopCardInteraction}
                    >{releaseVersion}</a
                  >
                </dd>
              </div>
            </dl>

            <span class="mt-5 flex flex-wrap items-center justify-end gap-3">
              <a
                class="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[#213238]/22 px-4 py-2 font-body text-label-md font-bold text-[#213238] no-underline transition-colors hover:bg-[#213238]/7 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--postcard-accent)"
                href={releaseNotesUrl}
                tabindex={isSelected ? 0 : -1}
                onclick={stopCardInteraction}
                onpointerdown={stopCardInteraction}
                >{m.postcard_releases()}</a
              >
              <a
                class="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#213238] px-4 py-2 font-body text-label-md font-bold text-[#fff9ed] no-underline transition-colors hover:bg-[#2e464d] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--postcard-accent)"
                href={viewerUrl}
                target="_blank"
                rel="noreferrer"
                tabindex={isSelected ? 0 : -1}
                onclick={stopCardInteraction}
                onpointerdown={stopCardInteraction}
                >{m.postcard_preview_map()}
                <Icon icon="proicons:arrow-up-right" class="size-4" /></a
              >
            </span>
          </div>
        </div>
      </section>
    </div>
  </div>
</CardDeck.Card>
