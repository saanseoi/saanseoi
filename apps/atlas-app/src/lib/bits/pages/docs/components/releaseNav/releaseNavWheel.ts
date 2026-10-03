/** Scroll the reading panel first, then pass movement beyond its edges to the page. */
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
  if (!panel || !node.contains(panel)) return
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
  let remaining =
    event.deltaY *
    (event.deltaMode === 1
      ? parseFloat(panelStyle.lineHeight) || 16
      : event.deltaMode === 2
        ? panel.clientHeight
        : 1)
  event.preventDefault()

  const before = panel.scrollTop
  panel.scrollTo({ top: before + remaining, behavior: 'instant' })
  remaining -= panel.scrollTop - before
  if (remaining) window.scrollBy({ top: remaining, behavior: 'instant' })
}
