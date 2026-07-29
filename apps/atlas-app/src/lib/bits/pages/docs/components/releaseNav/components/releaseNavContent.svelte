<script lang="ts">
import type { Snippet } from 'svelte'
import type { Action } from 'svelte/action'

type Props = {
  children?: Snippet
  hasContent: boolean
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
  mobileSideNav,
  panel = $bindable<HTMLElement>(),
  scrollAction,
  showNestedPanel,
  sideNav,
  navBar,
}: Props = $props()
</script>

<div use:scrollAction class="mt-6">
  {@render navBar?.()}
  <div class="grid gap-8 xl:grid-cols-[1fr_18rem]">
    <div class="min-w-0">
      <div
        data-release-nav-mobile-toc
        class="sticky top-[2.5rem] z-30 -mx-6 w-[calc(100%+3rem)] xl:top-[112px] xl:hidden"
      >
        {@render mobileSideNav?.()}
      </div>
      <div
        data-release-nav-content-panel
        bind:this={panel}
        class={`mt-4 scroll-mt-24 xl:mt-2 xl:scroll-mt-[120px] ${hasContent && showNestedPanel ? 'xl:h-[calc(100svh-144px)] xl:min-h-[calc(100svh-144px)] xl:max-h-[calc(100svh-144px)] xl:overflow-hidden xl:rounded-lg xl:border xl:border-outline-variant/60 xl:bg-surface-container-lowest xl:dark:border-outline-variant' : ''}`}
      >
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
