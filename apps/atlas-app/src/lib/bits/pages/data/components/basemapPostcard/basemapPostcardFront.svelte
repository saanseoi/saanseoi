<script lang="ts">
import Icon from '@iconify/svelte'
import { getContext } from 'svelte'

import * as CardDeck from '$lib/bits/components/cardDeck'
import { m } from '$lib/bits/internal/i18n'

import {
  basemapPostcardFocusContext,
  type BasemapPostcardFocus,
  type BasemapPostcardInteraction,
} from './basemapPostcardTypes'

type Props = BasemapPostcardInteraction & {
  accent: string
  code: 'gba' | 'hk' | 'mo'
  isChineseLocale: boolean
  isDragging: boolean
  isSelected: boolean
  previewUrl: string
  regionalName: string
  stampDestination: string
}

let {
  accent,
  code,
  isChineseLocale,
  isDragging,
  isSelected,
  onactivate,
  onpointercancel,
  onpointerdown,
  onpointermove,
  onpointerup,
  previewUrl,
  regionalName,
  stampDestination,
}: Props = $props()

const focus = getContext<BasemapPostcardFocus>(basemapPostcardFocusContext)
let isPreviewLoaded = $state(false)
</script>

<button
  class={`absolute inset-0 block size-full rounded-none text-left touch-none transition-transform duration-300 ease-out hover:-translate-y-1 focus:outline-none focus-visible:-translate-y-1 focus-visible:outline-none ${isSelected ? 'pointer-events-none backface-hidden' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
  type="button"
  bind:this={focus.frontButton}
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
        src={previewUrl}
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
