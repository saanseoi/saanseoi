import type { Map as MapLibreMap } from 'maplibre-gl'
import type { CameraState } from './types'

type SplitTouchPointer = {
  map: MapLibreMap
  x: number
  y: number
}

type SplitTouchGesture = {
  pointers: readonly [number, number]
  initialCamera: CameraState
  initialDistance: number
}

export type SplitTouchBridgeOptions = {
  canBridge: () => boolean
  getPrimaryMap: () => MapLibreMap | null
  getComparisonMap: () => MapLibreMap | null
  getCamera: (target: MapLibreMap) => CameraState
  maxZoom: number
}

/** Bridges a pinch whose fingers land on separate split-comparison canvases. */
export function installSplitTouchBridge(options: SplitTouchBridgeOptions): () => void {
  const pointers = new Map<number, SplitTouchPointer>()
  let gesture: SplitTouchGesture | null = null

  const start = (event: TouchEvent) => {
    if (!options.canBridge()) {
      pointers.clear()
      gesture = null
      return
    }
    for (let index = 0; index < event.changedTouches.length; index += 1) {
      const touch = event.changedTouches[index]
      if (!touch) continue
      const target = mapForTouchTarget(touch.target, options)
      if (!target) continue
      pointers.set(touch.identifier, {
        map: target,
        x: touch.clientX,
        y: touch.clientY,
      })
    }
    const primary = options.getPrimaryMap()
    if (gesture || !primary) return

    const entries = [...pointers.entries()]
    const first = entries.at(-2)
    const second = entries.at(-1)
    if (!first || !second || first[1].map === second[1].map) return
    const initialDistance = distance(first[1], second[1])
    if (initialDistance === 0) return
    gesture = {
      pointers: [first[0], second[0]],
      initialCamera: options.getCamera(primary),
      initialDistance,
    }
    stopEvent(event)
  }
  const move = (event: TouchEvent) => {
    const primary = options.getPrimaryMap()
    if (!gesture || !options.canBridge() || !primary) return
    for (let index = 0; index < event.changedTouches.length; index += 1) {
      const touch = event.changedTouches[index]
      if (!touch) continue
      const pointer = pointers.get(touch.identifier)
      if (!pointer) continue
      pointer.x = touch.clientX
      pointer.y = touch.clientY
    }
    const [firstId, secondId] = gesture.pointers
    const first = pointers.get(firstId)
    const second = pointers.get(secondId)
    if (!first || !second) return
    const currentDistance = distance(first, second)
    if (currentDistance === 0) return
    const zoom = Math.min(
      options.maxZoom,
      Math.max(
        0,
        gesture.initialCamera.zoom +
          Math.log2(currentDistance / gesture.initialDistance),
      ),
    )
    primary.jumpTo({ ...gesture.initialCamera, zoom })
    stopEvent(event)
  }
  const end = (event: TouchEvent) => {
    for (let index = 0; index < event.changedTouches.length; index += 1) {
      const touch = event.changedTouches[index]
      if (touch) pointers.delete(touch.identifier)
    }
    if (gesture?.pointers.some(identifier => !pointers.has(identifier))) gesture = null
  }
  const moveOptions = { capture: true, passive: false }
  const endOptions = { capture: true }
  document.addEventListener('touchstart', start, moveOptions)
  document.addEventListener('touchmove', move, moveOptions)
  document.addEventListener('touchend', end, endOptions)
  document.addEventListener('touchcancel', end, endOptions)
  return () => {
    document.removeEventListener('touchstart', start, moveOptions)
    document.removeEventListener('touchmove', move, moveOptions)
    document.removeEventListener('touchend', end, endOptions)
    document.removeEventListener('touchcancel', end, endOptions)
    pointers.clear()
    gesture = null
  }
}

function mapForTouchTarget(
  target: EventTarget | null,
  options: SplitTouchBridgeOptions,
): MapLibreMap | null {
  if (!(target instanceof Node)) return null
  const primary = options.getPrimaryMap()
  const comparison = options.getComparisonMap()
  if (primary?.getContainer().contains(target)) return primary
  if (comparison?.getContainer().contains(target)) return comparison
  return null
}

function distance(first: SplitTouchPointer, second: SplitTouchPointer): number {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function stopEvent(event: TouchEvent): void {
  if (event.cancelable) event.preventDefault()
  event.stopImmediatePropagation()
}
