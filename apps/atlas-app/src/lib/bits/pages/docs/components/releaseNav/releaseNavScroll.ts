import { tick } from 'svelte'
import { replaceState } from '$app/navigation'

import type { ReleaseNavOutlineItem, ReleaseNavVersion } from './releaseNav.types'

type ContentTarget = () => HTMLElement | undefined

const isPrimaryUnmodifiedClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

export const getReleaseNavContentTarget = (panel?: HTMLElement) =>
  panel?.querySelector<HTMLElement>('[data-release-nav-content-body]') ?? panel

export function createReleaseNavigationPersistence({
  getContentTarget,
  getVersions,
}: {
  getContentTarget: ContentTarget
  getVersions: () => ReleaseNavVersion[]
}) {
  let pendingScroll: { contentTop: number; pageTop: number } | null = null

  const captureNavigation = (event: MouseEvent) => {
    if (!isPrimaryUnmodifiedClick(event) || !(event.target instanceof Element)) return

    const link = event.target.closest<HTMLAnchorElement>('a[href]')
    if (!link) return
    const destination = new URL(link.href)
    if (destination.pathname === window.location.pathname) return
    if (
      !getVersions().some(
        version =>
          new URL(version.href, window.location.origin).pathname ===
          destination.pathname,
      )
    )
      return

    pendingScroll = {
      contentTop: getContentTarget()?.scrollTop ?? 0,
      pageTop: window.scrollY,
    }
  }

  return {
    captureNavigation,
    restore: async () => {
      if (!pendingScroll) return
      const { contentTop, pageTop } = pendingScroll
      pendingScroll = null
      await tick()
      const content = getContentTarget()
      if (content) {
        content.scrollTop = Math.min(
          contentTop,
          Math.max(0, content.scrollHeight - content.clientHeight),
        )
      }
      window.scrollTo({ top: pageTop, behavior: 'auto' })
    },
  }
}

export function createNestedContentScroll({
  getContentTarget,
  isEnabled,
  onNavigate,
}: {
  getContentTarget: ContentTarget
  isEnabled: () => boolean
  onNavigate: (event: MouseEvent) => void
}) {
  return (node: HTMLElement) => {
    const wheelPixels = (event: WheelEvent) =>
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? event.deltaY * window.innerHeight
          : event.deltaY
    const scrollPage = (delta: number) => {
      const start = window.scrollY
      window.scrollBy({ top: delta, behavior: 'auto' })
      return delta - (window.scrollY - start)
    }
    const scrollContent = (content: HTMLElement, delta: number) => {
      const start = content.scrollTop
      const maximum = Math.max(0, content.scrollHeight - content.clientHeight)
      content.scrollTop = Math.min(maximum, Math.max(0, start + delta))
      return delta - (content.scrollTop - start)
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0 || event.ctrlKey || !event.cancelable || !isEnabled())
        return
      const controls = node.querySelector<HTMLElement>('[data-release-nav-controls]')
      const content = getContentTarget()
      if (!controls || !content || getComputedStyle(content).overflowY === 'visible')
        return

      const delta = wheelPixels(event)
      const versionList = node.querySelector<HTMLElement>(
        '[data-release-nav-version-list]',
      )
      if (event.target instanceof Node && versionList?.contains(event.target)) {
        const maximum = Math.max(0, versionList.scrollHeight - versionList.clientHeight)
        const available =
          delta < 0 ? -versionList.scrollTop : maximum - versionList.scrollTop
        if (available !== 0) {
          event.preventDefault()
          versionList.scrollTop = Math.min(
            maximum,
            Math.max(0, versionList.scrollTop + delta),
          )
          return
        }
      }

      event.preventDefault()
      let remaining = delta
      const stickyTop = Number.parseFloat(getComputedStyle(controls).top) || 0
      let controlsTop = controls.getBoundingClientRect().top
      let distanceUntilPinned = Math.max(0, controlsTop - stickyTop)
      if (remaining > 0 && distanceUntilPinned > 1) {
        const pageDelta = Math.min(remaining, distanceUntilPinned)
        remaining -= pageDelta - scrollPage(pageDelta)
        controlsTop = controls.getBoundingClientRect().top
        distanceUntilPinned = Math.max(0, controlsTop - stickyTop)
        if (distanceUntilPinned > 1 || remaining <= 0) return
      }
      if (remaining < 0 && distanceUntilPinned > 1) {
        scrollPage(remaining)
        return
      }
      const panelTop =
        content.getBoundingClientRect().top ??
        controls.getBoundingClientRect().bottom + 8
      if (remaining < 0 && panelTop < controls.getBoundingClientRect().bottom + 7) {
        const pageDelta = -Math.min(
          -remaining,
          controls.getBoundingClientRect().bottom + 8 - panelTop,
        )
        remaining -= pageDelta - scrollPage(pageDelta)
      }
      if (remaining !== 0) remaining = scrollContent(content, remaining)
      if (remaining !== 0) scrollPage(remaining)
    }

    window.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    node.addEventListener('click', onNavigate, { capture: true })
    return {
      destroy: () => {
        window.removeEventListener('wheel', handleWheel, { capture: true })
        node.removeEventListener('click', onNavigate, { capture: true })
      },
    }
  }
}

