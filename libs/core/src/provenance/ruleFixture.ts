import { serialise } from './objects'
import type { RuleDeclaration } from './auditTypes'
import type { JsonRecord } from './types'

/** Validate JSON declarations while preserving the executor's inferred parameter types. */
export function ruleDeclarationFromFixture<P extends JsonRecord>(fixture: {
  parameters: P
}): RuleDeclaration & { parameters: P } {
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture))
    throw new Error('Invalid processing rule declaration fixture.')
  const value = fixture as unknown as Record<string, unknown>
  const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0
  const strings = (v: unknown) => Array.isArray(v) && v.every(text)
  const implementation = value.implementation as Record<string, unknown> | undefined
  if (
    value.kind !== 'processing-rule' ||
    value.schemaVersion !== 1 ||
    !text(value.id) ||
    !text(value.summary) ||
    !['bulk', 'individual'].includes(String(value.scope)) ||
    !['code', 'fixture'].includes(String(value.basis)) ||
    !strings(value.inputs) ||
    !strings(value.outputs) ||
    !value.parameters ||
    typeof value.parameters !== 'object' ||
    Array.isArray(value.parameters) ||
    !implementation ||
    !text(implementation.path) ||
    !text(implementation.symbol)
  )
    throw new Error('Invalid processing rule declaration fixture.')
  serialise(value)
  return fixture as RuleDeclaration & { parameters: P }
}
