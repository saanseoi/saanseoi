import { z } from '@hono/zod-openapi'
import { containsReviewPoint } from '@repo/core/pipeline/services/divisions/geographicReview.ts'

const position = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
])
const ring = z
  .array(position)
  .min(4)
  .max(256)
  .refine(points => {
    if (points.length < 4) return false
    const first = points[0]!,
      last = points.at(-1)!
    const area = points.slice(1).reduce((sum, point, index) => {
      const previous = points[index]!
      return (
        sum +
        (previous[0] - first[0]) * (point[1] - first[1]) -
        (point[0] - first[0]) * (previous[1] - first[1])
      )
    }, 0)
    return first[0] === last[0] && first[1] === last[1] && Math.abs(area) > 0
  }, 'Footprint rings must be closed and enclose a non-zero area.')
const polygon = z.array(ring).min(1).max(16)
const footprintGeometry = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('Polygon'), coordinates: polygon }).strict(),
    z
      .object({
        type: z.literal('MultiPolygon'),
        coordinates: z.array(polygon).min(1).max(16),
      })
      .strict(),
  ])
  .superRefine((geometry, ctx) => {
    const points =
      geometry.type === 'Polygon'
        ? geometry.coordinates.flat()
        : geometry.coordinates.flat(2)
    const xs = points.map(p => p[0]),
      ys = points.map(p => p[1])
    if (
      points.length > 256 ||
      Math.max(...xs) - Math.min(...xs) > 0.05 ||
      Math.max(...ys) - Math.min(...ys) > 0.05
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Footprints must have at most 256 vertices and span at most 0.05 degrees per axis.',
      })
  })

/** Caller-supplied search constraint, not an authoritative building association. */
export const geocodingFootprint = z
  .string()
  .max(16000)
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Footprint must be GeoJSON geometry JSON.',
      })
      return z.NEVER
    }
  })
  .pipe(footprintGeometry)
export { containsReviewPoint }
