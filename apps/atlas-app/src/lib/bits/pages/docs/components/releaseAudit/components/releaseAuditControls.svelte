<script lang="ts">
import { Tooltip } from 'bits-ui'
import { onMount } from 'svelte'
import ReleaseAuditControlsHeader from './releaseAuditControlsHeader.svelte'
import ReleaseAuditControlsSearch from './releaseAuditControlsSearch.svelte'
import { releaseAuditHeadingId } from './releaseAuditUtils'

type Props = {
  filteredCount: string
  infoDescription: string
  infoLabel: string
  loadError?: boolean
  loading?: boolean
  onRetry?: () => void
  query?: string
  totalCount: string
  placeholder?: string
}

let {
  filteredCount,
  infoDescription,
  infoLabel,
  loadError = false,
  loading = false,
  onRetry,
  query = $bindable(''),
  totalCount,
  placeholder,
}: Props = $props()
let stickyTop = $state(0)
onMount(() => {
  const navigation = document.querySelector<HTMLElement>('[data-release-nav-controls]')
  if (!navigation) return
  const measure = () => {
    const headerBottom =
      document.querySelector('body header')?.getBoundingClientRect().bottom ?? 0
    stickyTop = Math.max(
      headerBottom,
      (Number.parseFloat(getComputedStyle(navigation).top) || 0) +
        navigation.offsetHeight,
    )
  }
  const observer = new ResizeObserver(measure)
  observer.observe(navigation)
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, { passive: true })
  measure()
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', measure)
    window.removeEventListener('scroll', measure)
  }
})
</script>

<section
  id={releaseAuditHeadingId}
  style:top={`${stickyTop}px`}
  class="sticky z-40 -mx-6 !my-0 bg-background px-6 pt-1 pb-2 md:-mx-8 md:px-8"
>
  <Tooltip.Provider>
    <ReleaseAuditControlsHeader
      {filteredCount}
      {infoDescription}
      {infoLabel}
      {loading}
      {totalCount}
    />
  </Tooltip.Provider>
  <ReleaseAuditControlsSearch {loadError} {onRetry} {placeholder} bind:query />
</section>
