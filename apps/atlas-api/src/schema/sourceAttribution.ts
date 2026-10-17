import { sourcePropertyPathPattern } from '@repo/db'
import { z } from '@hono/zod-openapi'

export const SourceAttributionSchema = z
  .strictObject({
    property: z.string().regex(sourcePropertyPathPattern).nullable().optional(),
    properties: z
      .array(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/))
      .min(1)
      .refine(paths => new Set(paths).size === paths.length)
      .optional()
      .describe('Canonical field paths supplied by this contributor.'),
    publisher: z.string().min(1).describe('Upstream publisher code.'),
    upstreamOf: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Direct publisher through which this source was inherited; omitted for direct sources.',
      ),
    dataset: z.string().min(1).describe('Upstream dataset code.'),
    recordId: z.string().optional().describe('Upstream record identifier.'),
    updateTime: z.string().optional(),
    version: z.string().optional().describe('Publisher-supplied record version.'),
    confidence: z.number().min(0).max(1).optional(),
    license: z.string().optional(),
  })
  .openapi('SourceAttribution', {
    description:
      'An upstream publisher and dataset reference. The optional property is a dot-separated upstream field path (literal dots, slashes and backslashes are backslash-escaped; an empty key is represented by \\e); absent, null or empty applies to the whole record. More specific attribution takes precedence. Optional properties lists canonical field paths supplied by this contributor; it does not reinterpret the upstream property path.',
  })

export const SourcesSchema = z
  .array(SourceAttributionSchema)
  .openapi('Sources')
  .describe(
    'Upstream publisher and dataset references for this record and its properties.',
  )
export type SourcesPayload = z.infer<typeof SourcesSchema>
