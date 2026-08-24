import { tick } from 'svelte'
import { goto } from '$app/navigation'
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
  onVersionSelect,
}: {
  getContentTarget: ContentTarget
  getVersions: () => ReleaseNavVersion[]
  onVersionSelect?: (versionCode: string) => void
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

    const selectedVersion = getVersions().find(
      version =>
        new URL(version.href, window.location.origin).pathname === destination.pathname,
    )
    if (selectedVersion) {
      // Let the link's own navigation handler read the original href before
      // the optimistic version update rerenders the navigation controls.
      window.setTimeout(() => onVersionSelect?.(selectedVersion.code), 0)
    }

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
  onNavigate,
}: {
  onNavigate: (event: MouseEvent) => void
}) {
  return (node: HTMLElement) => {
    node.addEventListener('click', onNavigate, { capture: true })

    return {
      destroy: () => {
        node.removeEventListener('click', onNavigate, { capture: true })
      },
    }
  }
}

export async function scrollToReleaseNavAnchor({
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

    await goto(`#${id}`, { replace: true, reset: false, shallow: true, state: {} })
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

  await goto(`#${id}`, { replace: true, reset: false, shallow: true, state: {} })

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
