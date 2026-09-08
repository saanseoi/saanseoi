import type { IndividualAudit, Json } from '@repo/core/provenance'

/** Presentation follows available evidence, independently of the active list filter. */
export function auditApplicationComparison(
  row: IndividualAudit,
): { input: Json; output: Json } | null {
  const context = row.context
  const inputKey = Object.hasOwn(context, 'expected') ? 'expected' : 'input'
  const outputKey = Object.hasOwn(context, 'replacement') ? 'replacement' : 'output'
  if (
    row.review?.kind !== 'patch' &&
    !(Object.hasOwn(context, inputKey) && Object.hasOwn(context, outputKey))
  )
    return null
  return { input: context[inputKey] ?? null, output: context[outputKey] ?? null }
}
