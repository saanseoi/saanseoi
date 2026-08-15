<script lang="ts">
import Icon from '@iconify/svelte'
import { getContext } from 'svelte'

import { m } from '#lib/bits/internal/i18n.js'

import {
  basemapPostcardFocusContext,
  type BasemapPostcardFocus,
  type BasemapPostcardInteraction,
} from './basemapPostcardTypes'

type PublicFormat = { name: string; href: string }

type Props = BasemapPostcardInteraction & {
  accent: string
  coverage: string
  flipAngle: number
  isDragging: boolean
  isLoading?: boolean
  isSelected: boolean
  openStreetMapUrl: string
  publicFormats: readonly PublicFormat[]
  regionalName: string
  releaseNotesUrl: string
  releaseVersion: string
  schemaVersion: string
  viewerUrl: string
}

let {
  accent,
  coverage,
  flipAngle,
  isDragging,
  isLoading = false,
  isSelected,
  onactivate,
  onpointercancel,
  onpointerdown,
  onpointermove,
  onpointerup,
  openStreetMapUrl,
  publicFormats,
  regionalName,
  releaseNotesUrl,
  releaseVersion,
  schemaVersion,
  viewerUrl,
}: Props = $props()

const focus = getContext<BasemapPostcardFocus>(basemapPostcardFocusContext)
const stopCardInteraction = (event: Event) => event.stopPropagation()
</script>

<section
  class={`absolute inset-0 overflow-hidden rounded-none bg-(image:--postcard-pattern) p-[0.65rem] text-[#213238] touch-none shadow-[0_0.8rem_2.2rem_rgb(0_0_0/0.15)] dark:bg-(image:--postcard-dark-pattern) ${isSelected ? isDragging ? 'pointer-events-auto cursor-grabbing backface-hidden max-[900px]:static' : 'pointer-events-auto cursor-grab backface-hidden max-[900px]:static' : 'pointer-events-none invisible'}`}
  style={`transform: rotateY(${flipAngle}deg);`}
  aria-hidden={!isSelected}
>
  <button
    class="absolute inset-0 size-full rounded-none focus:outline-none focus-visible:outline-none"
    type="button"
    bind:this={focus.returnButton}
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

      <p class="mt-4 max-w-148 font-body text-label-md leading-snug text-[#213238]/76">
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
          <dd class="relative mt-0.5 font-bold" aria-busy={isLoading}>
            <a
              class={`pointer-events-auto underline decoration-[#213238]/25 underline-offset-3 transition-opacity duration-300 hover:decoration-[#213238]/60 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
              href={releaseNotesUrl}
              onclick={stopCardInteraction}
              onpointerdown={stopCardInteraction}
              >{releaseVersion}</a
            >
            <span
              class={`absolute top-0 left-0 h-4 w-24 rounded-full bg-[#213238]/16 transition-[filter,opacity] duration-300 ${isLoading ? 'motion-safe:animate-pulse opacity-100 blur-[2px]' : 'pointer-events-none opacity-0'}`}
              aria-hidden="true"
            ></span>
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
