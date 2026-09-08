import { objectKey, validateRef } from './objects'
import type { Application, ProcessingManifest } from './types'

function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Missing provenance text.')
}
function integer(value: number, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new Error('Invalid provenance count/version.')
}
export function pointer(value: string) {
  if (
    typeof value !== 'string' ||
    (value !== '' && !/^(\/(?:[^~]|~[01])*)+$/.test(value))
  )
    throw new Error('Invalid provenance JSON Pointer.')
}
export function validateApplication(value: unknown): asserts value is Application {
  const a = value as Application
  if (!a || a.schemaVersion !== 1 || a.kind !== 'processing-application')
    throw new Error('Unsupported processing application schema.')
  text(a.id)
  text(a.operation)
  text(a.summary)
  text(a.reason)
  integer(a.operationVersion, 1)
  if (!['applied', 'no-change', 'guard-mismatch', 'deferred'].includes(a.outcome))
    throw new Error('Invalid application outcome.')
  text(a.decision.id)
  integer(a.decision.revision, 1)
  validateRef(a.decision.definition)
  if (
    !['human', 'rule', 'model'].includes(a.decision.origin) ||
    !['approved', 'unreviewed'].includes(a.decision.review)
  )
    throw new Error('Invalid decision origin/review.')
  if (
    a.outcome === 'applied' &&
    a.decision.origin !== 'rule' &&
    a.decision.review !== 'approved'
  )
    throw new Error('Human/model decisions require approval before application.')
  if (![a.inputs, a.effects, a.evidence, a.fields].every(Array.isArray))
    throw new Error('Missing provenance arrays.')
  if (a.outcome !== 'applied' && a.effects.length)
    throw new Error('Unapplied decisions cannot have effects.')
  const targets = new Set<string>()
  for (const input of a.inputs) {
    text(input.collection)
    text(input.id)
    objectKey(input.hash)
  }
  for (const effect of a.effects) {
    text(effect.target.collection)
    text(effect.target.id)
    const key = JSON.stringify([effect.target.collection, effect.target.id])
    if (targets.has(key))
      throw new Error('Duplicate effect target within an application.')
    targets.add(key)
    if (effect.before !== null) objectKey(effect.before)
    if (effect.after !== null) {
      validateRef(effect.after)
      if (effect.after.pointer !== undefined) pointer(effect.after.pointer)
    }
    if (effect.before === null && effect.after === null)
      throw new Error('Empty effect.')
  }
  for (const e of a.evidence) {
    validateRef(e.object)
    text(e.role)
    pointer(e.pointer)
  }
  for (const f of a.fields) {
    text(f.output.collection)
    pointer(f.output.path)
    for (const i of f.inputs) {
      text(i.collection)
      pointer(i.path)
    }
    for (const apiField of f.apiFields) text(apiField)
  }
}

export function validateManifest(value: unknown): asserts value is ProcessingManifest {
  const m = value as ProcessingManifest
  if (!m || m.schemaVersion !== 1 || m.kind !== 'processing-result')
    throw new Error('Unsupported processing manifest schema.')
  text(m.releaseId)
  integer(m.applicationCount)
  if (![m.collections, m.chunks, m.summaries].every(Array.isArray))
    throw new Error('Missing manifest arrays.')
  const ids = new Set<string>()
  for (const c of m.collections) {
    text(c.id)
    text(c.datasetCode)
    text(c.releaseId)
    text(c.schema)
    if (ids.has(c.id)) throw new Error('Duplicate collection.')
    ids.add(c.id)
    if (!['source', 'canonical'].includes(c.layer))
      throw new Error('Invalid collection layer.')
    if (c.snapshotId !== null) text(c.snapshotId)
  }
  let count = 0
  for (const chunk of m.chunks) {
    validateRef(chunk)
    integer(chunk.count, 1)
    if (chunk.count > 256 || chunk.firstOrdinal !== count)
      throw new Error('Invalid chunk sequence.')
    count += chunk.count
  }
  if (count !== m.applicationCount)
    throw new Error('Manifest application count mismatch.')
  for (const s of m.summaries) {
    text(s.operation)
    integer(s.applicationCount, 1)
    integer(s.effectCount)
    if (!['applied', 'no-change', 'guard-mismatch', 'deferred'].includes(s.outcome))
      throw new Error('Invalid summary outcome.')
  }
}
