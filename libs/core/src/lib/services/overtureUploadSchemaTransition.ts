import {
  resolveSourceRecordSchema,
  type SourceRecordSchemaField,
} from '../../sourceRecordSchemas'
import type { DatasetRecord, UploadPlan } from '../../types'

type Release = Pick<
  DatasetRecord,
  'datasetCode' | 'source' | 'sourceVersion' | 'resourceType'
>
type Plan = Pick<
  UploadPlan,
  'datasetCode' | 'source' | 'sourceVersion' | 'resourceType'
>

function sameFields(
  actual: SourceRecordSchemaField[],
  expected: SourceRecordSchemaField[],
) {
  const fields = new Map(actual.map(field => [field.name, field]))
  return (
    actual.length === expected.length &&
    fields.size === actual.length &&
    expected.every(field => {
      const found = fields.get(field.name)
      return found?.type === field.type && found.nullable === field.nullable
    })
  )
}

/** Accept only the reviewed October physical nullability transition for the same dataset. */
export function matchesOctoberOvertureSchemaTransition(
  previous: Release,
  next: Plan,
  previousFields: SourceRecordSchemaField[] | null,
  nextFields: SourceRecordSchemaField[],
) {
  if (
    previous.source !== 'overture' ||
    next.source !== 'overture' ||
    previous.datasetCode !== next.datasetCode ||
    previous.resourceType !== next.resourceType ||
    next.sourceVersion !== '2026-10-21.0' ||
    previous.sourceVersion >= next.sourceVersion ||
    !previousFields
  )
    return false

  const before = resolveSourceRecordSchema({
    ...previous,
    resourceType: next.resourceType,
  })
  const after = resolveSourceRecordSchema(next)
  if (
    !before ||
    !after ||
    !sameFields(previousFields, before.fields) ||
    !sameFields(nextFields, after.fields)
  )
    return false
  const incoming = new Map(after.fields.map(field => [field.name, field]))
  return (
    before.fields.length === after.fields.length &&
    before.fields.every(field => {
      const candidate = incoming.get(field.name)
      return candidate?.type === field.type && (field.nullable || !candidate.nullable)
    })
  )
}
