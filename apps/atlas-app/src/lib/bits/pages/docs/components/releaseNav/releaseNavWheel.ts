/** Chain desktop wheel movement through page → reading panel → page. */
export function routeReleaseNavWheel(node: HTMLElement, event: WheelEvent) {
  if (
    event.defaultPrevented ||
    !event.cancelable ||
    event.ctrlKey ||
    event.shiftKey ||
    Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
    !event.deltaY
  )
    return
  const target = event.target
  if (!(target instanceof Element)) return
  const panel = target.closest<HTMLElement>('[data-release-nav-content-body]')
  const controls = node.querySelector<HTMLElement>('[data-release-nav-controls]')
  if (!panel || !controls || !node.contains(panel)) return
  const panelStyle = getComputedStyle(panel)
  // Mobile and document-flow tabs retain native page scrolling.
  if (
    !/auto|scroll/.test(panelStyle.overflowY) ||
    panel.scrollHeight <= panel.clientHeight
  )
    return

  // Leave independently scrollable widgets (code blocks, editors, etc.) alone.
  for (
    let child: Element | null = target;
    child && child !== panel;
    child = child.parentElement
  ) {
    if (
      /auto|scroll/.test(getComputedStyle(child).overflowY) &&
      child.scrollHeight > child.clientHeight
    )
      return
  }
  const stickyTop = parseFloat(getComputedStyle(controls).top)
  if (!Number.isFinite(stickyTop)) return
  const pin = Math.max(0, node.getBoundingClientRect().top + window.scrollY - stickyTop)
  let remaining =
    event.deltaY *
    (event.deltaMode === 1
      ? parseFloat(panelStyle.lineHeight) || 16
      : event.deltaMode === 2
        ? panel.clientHeight
        : 1)
  event.preventDefault()

  // Approach the pinned reading position from either side before scrolling text.
  if (
    (remaining > 0 && window.scrollY < pin) ||
    (remaining < 0 && window.scrollY > pin)
  ) {
    const movement =
      Math.sign(remaining) *
      Math.min(Math.abs(remaining), Math.abs(pin - window.scrollY))
    window.scrollBy({ top: movement, behavior: 'instant' })
    remaining -= movement
  }
  if (Math.abs(window.scrollY - pin) <= 1) {
    const before = panel.scrollTop
    panel.scrollTo({ top: before + remaining, behavior: 'instant' })
    remaining -= panel.scrollTop - before
  }
  if (remaining) window.scrollBy({ top: remaining, behavior: 'instant' })
}