export function scrollToReleaseNavAnchor({
  event,
  id,
  items,
  mobile = false,
  panel,
}: {
  event: MouseEvent
  id: string
  items: ReleaseNavOutlineItem[]
  mobile?: boolean
  panel?: HTMLElement
}) {
  if (!isPrimaryUnmodifiedClick(event)) return
  const target = document.getElementById(id)
  if (!target) return
  event.preventDefault()

  const rootFontSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  )
  const firstItemPadding = id === items[0]?.id ? 1.5 * rootFontSize : 0
  const scrollContainer = target.closest<HTMLElement>('[data-release-nav-content-body]')
  const controls = document.querySelector<HTMLElement>('[data-release-nav-controls]')

  if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
    if (panel && controls) {
      const desiredPanelTop = controls.getBoundingClientRect().bottom + 8
      const panelTop = panel.getBoundingClientRect().top
      if (panelTop < desiredPanelTop - 1) {
        window.scrollBy({ top: panelTop - desiredPanelTop, behavior: 'auto' })
      }
    }
    const top =
      scrollContainer.scrollTop +
      target.getBoundingClientRect().top -
      scrollContainer.getBoundingClientRect().top -
      firstItemPadding -
      24
    replaceState(`#${id}`, {})
    scrollContainer.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    return
  }

  const mobileOffset = Math.max(
    0,
    document.querySelector('header')?.getBoundingClientRect().bottom ?? 0,
    controls?.getBoundingClientRect().bottom ?? 0,
    document
      .querySelector<HTMLElement>('[data-release-nav-mobile-toc-trigger]')
      ?.getBoundingClientRect().bottom ?? 0,
  )
  const offset = mobile ? mobileOffset + 24 : 7.5 * rootFontSize + firstItemPadding + 24
  replaceState(`#${id}`, {})
  if (mobile) window.dispatchEvent(new Event('app-header:preserve-visibility'))
  window.scrollTo({
    top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset),
    behavior: 'smooth',
  })
}

export const revealReleaseNavVersion = async (
  active: HTMLElement | undefined,
  list: HTMLElement | undefined,
) => {
  await tick()
  if (!active || !list) return
  const listRect = list.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  if (activeRect.top >= listRect.top + 8 && activeRect.bottom <= listRect.bottom - 8)
    return
  list.scrollTo({
    top: Math.max(0, list.scrollTop + activeRect.top - listRect.top - 8),
    behavior: 'smooth',
  })
}

export const observeReleaseNavOutline = (
  items: ReleaseNavOutlineItem[],
  onActive: (id: string | null) => void,
) => {
  let disposed = false
  let observer: IntersectionObserver | undefined
  let targets: HTMLElement[] = []

  const update = () => {
    const firstTarget = targets.at(0)
    if (!firstTarget) return
    const offset = Math.min(160, window.innerHeight * 0.25)
    const active =
      [...targets]
        .reverse()
        .find(target => target.getBoundingClientRect().top <= offset) ?? firstTarget
    onActive(active.id)
  }

  void tick().then(() => {
    if (disposed) return
    targets = items
      .map(item => document.getElementById(item.id))
      .filter((target): target is HTMLElement => target !== null)
    if (!targets.length) {
      onActive(null)
      return
    }
    observer = new IntersectionObserver(update, { rootMargin: '-20% 0px -65% 0px' })
    for (const target of targets) observer.observe(target)
    window.addEventListener('scroll', update, { passive: true })
    update()
  })

  return () => {
    disposed = true
    observer?.disconnect()
    window.removeEventListener('scroll', update)
  }
}
