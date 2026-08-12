<script lang="ts">
import type { Snippet } from 'svelte'

let {
  theme,
  children,
  comparisonActive = false,
  compact = $bindable(false),
}: {
  theme: string
  children: Snippet
  comparisonActive?: boolean
  compact?: boolean
} = $props()
const environmentLabel = import.meta.env.DEV ? 'DEV' : 'BETA'

function updateLayout(): void {
  compact = window.innerWidth <= (comparisonActive ? 894 : 720)
}

$effect(() => {
  window.addEventListener('resize', updateLayout)
  window.requestAnimationFrame(updateLayout)
  return () => {
    window.removeEventListener('resize', updateLayout)
  }
})
</script>

{#if !compact}
  <header
    class="fixed inset-x-0 top-0 z-20 flex h-(--header-height) min-h-0 flex-wrap items-center gap-4 overflow-visible border-b border-(--bar-border) bg-(--bar-background) px-3.5 py-[9px] text-(--bar-text) shadow-[0_1px_8px_var(--bar-shadow)] backdrop-blur-[10px] max-[1302px]:h-auto max-[1302px]:min-h-[96px] max-[1302px]:gap-x-4 max-[1302px]:gap-y-1.5 max-[720px]:px-2.5"
    data-bar-theme={theme}
    data-compact={compact}
  >
    <a
      class="shrink-0 whitespace-nowrap text-inherit font-[720] leading-none tracking-[-0.02em] no-underline focus-visible:outline-2 focus-visible:outline-(--bar-accent) focus-visible:outline-offset-3"
      data-viewer-header-brand
      href="https://saanseoi.hk"
      >山水 | SaanSeoi
      <span
        class="relative inline-block font-medium text-(--bar-muted) max-[720px]:hidden"
      >
        <span
          class="absolute right-0 bottom-full font-mono text-[8px] leading-none tracking-[0.08em] text-(--bar-accent)"
          >{environmentLabel}</span
        >
        Basemaps
      </span></a
    >
    {@render children()}
  </header>
{/if}
