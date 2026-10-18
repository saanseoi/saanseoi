import { z } from 'zod'

const artifact = z.object({
  url: z.string().url(),
  size: z.number().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
const engine = artifact.extend({ version: z.string(), profiles: z.array(z.string()) })
export const routingReleaseSchema = z.object({
  schemaVersion: z.literal(1),
  region: z.enum(['hk', 'mo', 'gba']),
  version: z.string(),
  status: z.enum(['available', 'retired']),
  recipeUrl: z.string().url(),
  rebuildUrl: z.string().url(),
  pbf: artifact,
  engines: z.object({ valhalla: engine, graphhopper: engine }),
  limitations: z.array(z.string()),
})
export type RoutingRelease = z.infer<typeof routingReleaseSchema>
