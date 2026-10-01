import type { Position } from 'geojson'

export function nodesInRectangle(
  points: { x: number; y: number }[],
  start: { x: number; y: number },
  end: { x: number; y: number },
): Set<number> {
  return new Set(
    points.flatMap((p, i) =>
      p.x >= Math.min(start.x, end.x) &&
      p.x <= Math.max(start.x, end.x) &&
      p.y >= Math.min(start.y, end.y) &&
      p.y <= Math.max(start.y, end.y)
        ? [i]
        : [],
    ),
  )
}
export function removeSelectedNodes(
  vertices: Position[],
  selected: Set<number>,
): Position[] {
  const remaining = vertices.filter((_, i) => !selected.has(i))
  if (remaining.length < 3)
    throw Error('A polygon needs at least three vertices. Select fewer nodes.')
  return remaining.map(p => [...p])
}

/** A pointer-capturing overlay prevents selection drags from editing or panning the map. */
export function createNodeRectangle(
  container: HTMLElement,
  selected: (
    start: { x: number; y: number },
    end: { x: number; y: number },
    additive: boolean,
  ) => void,
) {
  const overlay = document.createElement('div'),
    rectangle = document.createElement('div')
  overlay.className = 'node-selection-overlay'
  overlay.hidden = true
  overlay.setAttribute('aria-label', 'Drag a rectangle to select boundary nodes')
  rectangle.className = 'node-selection-rectangle'
  rectangle.hidden = true
  overlay.append(rectangle)
  container.append(overlay)
  let start: { x: number; y: number } | null = null
  let additive = false
  const point = (event: PointerEvent) => {
    const bounds = container.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }
  const reset = () => {
    start = null
    rectangle.hidden = true
  }
  overlay.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    additive = event.shiftKey
    start = point(event)
    overlay.setPointerCapture(event.pointerId)
    Object.assign(rectangle.style, {
      left: `${start.x}px`,
      top: `${start.y}px`,
      width: '0px',
      height: '0px',
    })
    rectangle.hidden = false
  })
  overlay.addEventListener('pointermove', event => {
    if (!start) return
    const end = point(event)
    Object.assign(rectangle.style, {
      left: `${Math.min(start.x, end.x)}px`,
      top: `${Math.min(start.y, end.y)}px`,
      width: `${Math.abs(end.x - start.x)}px`,
      height: `${Math.abs(end.y - start.y)}px`,
    })
  })
  overlay.addEventListener('pointerup', event => {
    if (!start) return
    const origin = start,
      end = point(event)
    reset()
    if (overlay.hasPointerCapture(event.pointerId))
      overlay.releasePointerCapture(event.pointerId)
    selected(origin, end, additive || event.shiftKey)
  })
  overlay.addEventListener('pointercancel', reset)
  overlay.addEventListener('lostpointercapture', reset)
  for (const name of ['click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup'])
    overlay.addEventListener(name, event => {
      event.preventDefault()
      event.stopPropagation()
    })
  return {
    setActive(active: boolean) {
      reset()
      overlay.hidden = !active
    },
  }
}
