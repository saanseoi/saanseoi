import { z } from '@hono/zod-openapi'

export const SourceAttributionSchema = z
  .strictObject({
    property: z
      .string()
      .regex(/^(?:\/(?:[^~/]|~[01])*)*$/)
      .nullable()
      .optional(),
    publisherCode: z.string().min(1),
    upstreamOf: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Direct publisher through which this source was inherited; omitted for direct sources.',
      ),
    dataset: z.string().min(1),
    recordId: z.string().optional(),
    updateTime: z.string().optional(),
    version: z.string().optional().describe('Publisher-supplied record version.'),
    confidence: z.number().min(0).max(1).optional(),
    license: z.string().optional(),
  })
  .openapi('SourceAttribution', {
    description:
      'An upstream publisher and dataset reference. The optional property is an upstream RFC 6901 JSON Pointer; absent, null or empty applies to the whole record. More specific attribution takes precedence.',
  })

export const SourcesSchema = z.array(SourceAttributionSchema).openapi('Sources')
export type SourcesPayload = z.infer<typeof SourcesSchema>
