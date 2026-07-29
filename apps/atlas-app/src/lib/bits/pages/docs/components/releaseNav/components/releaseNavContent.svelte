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
  <div class="grid gap-8 lg:grid-cols-[1fr_18rem]">
    <div class="min-w-0">
      <div
        data-release-nav-mobile-toc
        class="sticky top-[2.5rem] z-30 -mx-6 w-[calc(100%+3rem)] lg:top-[112px] lg:hidden"
      >
        {@render mobileSideNav?.()}
      </div>
      <div
        data-release-nav-content-panel
        bind:this={panel}
        class={`mt-4 scroll-mt-24 lg:mt-2 lg:scroll-mt-[120px] ${hasContent && showNestedPanel ? 'lg:h-[calc(100svh-144px)] lg:min-h-[calc(100svh-144px)] lg:max-h-[calc(100svh-144px)] lg:overflow-hidden lg:rounded-lg lg:border lg:border-outline-variant/60 lg:bg-surface-container-lowest lg:dark:border-outline-variant' : ''}`}
      >
        {@render children?.()}
      </div>
    </div>
    <div
      class="hidden h-[calc(100svh-136px)] lg:sticky lg:top-[112px] lg:block lg:self-start"
    >
      {@render sideNav?.()}
    </div>
  </div>
</div>
