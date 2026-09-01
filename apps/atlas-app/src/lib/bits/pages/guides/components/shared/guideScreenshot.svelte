<script lang="ts">
import { onMount } from 'svelte'

import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Dialog } from 'bits-ui'

import GuideParagraph from './guideParagraph.svelte'

type Props = {
  alt: string
  caption?: string
  class?: string
  src: string
  srcDark?: string
  width?: 'content' | 'short'
}

let {
  alt,
  caption,
  class: className = '',
  src,
  srcDark,
  width = 'short',
}: Props = $props()
let enlarged = $state(false)
let image: HTMLImageElement
let displayWidth = $state(0)
let darkModeEnabled = $state(false)
let displayedSrc = $derived(darkModeEnabled && srcDark ? srcDark : src)

onMount(() => {
  const updateTheme = () => {
    darkModeEnabled = document.documentElement.classList.contains('dark')
  }
  const observer = new MutationObserver(updateTheme)

  updateTheme()
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })

  return () => observer.disconnect()
})

const enlarge = () => {
  displayWidth = image.getBoundingClientRect().width
  enlarged = true
}
</script>

<figure
  class={`space-y-2 ${width === 'short' ? 'max-w-[48rem]' : 'max-w-[58rem]'} ${className}`}
>
  <button
    class="group relative block w-full overflow-hidden border border-border-card bg-[#7dd3fc]/10 p-2 text-left shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
    type="button"
    aria-label={`Enlarge screenshot: ${alt}`}
    title="Click to enlarge"
    style="cursor: zoom-in"
    onclick={enlarge}
  >
    <img
      bind:this={image}
      class="mx-auto max-h-144 max-w-full object-contain"
      src={displayedSrc}
      {alt}
      loading="lazy"
    >
  </button>
  {#if caption}
    <figcaption><GuideParagraph>{@html caption}</GuideParagraph></figcaption>
  {/if}
</figure>

<Dialog.Root bind:open={enlarged}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-80 bg-black/75 backdrop-blur-sm" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-90 max-h-[calc(100svh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto border border-border-card bg-surface-container-low p-3 shadow-popover focus:outline-none"
      style={`width: min(calc(100vw - 2rem), ${displayWidth * 2}px)`}
    >
      <Dialog.Title class="sr-only">{alt}</Dialog.Title>
      <Dialog.Description class="sr-only">{caption ?? alt}</Dialog.Description>
      <button
        class="absolute right-5 top-5 z-10 inline-flex size-9 items-center justify-center rounded-full bg-black/70 text-primary transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        type="button"
        aria-label="Close enlarged screenshot"
        onclick={() => (enlarged = false)}
      >
        <Icon icon="ion:close-outline" class="size-5" aria-hidden="true" />
      </button>
      <img
        class="max-h-[calc(100svh-3.5rem)] w-full object-contain"
        src={displayedSrc}
        {alt}
      >
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
