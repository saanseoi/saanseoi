<script lang="ts">
import type {
  ReleaseNavOutlineItem,
  ReleaseNavVersion,
  ReleaseNavVersionPreload,
} from '../releaseNav.types'
import ReleaseNavMobilePicker from './releaseNavMobilePicker.svelte'
import ReleaseNavTableOfContents from './releaseNavTableOfContents.svelte'

type Props = {
  activeOutlineId: string | null
  canShowToc?: boolean
  currentVersionCode: string
  loading?: boolean
  outline?: ReleaseNavOutlineItem[]
  panel?: HTMLElement
  onVersionPreload?: ReleaseNavVersionPreload
  versions: ReleaseNavVersion[]
}
let {
  activeOutlineId,
  canShowToc = true,
  currentVersionCode,
  loading = false,
  outline = [],
  panel,
  onVersionPreload,
  versions,
}: Props = $props()
let contentReached = $state(false)
let selectorModeLocked = $state(false)
let isTocMode = $derived(
  canShowToc && outline.length > 0 && contentReached && !selectorModeLocked,
)

function updateContentPosition() {
  if (!panel || !canShowToc) {
    contentReached = false
    return
  }
  const rootFontSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  )
  contentReached =
    panel.getBoundingClientRect().top <= 6 * rootFontSize - 0.5 * rootFontSize
}

$effect(() => {
  panel
  canShowToc
  let frame = 0
  const update = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(updateContentPosition)
  }
  const unlock = () => {
    selectorModeLocked = false
    updateContentPosition()
  }
  update()
  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
  window.addEventListener('wheel', unlock, { passive: true })
  window.addEventListener('touchstart', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
  return () => {
    window.cancelAnimationFrame(frame)
    window.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    window.removeEventListener('wheel', unlock)
    window.removeEventListener('touchstart', unlock)
    window.removeEventListener('keydown', unlock)
  }
})

$effect(() => {
  currentVersionCode
  outline
  selectorModeLocked = false
})
</script>

{#if isTocMode}
  <ReleaseNavTableOfContents {activeOutlineId} items={outline} {panel} />
{:else}
  <ReleaseNavMobilePicker
    {currentVersionCode}
    {loading}
    {onVersionPreload}
    {versions}
  />
{/if}
