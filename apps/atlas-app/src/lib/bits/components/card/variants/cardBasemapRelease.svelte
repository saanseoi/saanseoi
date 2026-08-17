<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { onMount } from 'svelte'

import { m } from '#lib/bits/internal/i18n.js'
import type { BasemapRelease } from '#lib/registry/types.js'

type Props = {
  release: BasemapRelease
  displayDate: string
  displayCode: string
  size: string
  index: number
  isDragging?: boolean
}

let {
  release,
  displayDate,
  displayCode,
  size,
  index,
  isDragging = false,
}: Props = $props()
let postcardPreviewUrl = $derived(
  release.previewUrl.replace(/-(?:light|dark)\.webp$/, '-postcard-lit.webp'),
)
let isCurrent = $derived(release.displayStatus === 'current')
let isSuperseded = $derived(release.displayStatus === 'superseded')
let statusLabel = $derived(
  isCurrent
    ? m.api_release_current()
    : isSuperseded
      ? m.api_release_superseded()
      : release.displayStatus,
)
let displayRegionName = $derived(
  release.regionCode === 'hk'
    ? m.postcard_region_hk()
    : release.regionCode === 'mo'
      ? m.postcard_region_mo()
      : release.regionCode === 'gba'
        ? m.postcard_region_gba()
        : release.regionName,
)
let regionalAccent = $derived(
  release.regionCode === 'hk'
    ? '#c83d3d'
    : release.regionCode === 'mo'
      ? '#00856a'
      : '#287fa3',
)
let borderPattern = $derived(
  `repeating-linear-gradient(135deg, #fff9ed 0 14px, color-mix(in srgb, ${regionalAccent} 72%, #fff9ed) 14px 28px, #fff9ed 28px 42px)`,
)
let viewerUrl = $derived(
  `https://viewer.saanseoi.hk/?region=${release.regionCode}&version=${release.version}&theme=midnight`,
)
let isIntroVisible = $state(false)
let isIntroActive = $state(true)

onMount(() => {
  const frame = window.requestAnimationFrame(() => {
    isIntroVisible = true
  })
  const timeout = window.setTimeout(
    () => {
      isIntroActive = false
    },
    index * 70 + 360,
  )

  return () => {
    window.cancelAnimationFrame(frame)
    window.clearTimeout(timeout)
  }
})
</script>

<div
  class={`group relative grid min-h-69 w-80 shrink-0 isolate overflow-hidden rounded-[1.1rem] border-[0.35rem] border-transparent bg-(image:--basemap-border) p-5 text-[#213238] shadow-[0_0.45rem_1.25rem_rgb(32_45_48/0.16)] transition-[opacity,translate,box-shadow] duration-360 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none before:absolute before:inset-0 before:z-0 before:rounded-xl before:bg-[#fff9ed] before:shadow-[inset_0_0_0_1px_rgb(33_50_56/0.12)] before:content-[''] after:pointer-events-none after:absolute after:inset-2 after:z-1 after:rounded-[0.62rem] after:border after:border-[color-mix(in_srgb,var(--basemap-accent)_48%,transparent)] after:content-[''] hover:shadow-[0_0.7rem_1.6rem_rgb(32_45_48/0.2)] focus-within:shadow-[0_0.7rem_1.6rem_rgb(32_45_48/0.2)] ${isIntroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4.5'} ${isDragging ? 'shadow-[0_0.7rem_1.6rem_rgb(32_45_48/0.2)]' : ''}`}
  data-carousel-card={release.code}
  style={`--basemap-accent: ${regionalAccent}; --basemap-border: ${borderPattern}; transition-delay: ${isIntroActive ? index * 70 : 0}ms;`}
>
  <a
    class="absolute inset-0 z-2 focus-visible:outline-none"
    href={`/basemaps/releases/${release.regionCode}/${release.version}`}
    aria-label={`View ${displayRegionName} release`}
  ></a>
  <span
    class={`pointer-events-none absolute inset-0 z-0 rounded-xl bg-(image:--basemap-preview) bg-center bg-no-repeat bg-size-(--basemap-preview-size) opacity-[0.7] filter-[saturate(1)_contrast(.98)] transition-[opacity,background-size] duration-500 group-hover:bg-size-(--basemap-preview-hover-size) group-hover:opacity-[0.85] group-focus-within:bg-size-(--basemap-preview-hover-size) group-focus-within:opacity-[0.85] ${isDragging ? 'bg-size-(--basemap-preview-hover-size) opacity-[0.85]' : ''}`}
    style={`--basemap-preview: url('${postcardPreviewUrl}'); --basemap-preview-size: auto 100%; --basemap-preview-hover-size: auto 106%;`}
    aria-hidden="true"
  ></span>
  <div class="contents pointer-events-none">
    <span class="relative z-3 block"
      ><span
        ><span
          class="block font-body text-caption font-semibold uppercase tracking-[0.16em] opacity-78"
          >{displayDate}</span
        ><span class="mt-3 block font-display text-[1.65rem] font-bold leading-none"
          >{displayRegionName}</span
        ></span
      ><span
        class={`absolute top-0 right-0 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-[0.7rem] leading-none font-semibold shadow-[inset_0_1px_rgb(255_255_255/0.3)] ${isCurrent ? 'min-w-20 justify-center border-[#00856a] bg-[#00856a] text-[#effff6]' : isSuperseded ? 'border-[#213238]/18 bg-[#fff9ed]/56 text-[#213238]/68' : 'border-[#213238]/20 bg-[#fff9ed]/48 text-[#213238]/74'}`}
        >{#if isCurrent}
          <span class="size-1.5 rounded-full bg-[#b7f7d6]"></span>
        {/if}
        {statusLabel}</span
      ></span
    >
    <span
      class="relative z-3 mt-8 flex h-[3.7rem] translate-y-2 flex-col justify-center"
    >
      <span
        class="block font-body text-caption font-semibold uppercase tracking-[0.16em] opacity-72"
        >{m.data_basemaps()}</span
      >
      <span class="mt-0.5 block font-mono text-[1.65rem] font-bold leading-[1.02]"
        >v{displayCode}</span
      >
    </span>
    <span
      class="relative z-3 mt-5 grid grid-cols-[minmax(8.5rem,1.2fr)_minmax(0,0.8fr)] gap-3 font-body text-caption"
      ><span
        class="grid min-h-18 min-w-34 content-center border border-[color-mix(in_srgb,var(--basemap-accent)_34%,transparent)] bg-[#fff9ed]/42 p-3"
        ><span class="text-[#213238]/68">{m.data_schema()}</span
        ><span class="mt-1 font-mono text-[0.82rem] font-bold leading-tight"
          >{release.schemaVersion}</span
        ></span
      ><span
        class="grid min-h-18 content-center border border-[color-mix(in_srgb,var(--basemap-accent)_34%,transparent)] bg-[#fff9ed]/42 p-3"
        ><span class="text-[#213238]/68">{m.data_size()}</span
        ><span class="mt-1 font-mono text-[0.95rem] font-bold leading-none"
          >{size}</span
        ></span
      ></span
    >
  </div>
  <a
    class="relative z-4 mt-3 inline-flex items-center justify-self-end gap-1 font-body text-label-md font-semibold focus-visible:outline-none"
    href={viewerUrl}
    target="_blank"
    rel="noreferrer"
    >{m.postcard_preview_map()}
    <Icon
      icon="proicons:arrow-right"
      class={`size-4 transition-transform duration-220 group-hover:translate-x-1 group-focus-within:translate-x-1 ${isDragging ? 'translate-x-1' : ''}`}
    />
  </a>
</div>
