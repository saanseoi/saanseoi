import type { Position } from 'geojson'

/** Match one continuous road polyline, retaining its bends and the source chain's nodes. */
export function matchRoadChain(
  points: Position[],
  line: Position[],
  tolerance = 5,
): Position[][] | null {
  const sx = 111320 * Math.cos((points[0]![1]! * Math.PI) / 180),
    sy = 110574
  const project = (p: Position, a: Position, b: Position) => {
    const dx = (b[0]! - a[0]!) * sx,
      dy = (b[1]! - a[1]!) * sy
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0]! - a[0]!) * sx * dx + (p[1]! - a[1]!) * sy * dy) / (dx * dx + dy * dy) ||
          0,
      ),
    )
    const position = [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t]
    return {
      t,
      position,
      distance: Math.hypot((p[0]! - position[0]!) * sx, (p[1]! - position[1]!) * sy),
    }
  }
  if (line.length < 2) return null
  const projected = points.map(p => {
    let best = { at: 0, position: line[0]!, distance: Infinity }
    for (let i = 1; i < line.length; i++) {
      const candidate = project(p, line[i - 1]!, line[i]!)
      if (candidate.distance < best.distance)
        best = { ...candidate, at: i - 1 + candidate.t }
    }
    return best
  })
  // Shared junctions remain fixed; moving them requires coordinated junction matching.
  if (projected[0]!.distance > 0.00001 || projected.at(-1)!.distance > 0.00001)
    return null
  const direction = Math.sign(projected.at(-1)!.at - projected[0]!.at)
  if (
    !direction ||
    projected.some(
      (p, i) =>
        p.distance > tolerance ||
        (i > 0 && (p.at - projected[i - 1]!.at) * direction <= 0),
    )
  )
    return null
  const edges: Position[][] = []
  for (let i = 1; i < projected.length; i++) {
    const a = projected[i - 1]!,
      b = projected[i]!
    const bends = line
      .map((position, at) => ({ position, at }))
      .filter(p => p.at > Math.min(a.at, b.at) && p.at < Math.max(a.at, b.at))
    if (direction < 0) bends.reverse()
    // Reject roads that detour far away between two otherwise close endpoints.
    if (
      bends.some(
        p => project(p.position, points[i - 1]!, points[i]!).distance > tolerance,
      )
    )
      return null
    edges.push([
      i === 1 ? points[0]! : a.position,
      ...bends.map(p => p.position),
      i === projected.length - 1 ? points.at(-1)! : b.position,
    ])
  }
  return edges
}
