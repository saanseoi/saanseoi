import { MAX_OBJECT_BYTES } from './objects'
import { requireDefined } from '../requireDefined'
import { auditObjectSchemas } from './auditSchema'
/** Published JSON Schema and structural validator share these definitions. */
export type Shape = {
  type?: 'object' | 'array' | 'string' | 'integer' | 'null'
  properties?: Record<string, Shape>
  required?: string[]
  additionalProperties?: false | Shape
  items?: Shape
  anyOf?: Shape[]
  const?: string | number
  enum?: string[]
  pattern?: string
  minimum?: number
  maximum?: number
  maxItems?: number
}
const string: Shape = { type: 'string', pattern: '\\S' }
const jsonPointer: Shape = { type: 'string', pattern: '^(|(/([^~]|~[01])*)+)$' }
const digest: Shape = { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }
const integer: Shape = { type: 'integer', minimum: 0 }
const version: Shape = { type: 'integer', minimum: 1 }
const array = (items: Shape): Shape => ({ type: 'array', items })
const object = (properties: Record<string, Shape>, optional: string[] = []): Shape => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter(key => !optional.includes(key)),
  additionalProperties: false,
})
const nullable = (schema: Shape): Shape => ({ anyOf: [schema, { type: 'null' }] })
const reference = {
  hash: digest,
  byteLength: { ...version, maximum: MAX_OBJECT_BYTES },
}
const key = { collection: string, id: string }
const field = object({ collection: string, path: jsonPointer })
const outcome: Shape = { enum: ['applied', 'no-change', 'guard-mismatch', 'deferred'] }
export const applicationSchema = object({
  schemaVersion: { const: 1 },
  kind: { const: 'processing-application' },
  id: string,
  operation: string,
  operationVersion: version,
  outcome,
  summary: string,
  reason: string,
  decision: object({
    id: string,
    revision: version,
    origin: { enum: ['human', 'rule', 'model'] },
    review: { enum: ['approved', 'unreviewed'] },
    definition: object(reference),
  }),
  inputs: array(object({ ...key, hash: digest })),
  effects: array(
    object({
      target: object(key),
      before: nullable(digest),
      after: nullable(object({ ...reference, pointer: jsonPointer }, ['pointer'])),
    }),
  ),
  evidence: array(
    object({ object: object(reference), role: string, pointer: jsonPointer }),
  ),
  fields: array(
    object({ output: field, inputs: array(field), apiFields: array(string) }),
  ),
})
export const collectionSchema = object({
  id: string,
  layer: { enum: ['source', 'canonical'] },
  datasetCode: string,
  releaseId: string,
  snapshotId: nullable(string),
  schema: string,
})
export const manifestSchema = object({
  schemaVersion: { const: 1 },
  kind: { const: 'processing-result' },
  releaseId: string,
  collections: array(collectionSchema),
  chunks: array(
    object({
      ...reference,
      firstOrdinal: integer,
      count: { ...version, maximum: 256 },
    }),
  ),
  applicationCount: integer,
  summaries: array(
    object({
      operation: string,
      outcome,
      applicationCount: version,
      effectCount: integer,
    }),
  ),
})
export const provenanceSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'SaanSeoi retained processing provenance v1',
  oneOf: [
    ...auditObjectSchemas,
    applicationSchema,
    manifestSchema,
    object({
      schemaVersion: { const: 1 },
      kind: { const: 'processing-applications' },
      applications: { ...array(applicationSchema), maxItems: 256 },
    }),
    object({
      schemaVersion: { const: 1 },
      kind: { const: 'processing-values' },
      values: array({ type: 'object' }),
    }),
  ],
}

export function validateShape(value: unknown, shape: Shape, path = '$'): void {
  const invalid = () => {
    throw new Error(`Invalid provenance structure at ${path}.`)
  }
  if (shape.anyOf) {
    for (const option of shape.anyOf) {
      try {
        validateShape(value, option, path)
        return
      } catch {
        /* Try the next schema. */
      }
    }
    invalid()
  }
  if (shape.const !== undefined && value !== shape.const) invalid()
  if (shape.enum && !shape.enum.includes(value as string)) invalid()
  if (shape.type === 'null' && value !== null) invalid()
  if (shape.type === 'string' && typeof value !== 'string') invalid()
  if (shape.type === 'integer' && !Number.isSafeInteger(value)) invalid()
  if (
    shape.pattern &&
    (typeof value !== 'string' || !new RegExp(shape.pattern).test(value))
  )
    invalid()
  if (
    shape.minimum !== undefined &&
    (typeof value !== 'number' || value < shape.minimum)
  )
    invalid()
  if (
    shape.maximum !== undefined &&
    (typeof value !== 'number' || value > shape.maximum)
  )
    invalid()
  if (shape.type === 'array') {
    if (!Array.isArray(value)) {
      invalid()
      return
    }
    if (shape.maxItems !== undefined && value.length > shape.maxItems) invalid()
    for (const [i, item] of value.entries())
      validateShape(item, requireDefined(shape.items), `${path}[${i}]`)
  }
  if (shape.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      invalid()
      return
    }
    if (!shape.properties) {
      if (typeof shape.additionalProperties === 'object')
        for (const [key, item] of Object.entries(value))
          validateShape(item, shape.additionalProperties, `${path}.${key}`)
      return
    }
    const row = value as Record<string, unknown>
    if (shape.required?.some(key => !Object.hasOwn(row, key))) invalid()
    for (const key of Object.keys(row)) {
      const properties = requireDefined(shape.properties)
      const child = Object.hasOwn(properties, key) ? properties[key] : undefined
      if (!child) {
        invalid()
        return
      }
      validateShape(row[key], child, `${path}.${key}`)
    }
  }
}
