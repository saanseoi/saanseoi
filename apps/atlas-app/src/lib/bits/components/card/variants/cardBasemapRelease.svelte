<script lang="ts">
import Icon from '@iconify/svelte'
import { fade } from 'svelte/transition'

import type { BasemapRelease } from '$lib/registry/types'

type Props = {
  release: BasemapRelease
  displayDate: string
  displayCode: string
  size: string
  isDragging?: boolean
}

let { release, displayDate, displayCode, size, isDragging = false }: Props = $props()
</script>

<a
  in:fade={{ duration: 220 }}
  class={`group relative grid min-h-69 w-80 shrink-0 isolate overflow-hidden rounded-lg bg-[#07151d] p-5 text-[#f5fbfc] shadow-[0_1rem_2.5rem_rgb(0_0_0/0.18)] transition-shadow duration-220 before:absolute before:inset-0 before:z-1 before:bg-[linear-gradient(180deg,rgb(2_6_23/0.12),rgb(2_6_23/0.58)_52%,rgb(2_6_23/0.94))] before:content-[''] after:absolute after:inset-0 after:z-1 after:bg-[radial-gradient(circle_at_74%_18%,rgb(107_234_245/0.24),transparent_38%)] after:content-[''] hover:shadow-[0_1.25rem_3rem_rgb(0_0_0/0.28)] focus-visible:outline-none focus-visible:shadow-[0_1.25rem_3rem_rgb(0_0_0/0.28)] ${isDragging ? 'shadow-[0_1.25rem_3rem_rgb(0_0_0/0.28)]' : ''}`}
  data-carousel-card={release.code}
  href={release.viewerUrl}
  target="_blank"
  rel="noreferrer"
>
  <img
    class={`absolute inset-0 z-0 size-full object-cover opacity-82 filter-[saturate(.58)_contrast(1.2)_hue-rotate(-7deg)] transition-[transform,filter,opacity] duration-500 group-hover:scale-[1.035] group-hover:opacity-92 group-hover:filter-[saturate(.76)_contrast(1.14)_hue-rotate(-3deg)] ${isDragging ? 'scale-[1.035] opacity-92' : ''}`}
    src={release.previewUrl}
    alt=""
    draggable="false"
  >
  <span class="relative z-2 flex items-start justify-between gap-4"
    ><span
      ><span
        class="block font-body text-caption font-semibold uppercase tracking-[0.16em] opacity-78"
        >{displayDate}</span
      ><span class="mt-3 block font-display text-[1.65rem] font-bold leading-none"
        >{release.regionName}</span
      ></span
    ><span
      class={`rounded border px-2 py-1 font-body text-caption font-semibold backdrop-blur ${release.displayStatus === 'current' ? 'border-2 border-[#5fe39a] bg-[#0e3d2a]/72 text-[#f0fff7]' : 'border-white/28 bg-black/24'}`}
      >{#if release.displayStatus === 'current'}
        <span
          class="mr-1.5 inline-block size-1.5 rounded-full bg-[#a7f3d0] align-middle"
        ></span>
      {/if}
      {release.displayStatus}</span
    ></span
  >
  <span class="relative z-2 mt-8 block">
    <span
      class="block font-body text-caption font-semibold uppercase tracking-[0.16em] opacity-72"
      >Basemaps</span
    >
    <span class="mt-2 block font-mono text-[1.65rem] font-bold leading-[1.02]"
      >v{displayCode}</span
    >
  </span>
  <span
    class="relative z-2 mt-5 grid grid-cols-[minmax(8.5rem,1.2fr)_minmax(0,0.8fr)] gap-3 font-body text-caption"
    ><span
      class="grid min-h-18 min-w-34 content-center border border-white/42 bg-black/22 p-3 backdrop-blur"
      ><span class="opacity-72">Protomaps schema</span
      ><span class="mt-1 font-mono text-[0.82rem] font-bold leading-tight"
        >{release.schemaVersion}</span
      ></span
    ><span
      class="grid min-h-18 content-center border border-white/42 bg-black/22 p-3 backdrop-blur"
      ><span class="opacity-72">Size</span
      ><span class="mt-1 font-mono text-[0.95rem] font-bold leading-none"
        >{size}</span
      ></span
    ></span
  >
  <span
    class="relative z-2 mt-6 inline-flex items-center justify-self-end gap-1 font-body text-label-md font-semibold"
    >Preview map
    <Icon
      icon="proicons:arrow-up-right"
      class={`size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${isDragging ? 'translate-x-0.5 -translate-y-0.5' : ''}`}
    /></span
  >
</a>
