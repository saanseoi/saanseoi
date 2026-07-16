<script lang="ts">
type CoastlinePath = { d: string }
type Point = { x: number; y: number }
type CoastlinePoints = [Point, Point, ...Point[]]

type Props = {
  paths: readonly CoastlinePath[]
}

let { paths }: Props = $props()

const mapWidth = 1200
const mapHeight = 760
const mapPerimeter = 2 * (mapWidth + mapHeight)
const pointPattern = /[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g

const getPoints = (path: CoastlinePath): Point[] =>
  Array.from(path.d.matchAll(pointPattern), ([, x, y]) => ({
    x: Number(x),
    y: Number(y),
  }))

const firstPoint = (points: CoastlinePoints) => points[0]
const lastPoint = (points: CoastlinePoints) => {
  const point = points.at(-1)
  if (!point) throw new Error('Coastline must have an endpoint')

  return point
}
const pointKey = ({ x, y }: Point) => `${x},${y}`
const toPath = (points: Point[]) =>
  points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
const isOutsideMap = ({ x, y }: Point) =>
  x < 0 || x > mapWidth || y < 0 || y > mapHeight
const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max)

const projectToBoundary = ({ x, y }: Point): Point => {
  const distances = [
    Math.abs(y),
    Math.abs(mapWidth - x),
    Math.abs(mapHeight - y),
    Math.abs(x),
  ]
  const edge = distances.indexOf(Math.min(...distances))

  if (edge === 0) return { x: clamp(x, mapWidth), y: 0 }
  if (edge === 1) return { x: mapWidth, y: clamp(y, mapHeight) }
  if (edge === 2) return { x: clamp(x, mapWidth), y: mapHeight }

  return { x: 0, y: clamp(y, mapHeight) }
}

const boundaryPosition = ({ x, y }: Point) => {
  if (y === 0) return x
  if (x === mapWidth) return mapWidth + y
  if (y === mapHeight) return mapWidth + mapHeight + (mapWidth - x)

  return 2 * mapWidth + mapHeight + (mapHeight - y)
}

const boundaryPoint = (position: number): Point => {
  const point = (position + mapPerimeter) % mapPerimeter

  if (point <= mapWidth) return { x: point, y: 0 }
  if (point <= mapWidth + mapHeight) return { x: mapWidth, y: point - mapWidth }
  if (point <= 2 * mapWidth + mapHeight)
    return { x: 2 * mapWidth + mapHeight - point, y: mapHeight }

  return { x: 0, y: mapPerimeter - point }
}

const clockwiseBoundaryPath = (from: Point, to: Point) => {
  const start = boundaryPosition(from)
  const end = boundaryPosition(to)
  const destination = end < start ? end + mapPerimeter : end
  const corners = [
    mapWidth,
    mapWidth + mapHeight,
    2 * mapWidth + mapHeight,
    mapPerimeter,
  ]
    .map(corner => (corner <= start ? corner + mapPerimeter : corner))
    .filter(corner => corner < destination)
    .sort((first, second) => first - second)
    .map(boundaryPoint)

  return [...corners, to]
}

const longBoundaryPath = (from: Point, to: Point) => {
  const clockwiseDistance =
    (boundaryPosition(to) - boundaryPosition(from) + mapPerimeter) % mapPerimeter

  if (clockwiseDistance >= mapPerimeter / 2) return clockwiseBoundaryPath(from, to)

  return clockwiseBoundaryPath(to, from).reverse()
}

const landShapePath = $derived.by(() => {
  const fragments = paths
    .map(getPoints)
    .filter((points): points is CoastlinePoints => points.length > 1)
  const endpointCounts = new Map<string, number>()
  const fragmentAt = (index: number) => {
    const fragment = fragments[index]
    if (!fragment) throw new Error('Missing coastline fragment')

    return fragment
  }

  for (const points of fragments) {
    for (const point of [firstPoint(points), lastPoint(points)]) {
      const key = pointKey(point)
      endpointCounts.set(key, (endpointCounts.get(key) ?? 0) + 1)
    }
  }

  const remaining = new Set(fragments.keys())
  const outlines: string[] = []

  while (remaining.size) {
    const fallback = [...remaining][0]
    if (fallback === undefined) break

    const first =
      [...remaining].find(index => {
        const points = fragmentAt(index)
        return (
          endpointCounts.get(pointKey(firstPoint(points))) === 1 ||
          endpointCounts.get(pointKey(lastPoint(points))) === 1
        )
      }) ?? fallback
    let outline: CoastlinePoints = [...fragmentAt(first)]
    remaining.delete(first)

    if (
      endpointCounts.get(pointKey(firstPoint(outline))) !== 1 &&
      endpointCounts.get(pointKey(lastPoint(outline))) === 1
    )
      outline.reverse()

    while (true) {
      const end = pointKey(lastPoint(outline))
      const next = [...remaining].find(index => {
        const points = fragmentAt(index)
        return (
          pointKey(firstPoint(points)) === end || pointKey(lastPoint(points)) === end
        )
      })
      if (next === undefined) break

      const points = fragmentAt(next)
      outline.push(
        ...(pointKey(firstPoint(points)) === end
          ? points.slice(1)
          : [...points].reverse().slice(1)),
      )
      remaining.delete(next)
    }

    const start = firstPoint(outline)
    const end = lastPoint(outline)
    const isClosed = pointKey(start) === pointKey(end)

    if (isClosed) outlines.push(toPath(outline))
    else if (isOutsideMap(start) && isOutsideMap(end)) {
      const boundaryStart = projectToBoundary(start)
      const boundaryEnd = projectToBoundary(end)
      outlines.push(
        toPath([
          ...outline,
          boundaryEnd,
          ...longBoundaryPath(boundaryEnd, boundaryStart),
          start,
        ]),
      )
    }
  }

  return outlines.join(' ')
})
</script>

<path
  d={landShapePath}
  class="fill-(--foundation-map-land)"
  fill-rule="evenodd"
  clip-rule="evenodd"
  aria-hidden="true"
/>

<g
  class="fill-none stroke-secondary opacity-64 [stroke-linecap:round] [stroke-linejoin:round] stroke-[0.925]"
  filter="url(#harbour-glow)"
  aria-hidden="true"
>
  {#each paths as path}
    <path d={path.d} />
  {/each}
</g>
