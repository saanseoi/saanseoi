import type { Shape } from './schema'
import { MAX_OBJECT_BYTES } from './objects'

const text: Shape = { type: 'string', pattern: '\\S' }
const string: Shape = { type: 'string' }
const count: Shape = { type: 'integer', minimum: 0 }
const array = (items: Shape): Shape => ({ type: 'array', items })
const object = (properties: Record<string, Shape>, optional: string[] = []): Shape => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter(key => !optional.includes(key)),
  additionalProperties: false,
})
const ref = object({
  hash: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
  byteLength: { type: 'integer', minimum: 1, maximum: MAX_OBJECT_BYTES },
})
const fixtures = array(object({ type: text, object: ref }))
const counts: Shape = { type: 'object', additionalProperties: count }
const basis: Shape = { enum: ['code', 'fixture'] }
export const auditGuardSchema = object({
  id: text,
  summary: text,
  consequence: { enum: ['block-ingestion', 'report'] },
  status: { enum: ['passed', 'failed', 'not-applicable', 'not-run'] },
  checked: count,
  failed: count,
  reason: string,
})
export const ruleDeclarationSchema = object({
  kind: { const: 'processing-rule' },
  schemaVersion: { const: 1 },
  id: text,
  scope: { enum: ['bulk', 'individual'] },
  basis,
  summary: text,
  inputs: array(text),
  outputs: array(text),
  parameters: { type: 'object' },
  implementation: object({ path: text, symbol: text, revision: text }, ['revision']),
})
export const individualAuditSchema = object({
  id: text,
  operation: text,
  basis,
  outcome: { enum: ['applied', 'no-change', 'unmatched', 'skipped', 'guard-mismatch'] },
  summary: text,
  reason: text,
  definition: ref,
  fixture: {
    anyOf: [
      object({
        object: ref,
        pointer: { type: 'string', pattern: '^(|(/([^~]|~[01])*)+)$' },
      }),
      { type: 'null' },
    ],
  },
  record: object({
    id: text,
    names: array(text),
    parents: array(object({ id: text, names: array(text) })),
  }),
  context: { type: 'object' },
})
export const auditManifestSchema = object(
  {
    kind: { const: 'processing-audit' },
    schemaVersion: { const: 1 },
    releaseId: text,
    datasetCode: text,
    attempt: object({ id: text, status: { enum: ['completed', 'failed'] } }),
    bulk: array(
      object(
        {
          id: text,
          definition: ref,
          basis,
          summary: text,
          outcome: { enum: ['applied', 'not-applicable', 'not-run'] },
          counts: object({
            inputs: counts,
            outputs: counts,
            recordsAffected: count,
            decisions: counts,
          }),
          fixtures,
          search: ref,
        },
        ['search'],
      ),
    ),
    guards: array(auditGuardSchema),
    individualFixtures: fixtures,
    apiFields: ref,
    chunks: array(
      object({
        hash: ref.properties!.hash!,
        byteLength: ref.properties!.byteLength!,
        firstOrdinal: count,
        count: { type: 'integer', minimum: 1, maximum: 256 },
        index: ref,
      }),
    ),
    applicationCount: count,
  },
  ['individualFixtures', 'apiFields'],
)
export const auditObjectSchemas = [
  auditManifestSchema,
  ruleDeclarationSchema,
  object({
    kind: { const: 'individual-actions' },
    schemaVersion: { const: 1 },
    actions: { ...array(individualAuditSchema), maxItems: 256 },
  }),
  object({
    kind: { const: 'individual-search' },
    schemaVersion: { const: 1 },
    entries: array(object({ id: text, text: string })),
  }),
  object({ kind: { const: 'bulk-search' }, schemaVersion: { const: 1 }, text: string }),
]
