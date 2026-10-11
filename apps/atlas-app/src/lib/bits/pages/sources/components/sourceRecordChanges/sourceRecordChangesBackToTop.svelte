<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
let { label }: { label: string } = $props()
let visible = $state(false)
let right = $state(16)
function observeTop(node: HTMLElement) {
  const alignWithRows = () => {
    right = window.innerWidth - node.getBoundingClientRect().right + 16
  }
  const resizeObserver = new ResizeObserver(alignWithRows)
  resizeObserver.observe(node)
  window.addEventListener('resize', alignWithRows)
  alignWithRows()
  const observer = new IntersectionObserver(([entry]) => {
    visible = !entry.isIntersecting && entry.boundingClientRect.top < 0
  })
  observer.observe(node)
  return {
    destroy: () => {
      observer.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', alignWithRows)
    },
  }
}
function backToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
  })
}
</script>

<div use:observeTop class="h-px" aria-hidden="true"></div>
{#if visible}
  <button
    type="button"
    class="fixed bottom-6 z-40 flex size-11 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-primary shadow-lg hover:bg-surface-container-highest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    style:right={`${right}px`}
    aria-label={label}
    title={label}
    onclick={backToTop}
  >
    <Icon icon="proicons:arrow-up" class="size-5" />
  </button>
{/if}
