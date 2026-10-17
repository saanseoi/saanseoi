import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'

/** About 0.1 mm in Hong Kong: numerical coincidence, not a drawing correction. */
export const CONTAINMENT_NUMERICAL_TOLERANCE_DEGREES = 1e-9

/** One preparation's expanded parents are reused, never persisted as geometry. */
export function createNumericalContainmentCheck() {
  const expanded = new WeakMap<object, any>()
  return (parent: any, child: any, onTolerated?: () => void): boolean => {
    if (RelateOp.covers(parent, child)) return true
    if (!expanded.has(parent))
      expanded.set(
        parent,
        BufferOp.bufferOp(parent, CONTAINMENT_NUMERICAL_TOLERANCE_DEGREES),
      )
    const covered = RelateOp.covers(expanded.get(parent), child)
    if (covered) onTolerated?.()
    return covered
  }
}
