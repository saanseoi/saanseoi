<script lang="ts">
import type { Snippet } from 'svelte'
import type { Action } from 'svelte/action'
import { fade } from 'svelte/transition'

type Props = {
  children?: Snippet
  hasContent: boolean
  loading?: boolean
  mobileSideNav?: Snippet
  panel?: HTMLElement
  scrollAction: Action<HTMLElement>
  showNestedPanel: boolean
  sideNav?: Snippet
  navBar?: Snippet
}

let {
  children,
  hasContent,
  loading = false,
  mobileSideNav,
  panel = $bindable<HTMLElement>(),
  scrollAction,
  showNestedPanel,
  sideNav,
  navBar,
}: Props = $props()

let showLoadingIndicator = $state(false)

$effect(() => {
  if (!loading) {
    showLoadingIndicator = false
    return
  }

  const delay = window.setTimeout(() => (showLoadingIndicator = true), 300)

  return () => window.clearTimeout(delay)
})
</script>

<div use:scrollAction class="mt-6">
  {@render navBar?.()}
  <div class="grid gap-8 xl:grid-cols-[1fr_18rem]">
    <div class="min-w-0">
      <div
        data-release-nav-mobile-toc
        class="sticky top-10 z-30 -mx-6 w-[calc(100%+3rem)] xl:top-[112px] xl:hidden"
      >
        {@render mobileSideNav?.()}
      </div>
      <div
        data-release-nav-content-panel
        bind:this={panel}
        class={`relative mt-4 scroll-mt-24 xl:mt-2 xl:scroll-mt-[120px] ${hasContent && showNestedPanel ? 'xl:h-[calc(100svh-144px)] xl:min-h-[calc(100svh-144px)] xl:max-h-[calc(100svh-144px)] xl:overflow-hidden xl:rounded-lg xl:border xl:border-outline-variant/60 xl:bg-surface-container-lowest xl:dark:border-outline-variant' : ''}`}
      >
        {#if showLoadingIndicator}
          <div
            in:fade={{ duration: 200 }}
            class="absolute top-4 right-4 z-10 rounded-full bg-surface-container-lowest/90 p-2 text-secondary shadow-sm backdrop-blur-sm"
            role="status"
            aria-label="Loading selected version"
          >
            <span
              class="block size-5 rounded-full border-2 border-secondary/30 border-t-secondary motion-safe:animate-spin"
              aria-hidden="true"
            ></span>
          </div>
        {/if}
        {@render children?.()}
      </div>
    </div>
    <div
      class="hidden h-[calc(100svh-136px)] xl:sticky xl:top-[112px] xl:block xl:self-start"
    >
      {@render sideNav?.()}
    </div>
  </div>
</div>
