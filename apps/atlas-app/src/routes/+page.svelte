<script lang="ts">
import { onMount, tick, type Component } from 'svelte'

import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Divider } from '#lib/bits/primitives/divider/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { m } from '#lib/bits/internal/i18n.js'

import HeroSection from '#lib/bits/pages/landing/heroSection.svelte'

let landingPage = $state<HTMLElement>()
let FoundationSection = $state<Component>()
let FeatureSection = $state<Component>()
let PipelineSection = $state<Component>()
let CommunitySection = $state<Component>()
let communityClosingSectionPromise = $state<Promise<Component>>()

const landingSectionIds = [
  'hero',
  'foundation',
  'feature',
  'pipeline',
  'community',
  'footer',
] as const

onMount(() => {
  let cancelled = false
  let idleCallback: number | undefined
  let preloadTimer: number | undefined
  const initialHashTimers: number[] = []

  const scrollToLandingSectionHash = async () => {
    const targetId = window.location.hash.slice(1)
    if (
      !landingSectionIds.includes(targetId as (typeof landingSectionIds)[number]) ||
      !landingPage
    ) {
      return
    }

    await tick()
    const target = landingPage.querySelector<HTMLElement>(`#${targetId}`)
    if (!target) return

    const scrollToTarget = () => {
      window.scrollTo({
        top: Math.min(
          Math.max(0, target.getBoundingClientRect().top + window.scrollY),
          document.documentElement.scrollHeight - window.innerHeight,
        ),
        behavior: 'auto',
      })
    }

    // When a lazily loaded landing section is the initial fragment target,
    // the browser's own fragment restoration can run after the component is
    // mounted and leave the viewport at the bottom of the document. Reapply
    // the same precise top alignment once that restoration has settled.
    scrollToTarget()
    window.requestAnimationFrame(scrollToTarget)
    window.setTimeout(scrollToTarget, 750)
  }

  // Keep the hero's image and hydration work alone on the critical path. Each
  // later section is then requested in reading order while the browser is idle.
  const preloadSections = async () => {
    const { default: foundationSection } = await import(
      '#lib/bits/pages/landing/foundationSection.svelte'
    )
    if (cancelled) return
    FoundationSection = foundationSection

    const { default: featureSection } = await import(
      '#lib/bits/pages/landing/featureSection.svelte'
    )
    if (cancelled) return
    FeatureSection = featureSection

    const { default: pipelineSection } = await import(
      '#lib/bits/pages/landing/pipelineSection.svelte'
    )
    if (cancelled) return
    PipelineSection = pipelineSection

    const { default: communitySection } = await import(
      '#lib/bits/pages/landing/communitySection.svelte'
    )
    if (cancelled) return

    CommunitySection = communitySection

    // The closing community panel owns the newsletter and landing-page footer.
    // Request it only after the main community section has been requested.
    const closingSectionPromise = import(
      '#lib/bits/pages/landing/components/communitySection/communitySectionClosing.svelte'
    ).then(({ default: closingSection }) => closingSection)
    if (cancelled) return

    communityClosingSectionPromise = closingSectionPromise
    await closingSectionPromise
    await scrollToLandingSectionHash()
  }

  const startPreload = () => void preloadSections()
  const scheduleIdleCallback = window.requestIdleCallback as
    | ((callback: () => void, options?: { timeout: number }) => number)
    | undefined
  const initialLandingHash = window.location.hash
  if (landingSectionIds.some(id => initialLandingHash === `#${id}`)) {
    startPreload()
    // A fragment may be resolved again when its deferred section enters the
    // document. Settle the initial target after each likely render point; a
    // changed hash is always left alone.
    for (const delay of [500, 1_250, 2_500]) {
      initialHashTimers.push(
        window.setTimeout(() => {
          if (window.location.hash === initialLandingHash)
            void scrollToLandingSectionHash()
        }, delay),
      )
    }
  } else if (scheduleIdleCallback) {
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
    Array.from(page.querySelectorAll<HTMLElement>('[data-landing-section]'))

  const isWithinStackedCommunitySection = () => {
    if (!window.matchMedia('(min-width: 768px) and (max-width: 900px)').matches)
      return false

    const communitySection = page.querySelector<HTMLElement>('#community')
    if (!communitySection) return false

    const communityTop = communitySection.getBoundingClientRect().top + window.scrollY
    const communityBottom = communityTop + communitySection.offsetHeight
    return window.scrollY >= communityTop && window.scrollY < communityBottom
  }

  const canControlSectionScroll = () => {
    if (isWithinStackedCommunitySection()) return false

    return (
      window.matchMedia('(min-width: 786px)').matches ||
      sections().every(
        section => section.getBoundingClientRect().height <= window.innerHeight,
      )
    )
  }

  const shouldAllowNativeEndScroll = () => {
    if (!window.matchMedia('(max-width: 900px)').matches) return false

    const sectionElements = sections()
    const currentIndex = sectionElements.findLastIndex(
      section =>
        section.getBoundingClientRect().top + window.scrollY <= window.scrollY + 1,
    )
    return currentIndex === sectionElements.length - 1
  }

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
      if (direction < 0 || window.matchMedia('(max-width: 900px)').matches) return

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

    const direction = Math.sign(event.deltaY)
    if (
      scrollControlReleased ||
      !canControlSectionScroll() ||
      shouldAllowNativeEndScroll()
    )
      return

    event.preventDefault()
    move(direction)
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
    if (scrollControlReleased || shouldAllowNativeEndScroll()) {
      touchDirection = 0
      return
    }
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

    if (
      scrollControlReleased ||
      !canControlSectionScroll() ||
      shouldAllowNativeEndScroll()
    )
      return

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
  window.addEventListener('hashchange', scrollToLandingSectionHash)

  return () => {
    cancelled = true
    if (idleCallback !== undefined) window.cancelIdleCallback(idleCallback)
    if (preloadTimer !== undefined) window.clearTimeout(preloadTimer)
    for (const timer of initialHashTimers) window.clearTimeout(timer)
    finishSettling()
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('scroll', resumeSectionScroll)
    window.removeEventListener('resize', stopSectionScrollWhenNeeded)
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('hashchange', scrollToLandingSectionHash)
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

<div bind:this={landingPage}>
  <Main class="[--landing-header-height:0px]">
    <div>
      <div data-landing-section id="hero">
        <HeroSection />
        <Divider />
      </div>
      <div data-landing-section id="foundation">
        {#if FoundationSection}
          <FoundationSection />
          <Divider />
        {/if}
      </div>
      <div data-landing-section id="feature">
        {#if FeatureSection}
          <FeatureSection />
          <Divider />
        {/if}
      </div>
      <div data-landing-section id="pipeline">
        {#if PipelineSection}
          <PipelineSection />
          <Divider />
        {/if}
      </div>
      <div data-landing-section id={CommunitySection ? 'community' : undefined}>
        {#if CommunitySection}
          <CommunitySection />
        {/if}
      </div>
    </div>
  </Main>

  {#if communityClosingSectionPromise}
    {#await communityClosingSectionPromise then CommunityClosingSection}
      <div data-landing-section id="footer">
        <CommunityClosingSection />
      </div>
    {/await}
  {/if}
</div>
