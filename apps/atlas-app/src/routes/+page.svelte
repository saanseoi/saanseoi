<script lang="ts">
import { onMount, type Component } from 'svelte'

import { Main, Divider, Seo } from '$lib/bits'
import { m } from '$lib/bits/internal/i18n'

import HeroSection from '$lib/bits/pages/landing/heroSection.svelte'

let landingPage = $state<HTMLElement>()
let FoundationSection = $state<Component>()
let FeatureSection = $state<Component>()
let PipelineSection = $state<Component>()
let CommunitySection = $state<Component>()

onMount(() => {
  let cancelled = false
  let idleCallback: number | undefined
  let preloadTimer: number | undefined

  // Keep the hero's image and hydration work alone on the critical path. Each
  // later section is then requested in reading order while the browser is idle.
  const preloadSections = async () => {
    const { default: foundationSection } = await import(
      '$lib/bits/pages/landing/foundationSection.svelte'
    )
    if (cancelled) return
    FoundationSection = foundationSection

    const { default: featureSection } = await import(
      '$lib/bits/pages/landing/featureSection.svelte'
    )
    if (cancelled) return
    FeatureSection = featureSection

    const { default: pipelineSection } = await import(
      '$lib/bits/pages/landing/pipelineSection.svelte'
    )
    if (cancelled) return
    PipelineSection = pipelineSection

    const { default: communitySection } = await import(
      '$lib/bits/pages/landing/communitySection.svelte'
    )
    if (!cancelled) CommunitySection = communitySection
  }

  const startPreload = () => void preloadSections()
  const scheduleIdleCallback = window.requestIdleCallback as
    | ((callback: () => void, options?: { timeout: number }) => number)
    | undefined
  if (scheduleIdleCallback) {
    idleCallback = scheduleIdleCallback(startPreload, { timeout: 1_500 })
  } else {
    preloadTimer = window.setTimeout(startPreload, 0)
  }

  if (!landingPage) return
  const page = landingPage

  let isSettling = false
  let touchStart: { x: number; y: number } | undefined
  let touchDirection = 0
  let settleFrame = 0
  let settleTimer: number | undefined
  let scrollControlReleased = false
  let releasedAt: number | undefined
  let hasLeftLanding = false

  const sections = () =>
    Array.from(page.querySelectorAll<HTMLElement>(':scope > [data-landing-section]'))

  const canControlSectionScroll = () =>
    window.matchMedia('(min-width: 786px)').matches ||
    sections().every(
      section => section.getBoundingClientRect().height <= window.innerHeight,
    )

  const finishSettling = () => {
    isSettling = false
    window.cancelAnimationFrame(settleFrame)
    window.clearTimeout(settleTimer)
    window.removeEventListener('scrollend', finishOnScrollEnd)
  }

  const finishOnScrollEnd = () => finishSettling()

  const settleAt = (top: number) => {
    let stillFrames = 0

    const watchForSettle = () => {
      stillFrames = Math.abs(window.scrollY - top) < 2 ? stillFrames + 1 : 0
      if (stillFrames === 3) {
        finishSettling()
        return
      }
      settleFrame = window.requestAnimationFrame(watchForSettle)
    }

    window.addEventListener('scrollend', finishOnScrollEnd, { once: true })
    settleFrame = window.requestAnimationFrame(watchForSettle)
    settleTimer = window.setTimeout(finishSettling, 2000)
  }

  const move = (direction: number) => {
    if (isSettling || !canControlSectionScroll()) return

    const sectionElements = sections()
    const currentIndex = sectionElements.findLastIndex(
      section =>
        section.getBoundingClientRect().top + window.scrollY <= window.scrollY + 1,
    )
    const activeIndex = Math.max(0, currentIndex)
    const target =
      sectionElements[
        Math.max(0, Math.min(sectionElements.length - 1, activeIndex + direction))
      ]
    if (!target) return

    if (target === sectionElements[activeIndex]) {
      if (direction < 0) return

      const top = Math.min(
        window.scrollY + window.innerHeight,
        document.documentElement.scrollHeight - window.innerHeight,
      )
      if (top <= window.scrollY) return

      scrollControlReleased = true
      releasedAt = window.scrollY
      hasLeftLanding = false
      window.scrollTo({
        top,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
      return
    }

    const top = Math.min(
      Math.max(0, target.getBoundingClientRect().top + window.scrollY),
      document.documentElement.scrollHeight - window.innerHeight,
    )
    isSettling = true
    window.scrollTo({
      top,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
    settleAt(top)
  }

  const resumeSectionScroll = () => {
    if (!scrollControlReleased || releasedAt === undefined) return

    if (window.scrollY > releasedAt + 1) hasLeftLanding = true
    if (hasLeftLanding && window.scrollY <= releasedAt + 1) {
      scrollControlReleased = false
      releasedAt = undefined
    }
  }

  const stopSectionScrollWhenNeeded = () => {
    if (canControlSectionScroll()) return

    scrollControlReleased = false
    releasedAt = undefined
    hasLeftLanding = false
    finishSettling()
  }

  const isFormControl = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    target.closest('input, select, textarea, [contenteditable="true"], [role="slider"]')

  const isKeyboardInteractive = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    target.closest(
      'a, button, input, select, textarea, [contenteditable="true"], [role="button"], [role="slider"]',
    )

  const onWheel = (event: WheelEvent) => {
    if (isFormControl(event.target) || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
      return

    if (scrollControlReleased || !canControlSectionScroll()) return

    event.preventDefault()
    move(Math.sign(event.deltaY))
  }

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    touchStart =
      touch && !isFormControl(event.target)
        ? { x: touch.clientX, y: touch.clientY }
        : undefined
    touchDirection = 0
  }

  const onTouchMove = (event: TouchEvent) => {
    if (!canControlSectionScroll()) return
    if (isSettling) {
      event.preventDefault()
      return
    }
    const touch = event.touches[0]
    if (!touchStart || !touch) return

    const deltaY = touchStart.y - touch.clientY
    const deltaX = touchStart.x - touch.clientX
    if (Math.abs(deltaY) < 12 || Math.abs(deltaY) < Math.abs(deltaX)) return

    touchDirection = Math.sign(deltaY)
    if (scrollControlReleased) return
    event.preventDefault()
  }

  const onTouchEnd = () => {
    if (touchDirection && !scrollControlReleased && canControlSectionScroll())
      move(touchDirection)
    touchStart = undefined
    touchDirection = 0
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (isKeyboardInteractive(event.target)) return

    const direction =
      event.key === 'ArrowDown' ||
      event.key === 'PageDown' ||
      (event.key === ' ' && !event.shiftKey)
        ? 1
        : event.key === 'ArrowUp' ||
            event.key === 'PageUp' ||
            (event.key === ' ' && event.shiftKey)
          ? -1
          : 0
    if (!direction) return

    if (scrollControlReleased || !canControlSectionScroll()) return

    event.preventDefault()
    move(direction)
  }

  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('scroll', resumeSectionScroll, { passive: true })
  window.addEventListener('resize', stopSectionScrollWhenNeeded, { passive: true })
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd, { passive: true })
  window.addEventListener('keydown', onKeyDown)

  return () => {
    cancelled = true
    if (idleCallback !== undefined) window.cancelIdleCallback(idleCallback)
    if (preloadTimer !== undefined) window.clearTimeout(preloadTimer)
    finishSettling()
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('scroll', resumeSectionScroll)
    window.removeEventListener('resize', stopSectionScrollWhenNeeded)
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('keydown', onKeyDown)
  }
})
</script>

<Seo
  title="山水"
  description={m.hero_description()}
  structuredData={{
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'SaanSeoi',
        alternateName: '山水',
        url: 'https://saanseoi.hk',
        description: m.hero_description(),
        areaServed: {
          '@type': 'AdministrativeArea',
          name: 'Hong Kong',
        },
      },
      {
        '@type': 'WebSite',
        name: 'SaanSeoi',
        alternateName: '山水',
        url: 'https://saanseoi.hk',
        description: m.hero_description(),
        inLanguage: ['en', 'zh-Hant', 'zh-Hans'],
      },
    ],
  }}
/>

<Main class="[--landing-header-height:0px]">
  <div bind:this={landingPage}>
    <div data-landing-section>
      <HeroSection />
      <Divider />
    </div>
    <div data-landing-section>
      {#if FoundationSection}
        <FoundationSection />
        <Divider />
      {/if}
    </div>
    <div data-landing-section>
      {#if FeatureSection}
        <FeatureSection />
        <Divider />
      {/if}
    </div>
    <div data-landing-section>
      {#if PipelineSection}
        <PipelineSection />
        <Divider />
      {/if}
    </div>
    <div data-landing-section>
      {#if CommunitySection}
        <CommunitySection />
        <Divider />
      {/if}
    </div>
  </div>
</Main>
