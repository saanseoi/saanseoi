
<script lang="ts">
import { page } from '$app/state'

import HeaderActions from '../components/headerActions.svelte'
import PrimaryNavigation from '../components/primaryNavigation.svelte'
import SiteBrand from '../components/siteBrand.svelte'

type User = {
  email: string
  image?: string | null
  name: string
}

let { user = null }: { user?: User | null } = $props()
let mobileHeaderVisible = $state(true)
let isLandingPage = $derived(page.url.pathname === '/')

$effect(() => {
  if (typeof window === 'undefined') return

  const revealDistance = 12
  const hideDistance = 24
  const topBoundary = 8
  let accumulatedDistance = 0
  let frame = 0
  let preserveVisibility = false
  let programmaticScrollStarted = false
  let preserveVisibilityTimer: number | undefined
  let previousScrollY = Math.max(0, window.scrollY)

  const stopPreservingVisibility = () => {
    preserveVisibility = false
    programmaticScrollStarted = false
    window.clearTimeout(preserveVisibilityTimer)
    preserveVisibilityTimer = undefined
    accumulatedDistance = 0
    previousScrollY = Math.max(0, window.scrollY)
  }

  const preserveCurrentVisibility = () => {
    preserveVisibility = true
    programmaticScrollStarted = false
    window.clearTimeout(preserveVisibilityTimer)
    preserveVisibilityTimer = window.setTimeout(stopPreservingVisibility, 2000)
  }

  const finishProgrammaticScroll = () => {
    // A scrollend from interaction immediately before the programmatic scroll
    // must not cancel preservation before that scroll has emitted a delta.
    if (!programmaticScrollStarted) return
    stopPreservingVisibility()
  }

  const updateVisibility = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(() => {
      const currentScrollY = Math.max(0, window.scrollY)
      const delta = currentScrollY - previousScrollY
      previousScrollY = currentScrollY

      if (preserveVisibility) {
        if (Math.abs(delta) >= 1) programmaticScrollStarted = true
        accumulatedDistance = 0
        return
      }

      if (currentScrollY <= topBoundary) {
        accumulatedDistance = 0
        mobileHeaderVisible = true
        return
      }

      // Ignore jitter and browser-chrome adjustments. For a real direction
      // change, discard the previous direction rather than letting tiny
      // alternating deltas repeatedly toggle the header.
      if (Math.abs(delta) < 1) return
      accumulatedDistance =
        Math.sign(delta) === Math.sign(accumulatedDistance)
          ? accumulatedDistance + delta
          : delta

      if (accumulatedDistance <= -revealDistance) {
        mobileHeaderVisible = true
        accumulatedDistance = 0
      } else if (accumulatedDistance >= hideDistance && currentScrollY > hideDistance) {
        mobileHeaderVisible = false
        accumulatedDistance = 0
      }
    })
  }

  window.addEventListener('scroll', updateVisibility, { passive: true })
  window.addEventListener('scrollend', finishProgrammaticScroll)
  window.addEventListener('app-header:preserve-visibility', preserveCurrentVisibility)
  return () => {
    window.cancelAnimationFrame(frame)
    window.clearTimeout(preserveVisibilityTimer)
    window.removeEventListener('scroll', updateVisibility)
    window.removeEventListener('scrollend', finishProgrammaticScroll)
    window.removeEventListener(
      'app-header:preserve-visibility',
      preserveCurrentVisibility,
    )
  }
})
</script>

<header
  class="top-0 z-60 isolate h-18 border-b border-border-card/55 bg-background text-foreground transition-transform duration-300 lg:translate-y-0"
  class:dark={isLandingPage}
  class:fixed={isLandingPage}
  class:inset-x-0={isLandingPage}
  class:sticky={!isLandingPage}
  class:translate-y-0={mobileHeaderVisible}
  class:-translate-y-full={!mobileHeaderVisible}
>
  <div
    class="mx-auto flex h-full max-w-(--spacing-container-max) items-center justify-between gap-4 px-(--spacing-margin-md) @container md:grid md:grid-cols-[1fr_auto_1fr]"
  >
    <SiteBrand />
    <PrimaryNavigation />
    <HeaderActions {user} />
  </div>
</header>
