function intrinsicListHeight(list: HTMLElement) {
  const style = getComputedStyle(list)
  const children = Array.from(list.children)
  return (
    children.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) +
    Math.max(0, children.length - 1) * (parseFloat(style.rowGap) || 0) +
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0)
  )
}

/** Fit the sticky sidebar below the controls, sharing spare space between lists. */
export function fitReleaseNavSidebar(node: HTMLElement) {
  const controls = node.parentElement?.previousElementSibling
  let versions: HTMLElement | null = null
  let domains: HTMLElement | null = null
  let frame = 0

  function measure() {
    frame = 0
    if (!node.getClientRects().length || !versions) return

    // Use the row's document position, not the moving sticky controls. Changing
    // height on scroll fights native sticky positioning and scroll anchoring.
    const top = Math.max(
      112,
      (node.parentElement?.getBoundingClientRect().top ?? 112) + window.scrollY,
    )
    const height = Math.max(0, window.innerHeight - top - 24)
    node.style.height = `${height}px`

    if (!domains) return
    const versionHeight = intrinsicListHeight(versions)
    const domainNav = domains.querySelector('nav')
    if (!domainNav) return
    const domainHeight =
      intrinsicListHeight(domainNav) +
      domainNav.getBoundingClientRect().top -
      domains.getBoundingClientRect().top
    const half = height / 2
    const versionBudget =
      domainHeight <= half
        ? height - domainHeight
        : versionHeight <= half
          ? versionHeight
          : half
    node.style.setProperty('--release-version-height', `${versionBudget}px`)
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure)
  }

  const resize = new ResizeObserver(schedule)
  function observeContents() {
    resize.disconnect()
    versions = node.querySelector<HTMLElement>('[data-release-nav-version-list]')
    domains = node.querySelector<HTMLElement>('[data-release-nav-domains]')
    if (controls) resize.observe(controls)
    if (versions) {
      resize.observe(versions)
      for (const child of versions.children) resize.observe(child)
    }
    if (domains) {
      for (const child of domains.querySelectorAll('h2, nav > *')) resize.observe(child)
    }
    schedule()
  }
  const mutation = new MutationObserver(observeContents)
  mutation.observe(node, { childList: true, subtree: true })
  window.addEventListener('resize', schedule)
  observeContents()

  return {
    destroy() {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', schedule)
    },
  }
}
