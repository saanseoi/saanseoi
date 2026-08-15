<script lang="ts">
import type { Snippet } from 'svelte'
import Icon from '@iconify/svelte'
import type { ReleaseNavVersion } from '../releaseNav.types'
import { revealReleaseNavVersion } from '../releaseNavScroll'

type Props = {
  canExpand?: boolean
  children?: Snippet
  currentVersionCode: string
  footer?: Snippet
  open?: boolean
  versions: ReleaseNavVersion[]
}
let {
  canExpand = true,
  children,
  currentVersionCode,
  footer,
  open = $bindable(true),
  versions,
}: Props = $props()
let activeVersionElement = $state<HTMLDivElement>()
let versionListElement = $state<HTMLElement>()
let versionScrollOverride = $state(false)

function toggleOpen() {
  if (!canExpand) return
  open = !open
  if (open) void revealReleaseNavVersion(activeVersionElement, versionListElement)
}

$effect(() => {
  currentVersionCode
  versionScrollOverride = false
  open = canExpand
  void revealReleaseNavVersion(activeVersionElement, versionListElement)
})

$effect(() => {
  if (!versionListElement) return
  const restore = (event: Event) => {
    if (!versionScrollOverride || event.composedPath().includes(versionListElement))
      return
    versionScrollOverride = false
    void revealReleaseNavVersion(activeVersionElement, versionListElement)
  }
  window.addEventListener('wheel', restore, { capture: true, passive: true })
  window.addEventListener('touchstart', restore, { capture: true, passive: true })
  return () => {
    window.removeEventListener('wheel', restore, true)
    window.removeEventListener('touchstart', restore, true)
  }
})
</script>

<nav
  bind:this={versionListElement}
  data-release-nav-version-list
  class="flex h-full min-h-0 flex-col gap-2 overflow-y-auto overscroll-auto pt-2"
  aria-label="Release versions"
  onwheel={() => (versionScrollOverride = true)}
  ontouchstart={() => (versionScrollOverride = true)}
>
  {#each versions as version}
    {#if version.code === currentVersionCode}
      <div
        bind:this={activeVersionElement}
        class="shrink-0 rounded-lg border border-outline-variant/60 bg-surface-container-lowest dark:border-outline-variant"
      >
        <div
          class="flex items-center gap-3 rounded-t-lg bg-secondary-container px-4 py-3 font-mono text-label-md font-semibold text-primary dark:text-[#edf2ee]!"
        >
          {#if canExpand}
            <button
              class="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
              type="button"
              aria-controls="source-release-toc"
              aria-expanded={open}
              onclick={toggleOpen}
            >
              {version.label}
              <Icon
                icon="ion:chevron-down-outline"
                class={`size-4 transition-transform duration-300 ${open ? '' : 'rotate-180'}`}
                aria-hidden="true"
              />
            </button>
          {:else}
            <span class="min-w-0 flex-1">{version.label}</span>
          {/if}
        </div>
        {#if children}
          <div
            id="source-release-toc"
            class:rounded-b-lg={open}
            class={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr] border-t border-outline-variant/60 dark:border-outline-variant' : 'grid-rows-[0fr]'}`}
          >
            <div class="min-h-0 overflow-hidden">{@render children()}</div>
          </div>
        {/if}
      </div>
    {:else}
      <a
        class="shrink-0 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 font-mono text-label-md font-semibold text-foreground-alt transition hover:border-secondary/70 dark:border-outline-variant"
        data-sveltekit-reset="false"
        href={version.href}
        >{version.label}</a
      >
    {/if}
  {/each}
  {@render footer?.()}
</nav>
