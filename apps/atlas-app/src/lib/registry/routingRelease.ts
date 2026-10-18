import { z } from 'zod'

const artifact = z.object({
  url: z.string().url(),
  size: z.number().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
const engineSpec = z.object({ version: z.string(), profiles: z.array(z.string()) })
const engine = artifact.extend(engineSpec.shape)
const common = z.object({
  schemaVersion: z.literal(1),
  region: z.enum(['hk', 'mo', 'gba']),
  version: z.string(),
  recipeUrl: z.string().url(),
  rebuildUrl: z.string().url(),
  limitations: z.array(z.string()),
})
const published = common.extend({
  pbf: artifact,
  engines: z.object({ valhalla: engine, graphhopper: engine }),
})
export const routingReleaseSchema = z.discriminatedUnion('status', [
  published.extend({ status: z.literal('available') }),
  published.extend({ status: z.literal('retired') }),
  common.extend({
    status: z.literal('recipe-only'),
    engines: z.object({ valhalla: engineSpec, graphhopper: engineSpec }),
  }),
])
export type RoutingRelease = z.infer<typeof routingReleaseSchema>
