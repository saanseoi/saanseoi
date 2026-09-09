import { tick } from 'svelte'
import { routeReleaseNavWheel } from './releaseNavWheel'
import { goto } from '$app/navigation'
import type { ReleaseNavOutlineItem, ReleaseNavVersion } from './releaseNav.types'

type ContentTarget = () => HTMLElement | undefined

export const releaseNavActivationViewportFraction = 0.5
export const releaseNavActivationRootMargin = '-50% 0px -49% 0px'

const isPrimaryUnmodifiedClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

const releaseNavControlsBottom = (controls: HTMLElement) => {
  const stickyTop = Number.parseFloat(getComputedStyle(controls).top)
  return (
    (Number.isFinite(stickyTop) ? stickyTop : 0) +
    controls.getBoundingClientRect().height +
    8
  )
}

export const getReleaseNavContentTarget = (panel?: HTMLElement) =>
  panel?.querySelector<HTMLElement>('[data-release-nav-content-body]') ?? panel

export const releaseNavScrollsIndependently = (element: HTMLElement) => {
  const overflowY = getComputedStyle(element).overflowY
  return (
    /^(auto|scroll)$/.test(overflowY) && element.scrollHeight > element.clientHeight
  )
}

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
    const wheel = (event: WheelEvent) => routeReleaseNavWheel(node, event)
    node.addEventListener('wheel', wheel, { passive: false })
    node.addEventListener('click', onNavigate, { capture: true })

    return {
      destroy: () => {
        node.removeEventListener('wheel', wheel)
        node.removeEventListener('click', onNavigate, { capture: true })
      },
    }
  }
}

export async function scrollToReleaseNavAnchor({
  event,
  id,
  mobile = false,
  panel,
}: {
  event: MouseEvent
  id: string
  items?: ReleaseNavOutlineItem[]
  mobile?: boolean
  panel?: HTMLElement
}) {
  if (!isPrimaryUnmodifiedClick(event)) return

  const target = document.getElementById(id)

  if (!target) return

  const anchorOffset = target.hasAttribute('data-release-nav-box') ? 0 : 24

  event.preventDefault()

  const scrollContainer = target.closest<HTMLElement>('[data-release-nav-content-body]')
  const controls = document.querySelector<HTMLElement>('[data-release-nav-controls]')
  const contentPanel =
    panel ?? target.closest<HTMLElement>('[data-release-nav-content-panel]')

  if (scrollContainer && releaseNavScrollsIndependently(scrollContainer)) {
    if (contentPanel && controls) {
      const desiredPanelTop = controls.getBoundingClientRect().bottom + 8
      const panelTop = contentPanel.getBoundingClientRect().top
      if (panelTop < desiredPanelTop - 1) {
        window.scrollBy({ top: panelTop - desiredPanelTop, behavior: 'auto' })
      }
    }

    const targetRect = target.getBoundingClientRect()
    const containerRect = scrollContainer.getBoundingClientRect()
    // Click navigation has fixed clearance; the scrollspy's viewport fraction
    // only decides which section is active and must not position anchor jumps.
    const top =
      scrollContainer.scrollTop + targetRect.top - containerRect.top - anchorOffset

    await goto(`#${id}`, { replace: true, reset: false, shallow: true, state: {} })
    scrollContainer.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })

    return
  }

  await goto(`#${id}`, { replace: true, reset: false, shallow: true, state: {} })

  if (mobile) window.dispatchEvent(new Event('app-header:preserve-visibility'))

  const targetRect = target.getBoundingClientRect()
  const pageSectionTop =
    window.scrollY +
    targetRect.top -
    (controls ? releaseNavControlsBottom(controls) : 0) -
    anchorOffset
  const footer = document.querySelector<HTMLElement>('[data-site-footer]')
  // Document-flow tabs have no trailing reading-panel space. Stop before the
  // site footer enters the viewport rather than pushing the sidebar offscreen.
  const lastContentScrollTop = footer
    ? window.scrollY + footer.getBoundingClientRect().top - window.innerHeight
    : Number.POSITIVE_INFINITY
  window.scrollTo({
    top: Math.max(0, Math.min(lastContentScrollTop, pageSectionTop)),
    behavior: 'smooth',
  })
  window.dispatchEvent(new Event('release-nav:anchor'))
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

/** Shared by document-flow Stats, Audit, Sources and other release tabs. */
export function getReleaseNavDocumentActive(targets: HTMLElement[]) {
  const first = targets[0]
  if (!first) return null
  const controls = document.querySelector<HTMLElement>('[data-release-nav-controls]')
  const top = controls ? releaseNavControlsBottom(controls) : 0
  const active =
    [...targets]
      .reverse()
      .find(target => target.getBoundingClientRect().top <= top + 25) ?? first
  const footer = document.querySelector<HTMLElement>('[data-site-footer]')
  if (
    footer &&
    Math.abs(footer.getBoundingClientRect().top - window.innerHeight) <= 2
  ) {
    const selected = targets.find(target => `#${target.id}` === window.location.hash)
    const last = targets.at(-1)
    const candidate =
      selected && selected.getBoundingClientRect().top >= top ? selected : last
    if (candidate && candidate.getBoundingClientRect().top < window.innerHeight)
      return candidate.id
  }
  return active.id
}

export const observeReleaseNavOutline = (
  items: ReleaseNavOutlineItem[],
  onActive: (id: string | null) => void,
) => {
  let disposed = false
  let observer: IntersectionObserver | undefined
  let mutationObserver: MutationObserver | undefined
  let targets: HTMLElement[] = []

  const update = () => {
    const active = getReleaseNavDocumentActive(targets)
    if (active) onActive(active)
  }

  const observeTargets = () => {
    targets = items
      .map(item => document.getElementById(item.id))
      .filter((target): target is HTMLElement => target !== null)

    if (!targets.length) return false

    observer = new IntersectionObserver(update, {
      rootMargin: releaseNavActivationRootMargin,
    })
    for (const target of targets) observer.observe(target)
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('release-nav:anchor', update)
    update()
    return true
  }

  void tick().then(() => {
    if (disposed) return

    if (observeTargets()) return

    mutationObserver = new MutationObserver(() => {
      if (!disposed && observeTargets()) mutationObserver?.disconnect()
    })
    mutationObserver.observe(
      document.querySelector('[data-release-nav-content-panel]') ?? document.body,
      { childList: true, subtree: true },
    )
  })

  return () => {
    disposed = true
    observer?.disconnect()
    mutationObserver?.disconnect()
    window.removeEventListener('scroll', update)
    window.removeEventListener('release-nav:anchor', update)
  }
}
