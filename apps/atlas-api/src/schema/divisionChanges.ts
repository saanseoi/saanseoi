import { divisionChangesReleaseExamples } from './divisionChanges.examples'
import { geographicCodeQueryShape } from './geographicCodeFilters'
import { z } from '@hono/zod-openapi'

const releaseSelector = z.string().trim().min(1).max(200)
export const DivisionChangesQuerySchema = z
  .object({
    ...geographicCodeQueryShape,
    inventory: z.string().min(1).optional(),
    fromReleaseSet: releaseSelector.openapi({
      description: 'Required published geographic division release-set code or ID.',
      example: divisionChangesReleaseExamples['v0.1'].from,
    }),
    toReleaseSet: releaseSelector.optional().openapi({
      description:
        'Published target code or ID. Omission resolves the latest published geographic release once; subsequent pages pin its ID.',
      example: divisionChangesReleaseExamples['v0.1'].to,
    }),
    'page[limit]': z.coerce.number().int().min(1).max(100).default(25),
    include: z.literal('geometry').optional().openapi({
      description:
        'Inline authoritative before/after polygons. Otherwise retrieve them through the content-addressed definition links.',
    }),
    'page[cursor]': z.string().min(1).max(4096).optional(),
  })
  .strict()
export const DivisionChangesV02QuerySchema = DivisionChangesQuerySchema.extend({
  fromReleaseSet: releaseSelector.openapi({
    description:
      'Required geographic release-set code or ID published for Divisions v0.2.',
    example: divisionChangesReleaseExamples['v0.2'].from,
  }),
  toReleaseSet: releaseSelector.optional().openapi({
    description:
      'Target code or ID published for Divisions v0.2. Omission selects the latest published geographic release.',
    example: divisionChangesReleaseExamples['v0.2'].to,
  }),
})
export type DivisionChangesQuery = z.infer<typeof DivisionChangesQuerySchema>

export const DivisionChangedFieldSchema = z.enum([
  'membershipGeometry',
  'hierarchies',
  'hierarchyNames',
  'category',
  'class',
  'level',
  'names',
  'divisionCode',
  'identifiers',
  'geometry',
  'bbox',
  'cartography',
  'sources',
])
export type DivisionChangedField = z.infer<typeof DivisionChangedFieldSchema>
const json = z.unknown()
export const DivisionChangeDefinitionSchema = z.object({
  divisionId: z.string(),
  apiReleaseSetId: z.string(),
  apiReleaseSet: z.string(),
  definitionHash: z.string(),
  record: z.string(),
  geometry: z.string().nullable(),
  attributes: z.record(z.string(), json),
  membershipGeometry: z.array(z.object({ geometry: json })),
})
export const DivisionChangeDefinitionParamsSchema = z.object({
  id: z.string().min(1).max(200),
})
const DivisionChangeReferenceSchema = DivisionChangeDefinitionSchema.extend({
  membershipGeometry:
    DivisionChangeDefinitionSchema.shape.membershipGeometry.optional(),
})
export const DivisionChangeDefinitionQuerySchema = z
  .object({
    ...geographicCodeQueryShape,
    inventory: z.string().min(1).optional(),
    releaseSet: releaseSelector,
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
const release = z.object({
  id: z.string(),
  code: z.string(),
  cohortKey: z.string().nullable(),
  domainCode: z.string(),
  inventory: z.string().optional(),
  schemaVersion: z.string(),
  rulesetVersion: z.string(),
})
export const DivisionChangesResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      divisionId: z.string(),
      type: z.enum(['addition', 'deletion', 'revision']),
      changedFields: z.array(DivisionChangedFieldSchema),
      canAffectGeocodingMembership: z.boolean(),
      before: DivisionChangeReferenceSchema.nullable(),
      after: DivisionChangeReferenceSchema.nullable(),
      affectedDescendantIds: z.object({
        before: z.array(z.string()),
        after: z.array(z.string()),
      }),
    }),
  ),
  meta: z.object({
    fromApiReleaseSet: release,
    toApiReleaseSet: release,
    comparisonId: z.string(),
    total: z.number(),
    limit: z.number(),
    nextCursor: z.string().nullable(),
    membershipGeometry: z.literal('saanseoi'),
    dependencies: z.literal('transitive-before-and-after'),
    coverage: z.object({
      before: z.object({ divisions: z.number(), withMembershipGeometry: z.number() }),
      after: z.object({ divisions: z.number(), withMembershipGeometry: z.number() }),
    }),
  }),
  links: z.object({ self: z.string(), first: z.string(), next: z.string().nullable() }),
})
export type DivisionChangesResponse = z.infer<typeof DivisionChangesResponseSchema>
export const DivisionChangesErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
})
